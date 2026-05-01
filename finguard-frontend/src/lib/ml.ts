/**
 * finguard-ml gateway types & API client.
 * The frontend never calls FastAPI directly — it goes through the NestJS gateway.
 */

import {
  isApiSuccess,
  type ApiResponse,
} from '../../../finguard-backend/shared/types';

const BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api').replace(/\/+$/, '');

export const ML_FEATURE_KEYS = [
  ...Array.from({ length: 28 }, (_, i) => `V${i + 1}`),
  'Amount',
  'Time',
] as const;

export type MlFeatureKey = (typeof ML_FEATURE_KEYS)[number];
export type MlFeatures = Record<MlFeatureKey, number>;

export type MlModelChoice = 'logreg' | 'nn' | 'ensemble';

export type MlPredictionPayload = {
  model: string;
  probability: number;
  label: 0 | 1;
  risk_score: number;
  decision:
    | 'approved'
    | 'approved_with_review'
    | 'blocked'
    | 'pending_manual_review';
};

export type MlPredictRaw = {
  predictions: MlPredictionPayload[];
  primary: MlPredictionPayload;
  threshold: number;
  feature_vector_normalised: number[];
  processing_ms: number;
};

export type MlScoring = {
  riskScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  verdict: MlPredictionPayload['decision'];
  modelVersion: string;
  signals: ReadonlyArray<{
    category: string;
    code: string;
    description: string;
    weight: number;
  }>;
  reasoning: string;
  recommendations: ReadonlyArray<string>;
  processingTimeMs: number;
};

export type MlPredictResponse = {
  raw: MlPredictRaw;
  scoring: MlScoring;
};

export type MlMetrics = {
  trained_at: string;
  random_state: number;
  test_size: number;
  feature_columns: string[];
  dataset: {
    total_rows: number;
    fraud_count: number;
    legit_count: number;
    fraud_rate: number;
    amount: { min: number; max: number; mean: number; median: number };
    time_span_seconds: number;
    top_correlations: { feature: string; corr: number }[];
  };
  logistic_regression: ModelMetrics | null;
  neural_network: ModelMetrics | null;
};

export type ModelMetrics = {
  model: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  roc_auc: number | null;
  confusion_matrix: number[][]; // [[TN, FP], [FN, TP]]
  train_seconds: number;
  epochs?: number;
  batch_size?: number;
  report?: Record<string, unknown>;
};

export type MlModelInfo = {
  feature_columns: string[];
  models: { logreg: { loaded: boolean }; nn: { loaded: boolean } };
  loaded_at: number | null;
  trained_at?: string;
  test_size?: number;
  random_state?: number;
};

export type MlHealth = {
  status: 'ok' | 'untrained';
  models: { logreg: boolean; nn: boolean };
  tf_available: boolean;
  loaded_at: number | null;
  training: boolean;
};

export type DatasetInfo = {
  exists: boolean;
  path: string;
  size_bytes?: number;
  rows?: number;
  columns?: string[];
  missing_columns?: string[];
  is_valid_kaggle_format?: boolean;
  preview?: string[][];
  error?: string;
};

export type TrainStatus = {
  id: string | null;
  status: 'idle' | 'running' | 'success' | 'error';
  skip_nn: boolean;
  started_at: number | null;
  finished_at: number | null;
  elapsed_seconds: number;
  return_code: number | null;
  error: string | null;
  logs: string[];
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const baseHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init?.body instanceof FormData) delete baseHeaders['Content-Type'];
  const merged: RequestInit = {
    ...init,
    headers: { ...baseHeaders, ...((init?.headers ?? {}) as Record<string, string>) },
  };
  const res = await fetch(`${BASE}${path}`, merged);

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Non-JSON response (HTTP ${res.status})`);
  }

  const wrapped = json as ApiResponse<T>;
  if (isApiSuccess(wrapped)) return wrapped.data;

  // Wrapped error envelope.
  const errMessage = (wrapped as { error?: { message?: string } })?.error?.message;
  if (errMessage) throw new Error(errMessage);

  // Bare NestJS / FastAPI error formats — fall back gracefully.
  const bare = json as { message?: string | string[]; detail?: string; statusCode?: number };
  const fallback =
    (Array.isArray(bare?.message) ? bare.message.join('; ') : bare?.message) ??
    bare?.detail ??
    `Request failed (HTTP ${res.status})`;
  throw new Error(fallback);
}

export const mlApi = {
  health: () => req<MlHealth>('/ml/health'),
  modelInfo: () => req<MlModelInfo>('/ml/model-info'),
  metrics: () => req<MlMetrics>('/ml/metrics'),
  predict: (
    features: MlFeatures,
    opts?: { threshold?: number; model?: MlModelChoice },
  ) =>
    req<MlPredictResponse>('/ml/predict', {
      method: 'POST',
      body: JSON.stringify({ features, ...(opts ?? {}) }),
    }),
  retrain: (skipNn = false) =>
    req<TrainStatus>(`/ml/retrain?skipNn=${skipNn}`, { method: 'POST' }),
  retrainStatus: () =>
    req<TrainStatus>('/ml/retrain/status'),
  datasetInfo: () =>
    req<DatasetInfo>('/ml/dataset/info'),
  uploadDataset: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return req<{ ok: boolean; info: DatasetInfo }>('/ml/dataset/upload', {
      method: 'POST',
      body: fd,
      headers: {},
    });
  },
} as const;
