"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MlService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MlService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const types_1 = require("../../../shared/types");
let MlService = MlService_1 = class MlService {
    cfg;
    logger = new common_1.Logger(MlService_1.name);
    baseUrl;
    threshold;
    constructor(cfg) {
        this.cfg = cfg;
        this.baseUrl = (cfg.get('ML_URL') ?? 'http://localhost:8000').replace(/\/+$/, '');
        this.threshold = Number(cfg.get('ML_THRESHOLD') ?? '0.5');
    }
    async req(path, init) {
        const url = `${this.baseUrl}${path}`;
        try {
            const res = await fetch(url, {
                ...init,
                headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
            });
            if (!res.ok) {
                const text = await res.text();
                throw new common_1.ServiceUnavailableException(`ML service ${path} returned ${res.status}: ${text.slice(0, 500)}`);
            }
            return (await res.json());
        }
        catch (err) {
            if (err instanceof common_1.ServiceUnavailableException)
                throw err;
            this.logger.error(`ML request failed: ${path} → ${err.message}`);
            throw new common_1.ServiceUnavailableException(`Cannot reach ML service at ${this.baseUrl}. Is it running? (${err.message})`);
        }
    }
    health() {
        return this.req('/health');
    }
    modelInfo() {
        return this.req('/model-info');
    }
    metrics() {
        return this.req('/metrics');
    }
    async predict(features, opts = {}) {
        return this.req('/predict', {
            method: 'POST',
            body: JSON.stringify({
                features,
                threshold: opts.threshold ?? this.threshold,
                model: opts.model ?? 'ensemble',
            }),
        });
    }
    async retrain(skipNn = false) {
        return this.req(`/retrain?skip_nn=${skipNn}`, { method: 'POST' });
    }
    retrainStatus() {
        return this.req('/retrain/status');
    }
    datasetInfo() {
        return this.req('/dataset/info');
    }
    async uploadDataset(buffer, filename, mimetype) {
        const url = `${this.baseUrl}/dataset/upload`;
        const form = new FormData();
        const blob = new Blob([new Uint8Array(buffer)], { type: mimetype || 'text/csv' });
        form.append('file', blob, filename || 'creditcard.csv');
        try {
            const res = await fetch(url, { method: 'POST', body: form });
            if (!res.ok) {
                const text = await res.text();
                throw new common_1.ServiceUnavailableException(`ML /dataset/upload returned ${res.status}: ${text.slice(0, 500)}`);
            }
            return await res.json();
        }
        catch (err) {
            if (err instanceof common_1.ServiceUnavailableException)
                throw err;
            this.logger.error(`Dataset upload failed: ${err.message}`);
            throw new common_1.ServiceUnavailableException(`Cannot reach ML service at ${this.baseUrl}. (${err.message})`);
        }
    }
    toScoring(features, raw) {
        const score = (0, types_1.mkRiskScore)(raw.primary.risk_score);
        const riskLevel = (0, types_1.scoreToRiskLevel)(score);
        const verdict = this.deriveVerdict(score);
        const decision = this.buildDecision(verdict, riskLevel);
        const confidence = (0, types_1.mkConfidence)(Math.max(raw.primary.probability, 1 - raw.primary.probability));
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
    deriveVerdict(score) {
        if (score <= 30)
            return 'approved';
        if (score <= 60)
            return 'approved_with_review';
        if (score <= 85)
            return 'approved_with_review';
        return 'blocked';
    }
    buildDecision(verdict, riskLevel) {
        switch (verdict) {
            case 'approved':
                return {
                    verdict: 'approved',
                    riskLevel: riskLevel,
                    requiresReview: false,
                    blockedReason: null,
                    reviewDeadlineMs: null,
                };
            case 'approved_with_review':
                return {
                    verdict: 'approved_with_review',
                    riskLevel: riskLevel,
                    requiresReview: true,
                    blockedReason: null,
                    reviewDeadlineMs: Date.now() + 24 * 3_600_000,
                };
            case 'blocked':
                return {
                    verdict: 'blocked',
                    riskLevel: riskLevel,
                    requiresReview: false,
                    blockedReason: {
                        category: 'ai_detected',
                        code: 'ML_FRAUD_PROBABILITY',
                        description: 'ML ensemble probability exceeded blocking threshold',
                        weight: (0, types_1.mkConfidence)(1),
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
    buildSignals(features, raw) {
        const signals = [];
        for (const p of raw.predictions) {
            signals.push({
                category: 'ai_detected',
                code: `ML_${p.model.toUpperCase()}_SCORE`,
                description: `Model ${p.model} produced fraud probability ${(p.probability * 100).toFixed(2)}% (label=${p.label})`,
                weight: (0, types_1.mkConfidence)(Math.min(1, Math.max(0, p.probability))),
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
                weight: (0, types_1.mkConfidence)(Math.min(1, top.abs / 5)),
            });
        }
        if (features.Amount > 1000) {
            signals.push({
                category: 'amount_anomaly',
                code: 'HIGH_AMOUNT',
                description: `Transaction amount ${features.Amount.toFixed(2)} exceeds 1000`,
                weight: (0, types_1.mkConfidence)(Math.min(1, features.Amount / 10000)),
            });
        }
        return signals;
    }
    buildReasoning(features, raw) {
        const parts = [];
        const lr = raw.predictions.find((p) => p.model === 'logreg');
        const nn = raw.predictions.find((p) => p.model === 'nn');
        const primary = raw.primary;
        if (lr && nn) {
            parts.push(`Logistic Regression and Neural Network agree on label ${primary.label === 1 ? 'fraud' : 'legit'} ` +
                `(LR=${(lr.probability * 100).toFixed(2)}%, NN=${(nn.probability * 100).toFixed(2)}%). ` +
                `The ${primary.model} model serves as the primary scorer.`);
        }
        else if (lr) {
            parts.push(`Logistic Regression returned probability ${(lr.probability * 100).toFixed(2)}%.`);
        }
        else if (nn) {
            parts.push(`Neural Network returned probability ${(nn.probability * 100).toFixed(2)}%.`);
        }
        parts.push(`Final risk score is ${primary.risk_score}/100 → verdict "${this.deriveVerdict(primary.risk_score)}". ` +
            `Inference completed in ${raw.processing_ms} ms on ${raw.feature_vector_normalised.length} normalised features.`);
        if (features.Amount > 0) {
            parts.push(`Transaction amount: $${features.Amount.toFixed(2)}.`);
        }
        return parts.join(' ');
    }
    buildRecommendations(verdict, raw) {
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
};
exports.MlService = MlService;
exports.MlService = MlService = MlService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MlService);
//# sourceMappingURL=ml.service.js.map