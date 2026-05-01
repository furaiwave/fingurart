import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
    mkConfidence,
    mkRiskScore,
    scoreToRiskLevel,
    type ConfidenceScore,
    type FraudSignal,
    type LegitimacyDecision,
    type RiskLevel,
    type RiskScore,
    type Verdict,
} from 'shared/types';

/** Raw V1..V28 + Amount + Time as the Kaggle CC fraud dataset stores them. */
export type MlFeatures = {
    readonly Time: number;
    readonly Amount: number;
} & Record<`V${number}`, number>;

export type MlModelChoice = 'logreg' | 'nn' | 'ensemble';

export type MlPredictionPayload = {
    readonly model: string;
    readonly probability: number;
    readonly label: 0 | 1;
    readonly risk_score: number;
    readonly decision: Verdict;
};

export type MlPredictResponse = {
    readonly predictions: ReadonlyArray<MlPredictionPayload>;
    readonly primary: MlPredictionPayload;
    readonly threshold: number;
    readonly feature_vector_normalised: ReadonlyArray<number>;
    readonly processing_ms: number;
};

export type MlScoringResult = {
    readonly riskScore: RiskScore;
    readonly riskLevel: RiskLevel;
    readonly confidence: ConfidenceScore;
    readonly verdict: Verdict;
    readonly modelVersion: string;
    readonly signals: ReadonlyArray<FraudSignal>;
    readonly reasoning: string;
    readonly recommendations: ReadonlyArray<string>;
    readonly decision: LegitimacyDecision;
    readonly processingTimeMs: number;
};

@Injectable()
export class MlService {
    private readonly logger = new Logger(MlService.name);
    private readonly baseUrl: string;
    private readonly threshold: number;

    constructor(private readonly cfg: ConfigService) {
        this.baseUrl = (cfg.get<string>('ML_URL') ?? 'http://localhost:8000').replace(/\/+$/, '');
        this.threshold = Number(cfg.get<string>('ML_THRESHOLD') ?? '0.5');
    }

    private async req<T>(path: string, init?: RequestInit): Promise<T> {
        const url = `${this.baseUrl}${path}`;
        try {
            const res = await fetch(url, {
                ...init,
                headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
            });
            if (!res.ok) {
                const text = await res.text();
                throw new ServiceUnavailableException(
                    `ML service ${path} returned ${res.status}: ${text.slice(0, 500)}`,
                );
            }
            return (await res.json()) as T;
        } catch (err) {
            if (err instanceof ServiceUnavailableException) throw err;
            this.logger.error(`ML request failed: ${path} → ${(err as Error).message}`);
            throw new ServiceUnavailableException(
                `Cannot reach ML service at ${this.baseUrl}. Is it running? (${(err as Error).message})`,
            );
        }
    }

    health(): Promise<unknown> {
        return this.req('/health');
    }

    modelInfo(): Promise<unknown> {
        return this.req('/model-info');
    }

    metrics(): Promise<unknown> {
        return this.req('/metrics');
    }

    async predict(
        features: MlFeatures,
        opts: { threshold?: number; model?: MlModelChoice } = {},
    ): Promise<MlPredictResponse> {
        return this.req<MlPredictResponse>('/predict', {
            method: 'POST',
            body: JSON.stringify({
                features,
                threshold: opts.threshold ?? this.threshold,
                model: opts.model ?? 'ensemble',
            }),
        });
    }

    async retrain(skipNn = false): Promise<unknown> {
        return this.req(`/retrain?skip_nn=${skipNn}`, { method: 'POST' });
    }

    retrainStatus(): Promise<unknown> {
        return this.req('/retrain/status');
    }

    datasetInfo(): Promise<unknown> {
        return this.req('/dataset/info');
    }

    /**
     * Forward an uploaded CSV (already buffered in memory by Multer) to the
     * Python service via multipart/form-data.
     */
    async uploadDataset(buffer: Buffer, filename: string, mimetype: string): Promise<unknown> {
        const url = `${this.baseUrl}/dataset/upload`;
        const form = new FormData();
        const blob = new Blob([new Uint8Array(buffer)], { type: mimetype || 'text/csv' });
        form.append('file', blob, filename || 'creditcard.csv');
        try {
            const res = await fetch(url, { method: 'POST', body: form });
            if (!res.ok) {
                const text = await res.text();
                throw new ServiceUnavailableException(
                    `ML /dataset/upload returned ${res.status}: ${text.slice(0, 500)}`,
                );
            }
            return await res.json();
        } catch (err) {
            if (err instanceof ServiceUnavailableException) throw err;
            this.logger.error(`Dataset upload failed: ${(err as Error).message}`);
            throw new ServiceUnavailableException(
                `Cannot reach ML service at ${this.baseUrl}. (${(err as Error).message})`,
            );
        }
    }

    /**
     * Convert raw ML prediction → richer scoring object used by analysis pipeline.
     * Builds a synthetic FraudSignal from the dataset features (Amount magnitude
     * and most-influential V-features) so the gateway's response shape stays
     * compatible with the existing AnalysisEntity schema.
     */
    toScoring(features: MlFeatures, raw: MlPredictResponse): MlScoringResult {
        const score = mkRiskScore(raw.primary.risk_score);
        const riskLevel = scoreToRiskLevel(score);
        const verdict = this.deriveVerdict(score);
        const decision = this.buildDecision(verdict, riskLevel);

        const confidence = mkConfidence(
            Math.max(raw.primary.probability, 1 - raw.primary.probability),
        );

        const signals = this.buildSignals(features, raw);
        const reasoning = this.buildReasoning(features, raw);
        const recommendations = this.buildRecommendations(verdict, raw);

        return {
            riskScore: score,
            riskLevel,
            confidence,
            verdict,
            modelVersion: `finguard-ml/${raw.primary.model}`,
            signals,
            reasoning,
            recommendations,
            decision,
            processingTimeMs: raw.processing_ms,
        };
    }

    private deriveVerdict(score: number): Verdict {
        if (score <= 30) return 'approved';
        if (score <= 60) return 'approved_with_review';
        if (score <= 85) return 'approved_with_review';
        return 'blocked';
    }

    private buildDecision(verdict: Verdict, riskLevel: RiskLevel): LegitimacyDecision {
        switch (verdict) {
            case 'approved':
                return {
                    verdict: 'approved',
                    riskLevel: riskLevel as Extract<RiskLevel, 'low' | 'medium'>,
                    requiresReview: false,
                    blockedReason: null,
                    reviewDeadlineMs: null,
                };
            case 'approved_with_review':
                return {
                    verdict: 'approved_with_review',
                    riskLevel: riskLevel as Extract<RiskLevel, 'medium' | 'high'>,
                    requiresReview: true,
                    blockedReason: null,
                    reviewDeadlineMs: Date.now() + 24 * 3_600_000,
                };
            case 'blocked':
                return {
                    verdict: 'blocked',
                    riskLevel: riskLevel as Extract<RiskLevel, 'high' | 'critical'>,
                    requiresReview: false,
                    blockedReason: {
                        category: 'ai_detected',
                        code: 'ML_FRAUD_PROBABILITY',
                        description: 'ML ensemble probability exceeded blocking threshold',
                        weight: mkConfidence(1),
                    },
                    reviewDeadlineMs: null,
                };
            default:
                return {
                    verdict: 'pending_manual_review',
                    riskLevel,
                    requiresReview: true,
                    blockedReason: null,
                    reviewDeadlineMs: Date.now() + 48 * 3_600_000,
                };
        }
    }

    private buildSignals(features: MlFeatures, raw: MlPredictResponse): ReadonlyArray<FraudSignal> {
        const signals: FraudSignal[] = [];

        for (const p of raw.predictions) {
            signals.push({
                category: 'ai_detected',
                code: `ML_${p.model.toUpperCase()}_SCORE`,
                description: `Model ${p.model} produced fraud probability ${(p.probability * 100).toFixed(2)}% (label=${p.label})`,
                weight: mkConfidence(Math.min(1, Math.max(0, p.probability))),
            });
        }

        const norm = raw.feature_vector_normalised;
        const featureNames = [...Array.from({ length: 28 }, (_, i) => `V${i + 1}`), 'Amount', 'Time'];

        const indexedAbs = norm
            .map((v, i) => ({ name: featureNames[i] ?? `f${i}`, abs: Math.abs(v), value: v }))
            .sort((a, b) => b.abs - a.abs);

        for (const top of indexedAbs.slice(0, 3).filter((t) => t.abs >= 2)) {
            signals.push({
                category: 'pattern_match',
                code: `ANOMALY_${top.name}`,
                description: `${top.name} is ${top.value.toFixed(2)} σ from training mean — pattern outlier`,
                weight: mkConfidence(Math.min(1, top.abs / 5)),
            });
        }

        if (features.Amount > 1000) {
            signals.push({
                category: 'amount_anomaly',
                code: 'HIGH_AMOUNT',
                description: `Transaction amount ${features.Amount.toFixed(2)} exceeds 1000`,
                weight: mkConfidence(Math.min(1, features.Amount / 10000)),
            });
        }

        return signals;
    }

    private buildReasoning(features: MlFeatures, raw: MlPredictResponse): string {
        const parts: string[] = [];
        const lr = raw.predictions.find((p) => p.model === 'logreg');
        const nn = raw.predictions.find((p) => p.model === 'nn');
        const primary = raw.primary;

        if (lr && nn) {
            parts.push(
                `Logistic Regression and Neural Network agree on label ${primary.label === 1 ? 'fraud' : 'legit'} ` +
                    `(LR=${(lr.probability * 100).toFixed(2)}%, NN=${(nn.probability * 100).toFixed(2)}%). ` +
                    `The ${primary.model} model serves as the primary scorer.`,
            );
        } else if (lr) {
            parts.push(`Logistic Regression returned probability ${(lr.probability * 100).toFixed(2)}%.`);
        } else if (nn) {
            parts.push(`Neural Network returned probability ${(nn.probability * 100).toFixed(2)}%.`);
        }

        parts.push(
            `Final risk score is ${primary.risk_score}/100 → verdict "${this.deriveVerdict(primary.risk_score)}". ` +
                `Inference completed in ${raw.processing_ms} ms on ${raw.feature_vector_normalised.length} normalised features.`,
        );

        if (features.Amount > 0) {
            parts.push(`Transaction amount: $${features.Amount.toFixed(2)}.`);
        }
        return parts.join(' ');
    }

    private buildRecommendations(verdict: Verdict, raw: MlPredictResponse): ReadonlyArray<string> {
        switch (verdict) {
            case 'approved':
                return ['Allow transaction without further checks.'];
            case 'approved_with_review':
                return [
                    'Approve but flag for asynchronous review.',
                    'Compare normalised features against population baseline.',
                ];
            case 'blocked':
                return [
                    'Block transaction immediately and notify cardholder.',
                    'Open fraud investigation with the captured feature vector.',
                    `Review LogReg vs NN agreement (${raw.predictions.map((p) => p.model + '=' + p.label).join(', ')}).`,
                ];
            default:
                return ['Send to manual review queue.'];
        }
    }
}
