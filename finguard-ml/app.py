"""
FINGUARD ML — FastAPI inference + training service.

Endpoints:
  GET  /health
  GET  /model-info       — loaded artefacts, feature columns, training timestamp
  GET  /metrics          — saved metrics from last training
  POST /predict          — predict a single transaction (V1..V28, Amount, Time)
  POST /predict/batch    — predict many at once

  GET  /dataset/info     — does data/creditcard.csv exist, size, header preview
  POST /dataset/upload   — multipart upload of creditcard.csv

  POST /retrain          — kick off a background training job (non-blocking)
  GET  /retrain/status   — poll job status + tail of log lines

The Gateway (NestJS) is the only client; CORS is open to localhost dev.
"""

from __future__ import annotations

import csv
import json
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Literal

import joblib
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)
DATASET_PATH = DATA_DIR / "creditcard.csv"

MODELS_DIR = Path(os.environ.get("MODELS_DIR", ROOT / "models"))
LOGREG_PATH = MODELS_DIR / "logreg.joblib"
NN_PATH = MODELS_DIR / "nn.keras"
SCALER_PATH = MODELS_DIR / "scaler.joblib"
METRICS_PATH = MODELS_DIR / "metrics.json"

FEATURE_COLUMNS = [f"V{i}" for i in range(1, 29)] + ["Amount", "Time"]


# ─── Pydantic schemas ──────────────────────────────────────────────────────────


class TransactionFeatures(BaseModel):
    """Raw features matching the Kaggle credit-card fraud dataset."""

    time: float = Field(..., alias="Time")
    amount: float = Field(..., alias="Amount", ge=0)
    v1: float = Field(..., alias="V1")
    v2: float = Field(..., alias="V2")
    v3: float = Field(..., alias="V3")
    v4: float = Field(..., alias="V4")
    v5: float = Field(..., alias="V5")
    v6: float = Field(..., alias="V6")
    v7: float = Field(..., alias="V7")
    v8: float = Field(..., alias="V8")
    v9: float = Field(..., alias="V9")
    v10: float = Field(..., alias="V10")
    v11: float = Field(..., alias="V11")
    v12: float = Field(..., alias="V12")
    v13: float = Field(..., alias="V13")
    v14: float = Field(..., alias="V14")
    v15: float = Field(..., alias="V15")
    v16: float = Field(..., alias="V16")
    v17: float = Field(..., alias="V17")
    v18: float = Field(..., alias="V18")
    v19: float = Field(..., alias="V19")
    v20: float = Field(..., alias="V20")
    v21: float = Field(..., alias="V21")
    v22: float = Field(..., alias="V22")
    v23: float = Field(..., alias="V23")
    v24: float = Field(..., alias="V24")
    v25: float = Field(..., alias="V25")
    v26: float = Field(..., alias="V26")
    v27: float = Field(..., alias="V27")
    v28: float = Field(..., alias="V28")

    model_config = {"populate_by_name": True}

    def as_vector(self) -> np.ndarray:
        d = self.model_dump(by_alias=True)
        return np.array([d[c] for c in FEATURE_COLUMNS], dtype="float32")


class PredictRequest(BaseModel):
    features: TransactionFeatures
    threshold: float = Field(0.5, ge=0.0, le=1.0)
    model: Literal["logreg", "nn", "ensemble"] = "ensemble"


class ModelPrediction(BaseModel):
    model: str
    probability: float
    label: int
    risk_score: int
    decision: Literal["approved", "approved_with_review", "blocked", "pending_manual_review"]


class PredictResponse(BaseModel):
    predictions: list[ModelPrediction]
    primary: ModelPrediction
    threshold: float
    feature_vector_normalised: list[float]
    processing_ms: int


class BatchPredictRequest(BaseModel):
    items: list[TransactionFeatures]
    threshold: float = Field(0.5, ge=0.0, le=1.0)
    model: Literal["logreg", "nn", "ensemble"] = "ensemble"


# ─── Model registry ────────────────────────────────────────────────────────────


class Registry:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.scaler: dict | None = None
        self.logreg = None
        self.nn = None
        self.metrics: dict | None = None
        self.loaded_at: float | None = None
        self.tf_available = False
        self._reload()

    def _reload(self) -> None:
        with self.lock:
            self.scaler = joblib.load(SCALER_PATH) if SCALER_PATH.exists() else None
            self.logreg = joblib.load(LOGREG_PATH) if LOGREG_PATH.exists() else None
            try:
                if NN_PATH.exists():
                    import tensorflow as tf  # noqa: F401
                    from tensorflow.keras.models import load_model

                    self.nn = load_model(NN_PATH)
                    self.tf_available = True
                else:
                    self.nn = None
            except Exception as e:
                print(f"[registry] NN load failed: {e}")
                self.nn = None
                self.tf_available = False
            try:
                self.metrics = (
                    json.loads(METRICS_PATH.read_text(encoding="utf-8"))
                    if METRICS_PATH.exists()
                    else None
                )
            except Exception as e:
                print(f"[registry] metrics.json parse failed: {e}")
                self.metrics = None
            self.loaded_at = time.time() if self.scaler else None

    def reload(self) -> None:
        self._reload()

    def is_ready(self) -> bool:
        return self.scaler is not None and (self.logreg is not None or self.nn is not None)

    def normalise(self, vec: np.ndarray) -> np.ndarray:
        if self.scaler is None:
            raise RuntimeError("scaler not loaded; train models first")
        mean = np.array([self.scaler["mean"][c] for c in FEATURE_COLUMNS], dtype="float32")
        std = np.array([self.scaler["std"][c] for c in FEATURE_COLUMNS], dtype="float32")
        std = np.where(std == 0, 1.0, std)
        return (vec - mean) / std


REG = Registry()


# ─── Training-job manager (background thread) ──────────────────────────────────


class TrainJob:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.id: str | None = None
        self.status: Literal["idle", "running", "success", "error"] = "idle"
        self.skip_nn: bool = False
        self.started_at: float | None = None
        self.finished_at: float | None = None
        self.return_code: int | None = None
        self.error: str | None = None
        self.logs: deque[str] = deque(maxlen=400)
        self._thread: threading.Thread | None = None

    def snapshot(self) -> dict:
        with self.lock:
            elapsed = (
                (self.finished_at or time.time()) - self.started_at
                if self.started_at
                else 0.0
            )
            return {
                "id": self.id,
                "status": self.status,
                "skip_nn": self.skip_nn,
                "started_at": self.started_at,
                "finished_at": self.finished_at,
                "elapsed_seconds": round(elapsed, 2),
                "return_code": self.return_code,
                "error": self.error,
                "logs": list(self.logs),
            }

    def start(self, skip_nn: bool) -> dict:
        with self.lock:
            if self.status == "running":
                raise HTTPException(409, detail="Another training job is already running")
            self.id = uuid.uuid4().hex
            self.status = "running"
            self.skip_nn = skip_nn
            self.started_at = time.time()
            self.finished_at = None
            self.return_code = None
            self.error = None
            self.logs.clear()
            self.logs.append(f"[job {self.id}] starting (skip_nn={skip_nn})")

        t = threading.Thread(target=self._run, daemon=True)
        self._thread = t
        t.start()
        return self.snapshot()

    def _run(self) -> None:
        if not DATASET_PATH.exists():
            with self.lock:
                self.status = "error"
                self.error = (
                    f"Dataset not found at {DATASET_PATH}. "
                    "Upload creditcard.csv via POST /dataset/upload."
                )
                self.logs.append(self.error)
                self.finished_at = time.time()
            return

        cmd = [sys.executable, "-u", str(ROOT / "train.py")]
        if self.skip_nn:
            cmd.append("--skip-nn")

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
                cwd=str(ROOT),
                env={**os.environ, "PYTHONUNBUFFERED": "1"},
            )
            assert proc.stdout is not None
            for line in proc.stdout:
                clean = line.rstrip("\n")
                with self.lock:
                    self.logs.append(clean)
            proc.wait()
            with self.lock:
                self.return_code = proc.returncode
                self.status = "success" if proc.returncode == 0 else "error"
                if proc.returncode != 0 and not self.error:
                    self.error = f"train.py exited with code {proc.returncode}"
                self.finished_at = time.time()

            if proc.returncode == 0:
                REG.reload()
                with self.lock:
                    self.logs.append("[reload] models reloaded into the inference registry")
        except Exception as e:
            with self.lock:
                self.status = "error"
                self.error = f"{type(e).__name__}: {e}"
                self.logs.append(self.error)
                self.finished_at = time.time()


JOB = TrainJob()


# ─── Helpers ───────────────────────────────────────────────────────────────────


def score_to_decision(score: int) -> str:
    if score <= 30:
        return "approved"
    if score <= 60:
        return "approved_with_review"
    if score <= 85:
        return "approved_with_review"
    return "blocked"


def make_prediction(name: str, proba: float, threshold: float) -> ModelPrediction:
    label = int(proba >= threshold)
    risk = int(round(min(max(proba, 0.0), 1.0) * 100))
    return ModelPrediction(
        model=name,
        probability=float(proba),
        label=label,
        risk_score=risk,
        decision=score_to_decision(risk),
    )


def dataset_summary() -> dict:
    if not DATASET_PATH.exists():
        return {"exists": False, "path": str(DATASET_PATH)}

    size = DATASET_PATH.stat().st_size
    rows = 0
    header: list[str] | None = None
    head_rows: list[list[str]] = []
    try:
        with DATASET_PATH.open("r", encoding="utf-8", newline="") as fh:
            reader = csv.reader(fh)
            for i, row in enumerate(reader):
                if i == 0:
                    header = row
                else:
                    if i <= 3:
                        head_rows.append(row)
                    rows += 1
    except Exception as e:
        return {"exists": True, "path": str(DATASET_PATH), "error": str(e), "size_bytes": size}

    expected_cols = ["Time", *[f"V{i}" for i in range(1, 29)], "Amount", "Class"]
    missing = [c for c in expected_cols if header is not None and c not in header]
    return {
        "exists": True,
        "path": str(DATASET_PATH),
        "size_bytes": size,
        "rows": rows,
        "columns": header or [],
        "missing_columns": missing,
        "is_valid_kaggle_format": header is not None and not missing,
        "preview": head_rows,
    }


# ─── App ───────────────────────────────────────────────────────────────────────


app = FastAPI(title="FINGUARD ML", version="1.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok" if REG.is_ready() else "untrained",
        "models": {"logreg": REG.logreg is not None, "nn": REG.nn is not None},
        "tf_available": REG.tf_available,
        "loaded_at": REG.loaded_at,
        "training": JOB.status == "running",
    }


@app.get("/model-info")
def model_info() -> dict:
    if not REG.is_ready():
        raise HTTPException(503, detail="Models not trained. Upload data and call POST /retrain.")
    info = {
        "feature_columns": FEATURE_COLUMNS,
        "models": {"logreg": {"loaded": REG.logreg is not None}, "nn": {"loaded": REG.nn is not None}},
        "loaded_at": REG.loaded_at,
    }
    if REG.metrics:
        info["trained_at"] = REG.metrics.get("trained_at")
        info["test_size"] = REG.metrics.get("test_size")
        info["random_state"] = REG.metrics.get("random_state")
    return info


@app.get("/metrics")
def metrics() -> dict:
    if not REG.metrics:
        raise HTTPException(404, detail="metrics.json not found — train first")
    return REG.metrics


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    if not REG.is_ready():
        raise HTTPException(503, detail="Models not trained. Call POST /retrain.")

    t0 = time.perf_counter()
    raw = req.features.as_vector()
    norm = REG.normalise(raw)

    preds: list[ModelPrediction] = []
    logreg_proba: float | None = None
    nn_proba: float | None = None

    if REG.logreg is not None:
        logreg_proba = float(REG.logreg.predict_proba(norm.reshape(1, -1))[0, 1])
        preds.append(make_prediction("logreg", logreg_proba, req.threshold))

    if REG.nn is not None:
        nn_proba = float(REG.nn.predict(norm.reshape(1, -1), verbose=0)[0, 0])
        preds.append(make_prediction("nn", nn_proba, req.threshold))

    if req.model == "logreg" and logreg_proba is not None:
        primary = preds[0] if preds and preds[0].model == "logreg" else make_prediction("logreg", logreg_proba, req.threshold)
    elif req.model == "nn" and nn_proba is not None:
        primary = next((p for p in preds if p.model == "nn"), make_prediction("nn", nn_proba or 0.0, req.threshold))
    else:
        probs = [p for p in (logreg_proba, nn_proba) if p is not None]
        if not probs:
            raise HTTPException(503, detail="No models available")
        primary = make_prediction("ensemble", float(max(probs)), req.threshold)
        preds.append(primary)

    return PredictResponse(
        predictions=preds,
        primary=primary,
        threshold=req.threshold,
        feature_vector_normalised=[float(v) for v in norm.tolist()],
        processing_ms=int((time.perf_counter() - t0) * 1000),
    )


@app.post("/predict/batch")
def predict_batch(req: BatchPredictRequest) -> dict:
    if not REG.is_ready():
        raise HTTPException(503, detail="Models not trained.")
    t0 = time.perf_counter()
    raws = np.stack([f.as_vector() for f in req.items])
    mean = np.array([REG.scaler["mean"][c] for c in FEATURE_COLUMNS], dtype="float32")
    std = np.array([REG.scaler["std"][c] for c in FEATURE_COLUMNS], dtype="float32")
    std = np.where(std == 0, 1.0, std)
    norms = (raws - mean) / std

    out: list[dict] = []
    logreg_probs = REG.logreg.predict_proba(norms)[:, 1] if REG.logreg is not None else None
    nn_probs = REG.nn.predict(norms, verbose=0).reshape(-1) if REG.nn is not None else None

    for i in range(len(req.items)):
        lp = float(logreg_probs[i]) if logreg_probs is not None else None
        np_p = float(nn_probs[i]) if nn_probs is not None else None
        if req.model == "logreg" and lp is not None:
            primary_proba = lp
            primary_name = "logreg"
        elif req.model == "nn" and np_p is not None:
            primary_proba = np_p
            primary_name = "nn"
        else:
            probs = [p for p in (lp, np_p) if p is not None]
            primary_proba = max(probs) if probs else 0.0
            primary_name = "ensemble"
        out.append({
            "logreg_probability": lp,
            "nn_probability": np_p,
            "primary": make_prediction(primary_name, primary_proba, req.threshold).model_dump(),
        })

    return {
        "items": out,
        "count": len(out),
        "threshold": req.threshold,
        "processing_ms": int((time.perf_counter() - t0) * 1000),
    }


# ─── Dataset upload ────────────────────────────────────────────────────────────


@app.get("/dataset/info")
def dataset_info() -> dict:
    return dataset_summary()


@app.post("/dataset/upload")
async def dataset_upload(file: UploadFile = File(...)) -> dict:
    if JOB.status == "running":
        raise HTTPException(409, detail="Cannot replace dataset while a training job is running")

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, detail="Only .csv files are accepted")

    DATA_DIR.mkdir(exist_ok=True)
    tmp = DATA_DIR / f".upload-{uuid.uuid4().hex}.csv"
    try:
        with tmp.open("wb") as out:
            shutil.copyfileobj(file.file, out)
        # Validate header before swapping in.
        with tmp.open("r", encoding="utf-8", newline="") as fh:
            header = next(csv.reader(fh), None)
        if header is None:
            tmp.unlink(missing_ok=True)
            raise HTTPException(400, detail="Empty CSV")
        expected = ["Time", *[f"V{i}" for i in range(1, 29)], "Amount", "Class"]
        missing = [c for c in expected if c not in header]
        if missing:
            tmp.unlink(missing_ok=True)
            raise HTTPException(
                400,
                detail=f"CSV is missing required columns: {missing}. "
                "Expected Kaggle ULB credit-card fraud schema.",
            )
        os.replace(tmp, DATASET_PATH)
    finally:
        await file.close()
        if tmp.exists():
            tmp.unlink(missing_ok=True)

    return {"ok": True, "info": dataset_summary()}


# ─── Async retrain ─────────────────────────────────────────────────────────────


@app.post("/retrain")
def retrain(skip_nn: bool = False) -> dict:
    """Kick off training in a background thread. Returns immediately."""
    if not DATASET_PATH.exists():
        raise HTTPException(
            400,
            detail="No dataset uploaded. POST a CSV to /dataset/upload first.",
        )
    return JOB.start(skip_nn=skip_nn)


@app.get("/retrain/status")
def retrain_status() -> dict:
    return JOB.snapshot()


if __name__ == "__main__":
    import uvicorn

    host = os.environ.get("ML_HOST", "0.0.0.0")
    port = int(os.environ.get("ML_PORT", "8000"))
    uvicorn.run("app:app", host=host, port=port, reload=False)
