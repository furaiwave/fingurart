import {
isApiSuccess,
type ApiResponse, type PaginatedResponse,
type TransactionId, type RuleId, type ReportId,
type ReportData, type ReportType,
} from '../../../finguard-backend/shared/types';
import type { CreateTransactionDto } from '../../../finguard-backend/src/common/dto/create';
import type { TransactionResponseDto } from '../../../finguard-backend/src/common/dto/transResponse'
import type { AnalysisResponseDto } from '../../../finguard-backend/src/common/dto/responseAnalysis'
import type { TransactionQueryDto } from '../../../finguard-backend/src/common/dto/query'
import type { CreateRuleDto } from '../../../finguard-backend/src/common/dto/createRule'
import type { UpdateRulesDto } from '../../../finguard-backend/src/common/dto/update'
import type { RuleResponseDto } from '../../../finguard-backend/src/common/dto/ruleResponse'
import type { GenerateReportDto } from '../../../finguard-backend/src/common/dto/report'


// Базова URL бекенду; можна перевизначити через змінну оточення
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

// ─── Error class ──────────────────────────────────────────────────────────────

// Власний клас помилки з кодом для зручної обробки на UI
export class ApiClientError extends Error {

readonly code: string;

constructor(
    code: string,
    message: string,
) {
    super(message);
    this.code = code;
    this.name = 'ApiClientError';
}
}

// ─── Generic fetcher ─────────────────────────────────────────────────────────

// Єдина точка HTTP-запитів: розгортає { success, data } і кидає ApiClientError при помилці
async function req<T>(path: string, init?: RequestInit): Promise<T> {
const merged: RequestInit = {
    ...init,
    headers: { 'Content-Type': 'application/json', ...((init?.headers ?? {}) as Record<string, string>) },
};
const res = await fetch(`${BASE}${path}`, merged);

let json: unknown;
try {
    json = await res.json();
} catch {
    throw new ApiClientError(`HTTP_${res.status}`, `Non-JSON response (HTTP ${res.status})`);
}

const wrapped = json as ApiResponse<T>;
if (isApiSuccess(wrapped)) return wrapped.data;

const errCode = (wrapped as { error?: { code?: string } })?.error?.code;
const errMessage = (wrapped as { error?: { message?: string } })?.error?.message;
if (errMessage) throw new ApiClientError(errCode ?? `HTTP_${res.status}`, errMessage);

const bare = json as { message?: string | string[]; detail?: string };
const fallback =
    (Array.isArray(bare?.message) ? bare.message.join('; ') : bare?.message) ??
    bare?.detail ??
    `Request failed (HTTP ${res.status})`;
throw new ApiClientError(`HTTP_${res.status}`, fallback);
}

// Будує рядок query-параметрів, ігноруючи undefined/null значення
const qs = (q?: object): string => {
if (!q) return '';
const p = new URLSearchParams(
    Object.entries(q)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k, String(v)])
);
return p.toString() ? `?${p}` : '';
};

// ─── TRANSACTIONS ─────────────────────────────────────────────────────────────

export const transactionsApi = {
create:  (dto: CreateTransactionDto) =>
    req<TransactionResponseDto>('/transactions', { method: 'POST', body: JSON.stringify(dto) }),

list:    (q?: Partial<TransactionQueryDto>) =>
    req<PaginatedResponse<TransactionResponseDto>>(`/transactions${qs(q)}`),

getOne:  (id: TransactionId) =>
    req<TransactionResponseDto>(`/transactions/${id}`),

analyze: (id: TransactionId) =>
    req<AnalysisResponseDto>(`/transactions/${id}/analyze`, { method: 'POST' }),

remove:  (id: TransactionId) =>
    req<void>(`/transactions/${id}`, { method: 'DELETE' }),
} as const;

// ─── RULES ───────────────────────────────────────────────────────────────────

export const rulesApi = {
create:  (dto: CreateRuleDto) =>
    req<RuleResponseDto>('/rules', { method: 'POST', body: JSON.stringify(dto) }),

list:    () =>
    req<RuleResponseDto[]>('/rules'),

getOne:  (id: RuleId) =>
    req<RuleResponseDto>(`/rules/${id}`),

update:  (id: RuleId, dto: UpdateRulesDto) =>
    req<RuleResponseDto>(`/rules/${id}`, { method: 'PUT', body: JSON.stringify(dto) }),

toggle:  (id: RuleId) =>
    req<RuleResponseDto>(`/rules/${id}/toggle`, { method: 'PATCH' }),

remove:  (id: RuleId) =>
    req<void>(`/rules/${id}`, { method: 'DELETE' }),
} as const;

// ─── DATASET ─────────────────────────────────────────────────────────────────

export type UlbRowPayload = {
    rowIndex: number
    time: number
    v1: number; v2: number; v3: number; v4: number; v5: number; v6: number; v7: number
    v8: number; v9: number; v10: number; v11: number; v12: number; v13: number; v14: number
    v15: number; v16: number; v17: number; v18: number; v19: number; v20: number; v21: number
    v22: number; v23: number; v24: number; v25: number; v26: number; v27: number; v28: number
    amount: number
    trueClass: number
}

export type UlbAnalysisResult = {
    rowIndex: number
    amount: number
    trueClass: 0 | 1
    verdict: 'fraud' | 'legitimate'
    riskScore: number
    riskLevel: 'low' | 'medium' | 'high' | 'critical'
    confidence: number
    reasoning: string
    primarySignals: string[]
    processingTimeMs: number
    isCorrect: boolean
}

export const datasetApi = {
    analyzeBatch: (rows: UlbRowPayload[]) =>
        req<UlbAnalysisResult[]>('/dataset/analyze-batch', {
            method: 'POST',
            body: JSON.stringify({ rows }),
        }),
} as const

// ─── REPORTS ─────────────────────────────────────────────────────────────────

export type ReportResponse = {
    id: string
    name: string
    type: ReportType
    period: string
    data: ReportData
    generatedAt: string
}

export const reportsApi = {
    generate: (dto: GenerateReportDto) =>
        req<ReportResponse>('/reports/generate', { method: 'POST', body: JSON.stringify(dto) }),

    list: () =>
        req<ReportResponse[]>('/reports'),

    getOne: (id: ReportId) =>
        req<ReportResponse>(`/reports/${id}`),

    remove: (id: ReportId) =>
        req<void>(`/reports/${id}`, { method: 'DELETE' }),
} as const;