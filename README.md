<<<<<<< Updated upstream
# FinGuard

AI-платформа для виявлення фінансового шахрайства. Аналізує транзакції в реальному часі через Claude (Anthropic), застосовує налаштовуваний рушій правил та надає дашборд із звітністю.

## Структура монорепо

```
finguard/
├── finguard-backend/   # NestJS REST API + TypeORM + MySQL
└── finguard-frontend/  # React 19 + Vite + shadcn/ui
```

Типи та DTO є спільними — фронтенд імпортує їх безпосередньо з `finguard-backend/shared/` та `finguard-backend/src/common/dto/`.

---

## Технологічний стек

| Шар | Технологія |
|---|---|
| Бекенд | NestJS 11, TypeORM 0.3, MySQL 8 |
| AI | Anthropic Claude (`@anthropic-ai/sdk`) |
| Фронтенд | React 19, Vite, Tailwind CSS v4, shadcn/ui, Radix UI |
| Мова | TypeScript 5 (бекенд), TypeScript 6 (фронтенд) |

---

## Вимоги

- Node.js 20+
- MySQL 8 локально або через Docker

---

## Швидкий старт

### 1. База даних

Створи базу даних (MySQL):

```sql
CREATE DATABASE finguard_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

> У режимі розробки встановлено `synchronize: true` — TypeORM створить таблиці автоматично при першому запуску.

### 2. Бекенд

```bash
cd finguard-backend
cp .env.example .env      # заповни своїми значеннями
npm install
npm run start:dev         # http://localhost:3001
```

**Змінні `.env`:**

| Змінна              |                                 Опис                                                  |
|---------------------|---------------------------------------------------------------------------------------|
| `PORT`              | Порт сервера (за замовчуванням `3001`)                                                |
| `FRONTEND_URL`      | CORS origin (за замовчуванням `http://localhost:5173`)                                |
| `DB_HOST`           | Хост MySQL                                                                            |
| `DB_PORT`           | Порт MySQL (за замовчуванням `3306`)                                                  |
| `DB_USER`           | Користувач MySQL                                                                      |
| `DB_PASSWORD`       | Пароль MySQL                                                                          |
| `DB_NAME`           | Назва бази даних                                                                      |
| `ANTHROPIC_API_KEY` | API ключ Anthropic — на [console.anthropic.com](https://console.anthropic.com)        |

### 3. Фронтенд

```bash
cd finguard-frontend
cp .env.example .env      # встанови VITE_API_URL за потреби
npm install
npm run dev               # http://localhost:5173
```

**Змінні `.env`:**

| Змінна         | За замовчуванням            |
|----------------|-----------------------------|
| `VITE_API_URL` | `http://localhost:3001/api` |

---

## Архітектура коду

### Бекенд

```text
src/
├── common/
│   ├── controllers.ts          # всі 4 контролери в одному файлі
│   ├── dto/                    # вхідні/вихідні DTO з валідацією (class-validator)
│   └── interceptors/
│       ├── response.ts         # обгортає будь-яку відповідь у { success, data }
│       └── entities/           # TypeORM-сутності (таблиці БД)
├── modules/
│   ├── analysis/               # AI-аналіз через Claude
│   ├── transactions/           # CRUD транзакцій + запуск аналізу
│   ├── rules/                  # CRUD правил шахрайства
│   ├── reports/                # генерація звітів
│   └── dataset/                # пакетний аналіз ULB-датасету
└── shared/types.ts             # брендовані типи, enum-и, спільні інтерфейси
```

### Флоу аналізу транзакції

```text
POST /transactions/:id/analyze
        │
        ▼
TransactionsService.analyze()
        │  завантажує транзакцію + активні правила
        ▼
AiAnalysisService.analyze()
        │
        ├─ applyRules()      — перебирає активні правила, рахує delta (-50..+50)
        │
        ├─ Claude API        — надсилає транзакцію + правила + delta
        │   model: claude-haiku-4-5
        │   відповідь: JSON з riskScore, verdict, signals, reasoning (українською)
        │
        ├─ parseResponse()   — витягує JSON з markdown-блоку, валідує схему
        │
        └─ buildDecision()   — фінальний вердикт = max(Claude, rule-based threshold)
                                score ≤60 → approved
                                score ≤85 → approved_with_review
                                score >85 → blocked
```

### Рушій правил

Кожне правило має набір умов (`conditions`) і логіку їх об'єднання (`AND` / `OR`).  
Якщо правило спрацьовує — його `riskScoreImpact` додається до дельти (від −50 до +50).  
Дельта передається в промпт Claude і додається до його `riskScore` вже після відповіді.

### Спільні типи

`finguard-backend/shared/types.ts` — єдине джерело правди для обох пакетів.  
Фронтенд імпортує типи напряму через відносний шлях (`../../../finguard-backend/shared/types`), без окремого npm-пакету.  
Брендовані типи (`TransactionId`, `RiskScore` тощо) не дають переплутати значення одного примітива.

### Фронтенд

`src/lib/api.ts` — єдина точка звернення до бекенду. Всі запити проходять через `req<T>()`, який автоматично розпаковує `{ success, data }` або кидає `ApiClientError`.

---

## Огляд API

Всі відповіді обгорнуті: `{ success: true, data: ... }` або `{ success: false, error: { code, message } }`.

| Ресурс | Ендпоінти |
|---|---|
| Транзакції | `GET/POST /api/transactions`, `GET/DELETE /api/transactions/:id`, `POST /api/transactions/:id/analyze` |
| Правила | `GET/POST /api/rules`, `GET/PUT/DELETE /api/rules/:id`, `PATCH /api/rules/:id/toggle` |
| Звіти | `POST /api/reports/generate`, `GET /api/reports`, `GET/DELETE /api/reports/:id` |
| Датасет | `POST /api/dataset/analyze-batch` |

---

## Скрипти

### Бекенд (`finguard-backend/`)

```bash
npm run start:dev    # dev з watch-режимом
npm run start:prod   # продакшн (node dist/main)
npm run build        # компіляція
npm run test         # юніт-тести (Jest)
npm run test:e2e     # e2e тести
npm run lint         # ESLint + Prettier fix
```

### Фронтенд (`finguard-frontend/`)

```bash
npm run dev      # dev сервер
npm run build    # продакшн збірка
npm run preview  # перегляд продакшн збірки
npm run lint     # ESLint
```

---

## Схема бази даних

Чотири таблиці: `transactions`, `analyses`, `rules`, `reports`.

`transactions` → `analyses` — зв'язок один-до-багатьох (одна транзакція може мати кілька запусків аналізу).

Основні enum-и:

- **тип транзакції**: `payment | transfer | withdrawal | deposit | refund | chargeback`
- **канал**: `card_present | card_not_present | bank_transfer | crypto | mobile_payment | atm`
- **вердикт**: `approved | approved_with_review | blocked | pending_manual_review`
- **рівень ризику**: `low | medium | high | critical`
- **дія правила**: `flag | block | review | approve | notify`

=======
# FINGUARD

> **Diploma project** — *«Система визначення легітимності фінансових транзакцій
> на основі технологій штучного інтелекту»*

A three-tier system for credit-card fraud detection that mirrors **Practical 8** of
the diploma (Logistic Regression + Keras Sequential NN), retrained on the
[Kaggle ULB Credit Card Fraud Detection](https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud)
dataset (284 807 transactions, 492 fraud, 0.172 %).

```
┌──────────────────────┐    HTTP    ┌───────────────────────┐    HTTP    ┌────────────────────┐
│   finguard-frontend  │ ─────────▶ │   finguard-backend    │ ─────────▶ │   finguard-ml      │
│   React + Vite + TS  │   :5173    │  NestJS  Gateway      │   :3001    │  FastAPI inference │
│   Tailwind + shadcn  │            │  + MySQL persistence  │            │  sklearn + Keras   │
└──────────────────────┘            └───────────────────────┘            └────────────────────┘
                                            │                                     │
                                            ▼                                     ▼
                                    ┌─────────────┐                       ┌──────────────┐
                                    │  MySQL 8    │                       │ models/*.    │
                                    │ transactions│                       │ joblib  keras│
                                    │ analyses    │                       │ metrics.json │
                                    │ rules       │                       └──────────────┘
                                    │ reports     │
                                    └─────────────┘
```

---

## Repository layout

| Folder              | Stack                              | Role                                                              |
|---------------------|------------------------------------|-------------------------------------------------------------------|
| `finguard-ml/`      | Python · FastAPI · sklearn · Keras | Trains and serves the fraud-detection models                      |
| `finguard-backend/` | NestJS · TypeORM · MySQL           | API Gateway: persists tx, calls `finguard-ml`, applies rule-engine |
| `finguard-frontend/`| React 19 · Vite · Tailwind · shadcn| Dashboard, Analyzer, transactions table, rules, reports           |

---

## 1. ML service — `finguard-ml`

### Setup

```powershell
cd finguard-ml
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Dataset

Download `creditcard.csv` from
[Kaggle — mlg-ulb/creditcardfraud](https://www.kaggle.com/datasets/mlg-ulb/creditcardfraud)
and place it at `finguard-ml/data/creditcard.csv`.

### Train

```powershell
python train.py            # full: LogReg + Keras NN
python train.py --skip-nn  # only LogReg (~30s)
```

Artefacts go to `finguard-ml/models/`:
`logreg.joblib`, `nn.keras`, `scaler.joblib`, `metrics.json`.

### Serve

```powershell
python app.py     # http://localhost:8000
```

| Method | Path             | Description                                                         |
|--------|------------------|---------------------------------------------------------------------|
| GET    | `/health`        | service status                                                      |
| GET    | `/model-info`    | loaded artefacts, feature order                                     |
| GET    | `/metrics`       | accuracy / precision / recall / F1 / confusion matrix from training |
| POST   | `/predict`       | single transaction → LogReg + NN + ensemble                         |
| POST   | `/predict/batch` | batch                                                               |
| POST   | `/retrain`       | reruns `train.py`, hot-reloads models                               |

---

## 2. Gateway — `finguard-backend`

NestJS gateway that owns persistence and orchestrates the ML calls.

### Setup

```powershell
cd finguard-backend
npm install
# create the MySQL database referenced in .env
# (DB_NAME=finguard_db by default)
```

Edit `finguard-backend/.env`:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=toor
DB_NAME=finguard_db

ML_URL=http://localhost:8000
ML_THRESHOLD=0.5

# Optional fallback when no ML feature vector is provided.
# ANTHROPIC_API_KEY=sk-ant-...
```

### Run

```powershell
npm run start:dev        # http://localhost:3001/api
```

### Routes

#### ML pass-through (gateway → finguard-ml)

| Method | Path               | Notes                                                          |
|--------|--------------------|----------------------------------------------------------------|
| GET    | `/api/ml/health`     |                                                               |
| GET    | `/api/ml/model-info` |                                                               |
| GET    | `/api/ml/metrics`    | training metrics                                              |
| POST   | `/api/ml/predict`    | body `{ features, threshold?, model? }`. Returns `{ raw, scoring }` |
| POST   | `/api/ml/retrain`    | `?skipNn=true` to train only LogReg                           |

#### Domain (existing)

`/api/transactions`, `/api/transactions/:id/analyze`, `/api/rules`, `/api/reports`.

When you call `analyze`, the gateway:

1. Loads the transaction + active rules from MySQL.
2. If `extraFields.mlFeatures = { V1..V28, Amount, Time }` is present → calls
   `finguard-ml /predict`, builds a verdict (`approved` / `approved_with_review` /
   `blocked`), saves an `AnalysisEntity` and returns it.
3. Otherwise — falls back to Anthropic Claude (if `ANTHROPIC_API_KEY` is set), or
   to a deterministic stub.

---

## 3. Frontend — `finguard-frontend`

```powershell
cd finguard-frontend
npm install
npm run dev      # http://localhost:5173
```

Tabs:

- **Dashboard** — dataset stats (rows, fraud rate, top correlations) and per-model
  metrics with confusion matrices for LogReg & NN. Includes a Retrain button.
- **Analyzer** — single-transaction scoring against the trained models. Enter
  `V1..V28 + Amount + Time` (or load the bundled samples — *legit row #0*,
  *fraud row #541*) and see LogReg vs NN side-by-side, plus the gateway verdict
  + signals + recommendations.
- **Transactions** — existing CRUD; transactions whose `extraFields.mlFeatures`
  hold a feature vector are scored by the ML service when you press *Analyze*.
- **Fraud Rules** — existing rule engine (deltas applied to ML score).
- **Reports** — existing reports module.

---

## Local end-to-end smoke test

In **three terminals**:

```powershell
# 1) ML service
cd finguard-ml
.venv\Scripts\Activate.ps1
python app.py

# 2) Gateway
cd finguard-backend
npm run start:dev

# 3) Frontend
cd finguard-frontend
npm run dev
```

Open `http://localhost:5173`, go to **Dashboard**, click **Retrain** (the gateway
proxies to `/api/ml/retrain` which runs `train.py` synchronously). Once metrics
appear, switch to **Analyzer** and click *Fraud (row #541)* → *Predict*. You
should see both LogReg and NN labelling it as fraud (`label = 1`).
>>>>>>> Stashed changes
