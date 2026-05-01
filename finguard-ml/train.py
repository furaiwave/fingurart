"""
FINGUARD ML — training pipeline for credit-card fraud detection.

Mirrors structure of the diploma notebook (Practical 8):
  1. Load CSV (pandas)
  2. EDA — class distribution, correlation matrix
  3. Feature selection / normalisation (z-score per column)
  4. train_test_split (stratified for imbalanced dataset)
  5. Hypothesis 1: Logistic Regression
  6. Hypothesis 2: Keras NN (Sequential: Dense(200,sigmoid) -> Dense(100,sigmoid) -> Dense(20,relu) -> Dense(1,sigmoid))
  7. Compare both, save artefacts and metrics.json

Dataset: Kaggle "Credit Card Fraud Detection" (ULB) — creditcard.csv
  Columns: Time, V1..V28, Amount, Class (0 legit, 1 fraud)
  284 807 rows, 492 fraud (0.172%) — strong class imbalance.

Run:
    python train.py
"""

from __future__ import annotations

import argparse
import json
import os
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

ROOT = Path(__file__).resolve().parent
DATA_PATH = Path(os.environ.get("DATA_PATH", ROOT / "data" / "creditcard.csv"))
MODELS_DIR = Path(os.environ.get("MODELS_DIR", ROOT / "models"))
RANDOM_STATE = int(os.environ.get("RANDOM_STATE", "1"))
TEST_SIZE = float(os.environ.get("TEST_SIZE", "0.2"))
NN_EPOCHS = int(os.environ.get("NN_EPOCHS", "15"))
NN_BATCH_SIZE = int(os.environ.get("NN_BATCH_SIZE", "2048"))

FEATURE_COLUMNS: list[str] = [f"V{i}" for i in range(1, 29)] + ["Amount", "Time"]
TARGET = "Class"


def load_dataset(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(
            f"Dataset not found at {path}. "
            "Download Kaggle 'Credit Card Fraud Detection' (ULB) "
            "and put creditcard.csv into finguard-ml/data/"
        )
    df = pd.read_csv(path)
    missing = [c for c in FEATURE_COLUMNS + [TARGET] if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns in dataset: {missing}")
    return df


def explore(df: pd.DataFrame) -> dict:
    total = int(len(df))
    fraud = int(df[TARGET].sum())
    legit = total - fraud
    fraud_rate = fraud / total if total else 0.0

    corr = df.corr(numeric_only=True)
    target_corr = corr[TARGET].drop(TARGET).sort_values(key=lambda s: s.abs(), ascending=False)

    return {
        "total_rows": total,
        "fraud_count": fraud,
        "legit_count": legit,
        "fraud_rate": fraud_rate,
        "amount": {
            "min": float(df["Amount"].min()),
            "max": float(df["Amount"].max()),
            "mean": float(df["Amount"].mean()),
            "median": float(df["Amount"].median()),
        },
        "time_span_seconds": float(df["Time"].max() - df["Time"].min()),
        "top_correlations": [
            {"feature": str(name), "corr": float(value)}
            for name, value in target_corr.head(10).items()
        ],
    }


def normalise(
    x_train: pd.DataFrame, x_test: pd.DataFrame
) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, float], dict[str, float]]:
    mean = x_train.mean()
    std = x_train.std().replace(0, 1.0)
    x_train_n = (x_train - mean) / std
    x_test_n = (x_test - mean) / std
    return x_train_n, x_test_n, mean.to_dict(), std.to_dict()


def evaluate(name: str, y_true: np.ndarray, y_pred: np.ndarray, y_proba: np.ndarray | None) -> dict:
    cm = confusion_matrix(y_true, y_pred).tolist()
    report = classification_report(y_true, y_pred, output_dict=True, zero_division=0)
    metrics = {
        "model": name,
        "accuracy": float(accuracy_score(y_true, y_pred)),
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, y_proba)) if y_proba is not None else None,
        "confusion_matrix": cm,  # [[TN, FP], [FN, TP]]
        "report": report,
    }
    return metrics


def train_logreg(x_train: pd.DataFrame, y_train: pd.Series, x_test: pd.DataFrame, y_test: pd.Series) -> tuple[LogisticRegression, dict, float]:
    print("[logreg] training Logistic Regression…")
    t0 = time.perf_counter()
    model = LogisticRegression(max_iter=1000, class_weight="balanced", n_jobs=-1)
    model.fit(x_train, y_train)
    elapsed = time.perf_counter() - t0
    proba = model.predict_proba(x_test)[:, 1]
    pred = (proba >= 0.5).astype(int)
    metrics = evaluate("logistic_regression", y_test.to_numpy(), pred, proba)
    metrics["train_seconds"] = elapsed
    print(f"[logreg] done in {elapsed:.2f}s — recall={metrics['recall']:.3f} f1={metrics['f1']:.3f}")
    return model, metrics, elapsed


def build_nn(input_dim: int):
    # Lazy import — TensorFlow is heavy.
    import tensorflow as tf
    from tensorflow.keras import Sequential
    from tensorflow.keras.layers import Dense, InputLayer
    from tensorflow.keras.optimizers import Adam

    model = Sequential(
        [
            InputLayer(shape=(input_dim,)),
            Dense(200, activation="sigmoid"),
            Dense(100, activation="sigmoid"),
            Dense(20, activation="relu"),
            Dense(1, activation="sigmoid"),
        ]
    )
    model.compile(
        optimizer=Adam(learning_rate=0.003),
        loss="binary_crossentropy",
        metrics=["accuracy"],
    )
    return model


def train_nn(x_train: pd.DataFrame, y_train: pd.Series, x_test: pd.DataFrame, y_test: pd.Series) -> tuple[object, dict, float]:
    print("[nn] training Keras Sequential…")
    model = build_nn(x_train.shape[1])
    # class_weight to handle imbalance
    n_pos = int(y_train.sum())
    n_neg = int(len(y_train) - n_pos)
    weight_for_0 = (1 / n_neg) * (len(y_train) / 2.0) if n_neg else 1.0
    weight_for_1 = (1 / n_pos) * (len(y_train) / 2.0) if n_pos else 1.0
    class_weight = {0: weight_for_0, 1: weight_for_1}

    t0 = time.perf_counter()
    model.fit(
        x_train.values.astype("float32"),
        y_train.values.astype("float32"),
        epochs=NN_EPOCHS,
        batch_size=NN_BATCH_SIZE,
        verbose=2,
        class_weight=class_weight,
        validation_split=0.1,
    )
    elapsed = time.perf_counter() - t0

    proba = model.predict(x_test.values.astype("float32"), verbose=0).reshape(-1)
    pred = (proba >= 0.5).astype(int)
    metrics = evaluate("neural_network", y_test.to_numpy(), pred, proba)
    metrics["train_seconds"] = elapsed
    metrics["epochs"] = NN_EPOCHS
    metrics["batch_size"] = NN_BATCH_SIZE
    print(f"[nn] done in {elapsed:.2f}s — recall={metrics['recall']:.3f} f1={metrics['f1']:.3f}")
    return model, metrics, elapsed


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-nn", action="store_true", help="Skip neural network (faster).")
    args = parser.parse_args()

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[setup] data={DATA_PATH}  models={MODELS_DIR}")

    df = load_dataset(DATA_PATH)
    eda = explore(df)
    print(
        f"[eda] rows={eda['total_rows']:,} fraud={eda['fraud_count']:,} "
        f"legit={eda['legit_count']:,} rate={eda['fraud_rate']*100:.4f}%"
    )

    x = df[FEATURE_COLUMNS]
    y = df[TARGET].astype(int)

    x_train, x_test, y_train, y_test = train_test_split(
        x, y,
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=y,
    )

    x_train_n, x_test_n, mean, std = normalise(x_train, x_test)

    logreg, logreg_metrics, _ = train_logreg(x_train_n, y_train, x_test_n, y_test)
    joblib.dump(logreg, MODELS_DIR / "logreg.joblib")

    nn_metrics: dict | None = None
    if not args.skip_nn:
        nn, nn_metrics, _ = train_nn(x_train_n, y_train, x_test_n, y_test)
        nn.save(MODELS_DIR / "nn.keras")

    scaler = {"mean": mean, "std": std, "feature_columns": FEATURE_COLUMNS}
    joblib.dump(scaler, MODELS_DIR / "scaler.joblib")

    metrics_payload = {
        "trained_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "random_state": RANDOM_STATE,
        "test_size": TEST_SIZE,
        "feature_columns": FEATURE_COLUMNS,
        "dataset": eda,
        "logistic_regression": logreg_metrics,
        "neural_network": nn_metrics,
    }

    with (MODELS_DIR / "metrics.json").open("w", encoding="utf-8") as fh:
        json.dump(metrics_payload, fh, indent=2)

    print(f"[done] artefacts saved to {MODELS_DIR}")


if __name__ == "__main__":
    main()
