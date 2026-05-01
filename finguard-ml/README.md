# finguard-ml

Python inference + training service for FINGUARD. Replicates the diploma notebook
(*Practical 8 — Heart Failure Prediction*) but adapted to **credit-card fraud
detection** on the **Kaggle ULB** dataset (`creditcard.csv`, 284 807 transactions,
492 fraud, 0.172 %).

The two hypotheses from the notebook are kept:

1. **Logistic Regression** (`sklearn.linear_model.LogisticRegression`)
2. **Keras Sequential NN** — `Dense(200, sigmoid) → Dense(100, sigmoid) → Dense(20, relu) → Dense(1, sigmoid)`

The Gateway (`finguard-backend`, NestJS) is the only client of this service.

## Setup (Windows / PowerShell)

```powershell
cd finguard-ml
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Dataset

Download `creditcard.csv` from
[Kaggle — Credit Card Fraud Detection (mlg-ulb)](https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud)
and place it in `finguard-ml/data/creditcard.csv`.

## Train

```powershell
python train.py            # full: LogReg + Keras NN
python train.py --skip-nn  # only LogReg (fast)
```

Artefacts are written to `models/`:

- `logreg.joblib` — fitted Logistic Regression
- `nn.keras` — Keras model (TF SavedModel format)
- `scaler.joblib` — `{ mean, std, feature_columns }` z-score parameters
- `metrics.json` — accuracy / precision / recall / F1 / confusion matrix / EDA

## Serve

```powershell
python app.py
# → http://localhost:8000
```

Endpoints:

| Method | Path             | Description                                            |
|--------|------------------|--------------------------------------------------------|
| GET    | `/health`        | service status                                         |
| GET    | `/model-info`    | loaded artefacts, feature order                        |
| GET    | `/metrics`       | last training metrics                                  |
| POST   | `/predict`       | single transaction → `{ logreg, nn, primary }`        |
| POST   | `/predict/batch` | many at once                                           |
| POST   | `/retrain`       | re-runs `train.py` synchronously, hot-reloads models   |
