import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';

import {
<<<<<<< Updated upstream
    mkAnalysisId, mkRiskScore, mkConfidence, mkModelVersion,
    scoreToRiskLevel, type AnyTransaction, LegitimacyDecision,
    type AiAnalysisResult, type Verdict, type RiskLevel,
    FraudSignal,
    RuleDefinition
} from 'shared/types'
=======
    mkAnalysisId,
    mkConfidence,
    mkModelVersion,
    mkRiskScore,
    scoreToRiskLevel,
    type AiAnalysisResult,
    type AnyTransaction,
    type FraudSignal,
    type LegitimacyDecision,
    type RiskLevel,
    type RuleDefinition,
    type Verdict,
} from 'shared/types';
>>>>>>> Stashed changes
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalysisEntity } from 'src/common/interceptors/entities/analysis';
import type { AnalysisResponseDto } from 'src/common/dto/responseAnalysis';
import { MlFeatures, MlScoringResult, MlService } from '../ml/ml.service';

// Очікувана структура JSON-відповіді від Claude
type ClaudeSchema = {
    readonly riskScore: number;
    readonly confidence: number;
    readonly verdict: Verdict;
    readonly riskLevel: RiskLevel;
    readonly requiresReview: boolean;
    readonly reviewDeadlineHours: number | null;
    readonly signals: ReadonlyArray<{
        readonly category: FraudSignal['category'];
        readonly code: string;
        readonly description: string;
        readonly weight: number;
    }>;
    readonly reasoning: string;
    readonly recommendations: ReadonlyArray<string>;
    readonly blockedReason: {
        readonly category: FraudSignal['category'];
        readonly code: string;
        readonly description: string;
        readonly weight: number;
    } | null;
};

const ML_FEATURE_KEYS = [...Array.from({ length: 28 }, (_, i) => `V${i + 1}`), 'Amount', 'Time'] as const;

// Перевіряє, що Claude повернув коректну структуру (захист від hallucination)
function isvalidClaudeSchema(data: unknown): data is ClaudeSchema {
    if (typeof data !== 'object' || data === null) return false;
    const d = data as Record<string, unknown>;
    return (
        typeof d['riskScore'] === 'number' &&
        typeof d['confidence'] === 'number' &&
        typeof d['verdict'] === 'string' &&
        typeof d['riskLevel'] === 'string' &&
        typeof d['requiresReview'] === 'boolean' &&
        typeof d['reasoning'] === 'string' &&
        Array.isArray(d['signals']) &&
        Array.isArray(d['recommendations'])
    );
}
<<<<<<< Updated upstream
// Сервіс AI-аналізу: відправляє транзакцію до Claude і зберігає результат
=======

>>>>>>> Stashed changes
@Injectable()
export class AiAnalysisService {
    private readonly logger = new Logger(AiAnalysisService.name);
    private readonly client: Anthropic | null;
    private readonly anthropicEnabled: boolean;

    constructor(
        private readonly config: ConfigService,
        @InjectRepository(AnalysisEntity)
        private readonly repo: Repository<AnalysisEntity>,
        private readonly ml: MlService,
    ) {
        const key = this.config.get<string>('ANTHROPIC_API_KEY');
        this.anthropicEnabled = !!key;
        this.client = key ? new Anthropic({ apiKey: key }) : null;
    }

    // Головний метод: запускає правила → Claude → зберігає в БД → повертає результат
    async analyze(
        transaction: AnyTransaction,
        activeRules: ReadonlyArray<RuleDefinition>,
    ): Promise<AiAnalysisResult> {
        const startMs = Date.now();
        const ruleDelta = this.applyRules(transaction, activeRules);
        const mlFeatures = this.extractMlFeatures(transaction);

        if (mlFeatures) {
            const result = await this.analyzeWithMl(transaction, mlFeatures, ruleDelta, startMs);
            return result;
        }

        if (!this.anthropicEnabled || !this.client) {
            this.logger.warn(
                `Tx ${transaction.transactionId}: no ML features in extraFields and Anthropic disabled — using deterministic fallback.`,
            );
            return this.analyzeWithFallback(transaction, ruleDelta, startMs);
        }

        return this.analyzeWithClaude(transaction, activeRules, ruleDelta, startMs);
    }

    private async analyzeWithMl(
        transaction: AnyTransaction,
        features: MlFeatures,
        ruleDelta: number,
        startMs: number,
    ): Promise<AiAnalysisResult> {
        const raw = await this.ml.predict(features);
        const scoring: MlScoringResult = this.ml.toScoring(features, raw);

        const finalScore = mkRiskScore(scoring.riskScore + ruleDelta);
        const riskLevel = scoreToRiskLevel(finalScore);
        const verdict = this.deriveVerdictFromScore(finalScore);
        const decision = this.buildDecision(verdict, riskLevel, scoring.signals);

        const processingTimeMs = Date.now() - startMs;
        const entity = this.repo.create({
            id: mkAnalysisId(uuidv4()),
            transactionId: transaction.transactionId,
            modelVersion: mkModelVersion(scoring.modelVersion),
            riskScore: finalScore,
            confidence: scoring.confidence,
            verdict: decision.verdict,
            riskLevel: decision.riskLevel,
            requiresReview: decision.requiresReview,
            signals: scoring.signals,
            reasoning:
                ruleDelta !== 0
                    ? `${scoring.reasoning} Rule engine delta: ${ruleDelta > 0 ? '+' : ''}${ruleDelta}.`
                    : scoring.reasoning,
            recommendations: scoring.recommendations,
            processingTimeMs,
            reviewDeadlineMs: decision.reviewDeadlineMs,
            blockedReason: decision.blockedReason,
            analyzedAt: new Date(),
        });
        const saved = await this.repo.save(entity);

        return {
            analysisId: saved.id,
            transactionId: transaction.transactionId,
            modelVersion: saved.modelVersion,
            riskScore: finalScore,
            confidence: scoring.confidence,
            decision,
            signals: scoring.signals,
            reasoning: saved.reasoning,
            recommendations: scoring.recommendations,
            processingTimeMs,
            analyzedAt: saved.analyzedAt,
        };
    }

    private async analyzeWithClaude(
        transaction: AnyTransaction,
        activeRules: ReadonlyArray<RuleDefinition>,
        ruleDelta: number,
        startMs: number,
    ): Promise<AiAnalysisResult> {
        if (!this.client) throw new Error('Anthropic client not configured');

<<<<<<< Updated upstream
        // Спочатку правила дають попередню оцінку ризику (delta ±50)
        const ruleDelta = this.applyRules(transaction, activeRules)
=======
>>>>>>> Stashed changes
        const message = await this.client.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 1500,
            system: this.systemPrompt(),
            messages: [
                {
                    role: 'user',
                    content: this.buildPrompt(transaction, activeRules, ruleDelta),
                },
            ],
        });

        const rawText = message.content
            .filter((b) => b.type === 'text')
            .map((b) => b.text)
            .join('');
<<<<<<< Updated upstream

        const parsed = this.parseResponse(rawText)

        // Фінальний скор = оцінка Claude + поправка від правил
        const finalScore = mkRiskScore(parsed.riskScore + ruleDelta)
        const riskLevel = scoreToRiskLevel(finalScore)
        const decision = this.buildDecision(parsed, finalScore, riskLevel)
=======
        const parsed = this.parseResponse(rawText);

        const finalScore = mkRiskScore(parsed.riskScore + ruleDelta);
        const riskLevel = scoreToRiskLevel(finalScore);
        const verdict = this.deriveVerdictFromScore(finalScore);
>>>>>>> Stashed changes
        const signals: ReadonlyArray<FraudSignal> = parsed.signals.map((s) => ({
            ...s,
            weight: mkConfidence(Math.min(1, Math.max(0, s.weight))),
        }));
        const decision = this.buildDecision(verdict, riskLevel, signals, parsed.blockedReason);

        const processingTimeMs = Date.now() - startMs;
        const entity = this.repo.create({
            id: mkAnalysisId(uuidv4()),
            transactionId: transaction.transactionId,
            modelVersion: mkModelVersion('claude-haiku-4-5'),
            riskScore: finalScore,
            confidence: mkConfidence(parsed.confidence),
            verdict: decision.verdict,
            riskLevel: decision.riskLevel,
            requiresReview: decision.requiresReview,
            signals,
            reasoning: parsed.reasoning,
            recommendations: parsed.recommendations,
            processingTimeMs,
            reviewDeadlineMs: decision.reviewDeadlineMs,
            blockedReason: decision.blockedReason,
            analyzedAt: new Date(),
        });
        const saved = await this.repo.save(entity);

        return {
            analysisId: saved.id,
            transactionId: transaction.transactionId,
            modelVersion: saved.modelVersion,
            riskScore: finalScore,
            confidence: mkConfidence(parsed.confidence),
            decision,
            signals,
            reasoning: parsed.reasoning,
            recommendations: parsed.recommendations,
            processingTimeMs,
            analyzedAt: saved.analyzedAt,
        };
    }

    private async analyzeWithFallback(
        transaction: AnyTransaction,
        ruleDelta: number,
        startMs: number,
    ): Promise<AiAnalysisResult> {
        const baseScore = mkRiskScore(40 + ruleDelta);
        const riskLevel = scoreToRiskLevel(baseScore);
        const verdict = this.deriveVerdictFromScore(baseScore);
        const decision = this.buildDecision(verdict, riskLevel, []);
        const processingTimeMs = Date.now() - startMs;

        const entity = this.repo.create({
            id: mkAnalysisId(uuidv4()),
            transactionId: transaction.transactionId,
            modelVersion: mkModelVersion('finguard-fallback'),
            riskScore: baseScore,
            confidence: mkConfidence(0.5),
            verdict: decision.verdict,
            riskLevel: decision.riskLevel,
            requiresReview: decision.requiresReview,
            signals: [],
            reasoning:
                'No mlFeatures in extraFields and AI provider disabled. ' +
                'Provide V1..V28, Amount, Time in extraFields.mlFeatures to invoke the ML model.',
            recommendations: ['Attach ML feature vector to enable scoring.'],
            processingTimeMs,
            reviewDeadlineMs: decision.reviewDeadlineMs,
            blockedReason: decision.blockedReason,
            analyzedAt: new Date(),
        });
        const saved = await this.repo.save(entity);

        return {
            analysisId: saved.id,
            transactionId: transaction.transactionId,
            modelVersion: saved.modelVersion,
            riskScore: baseScore,
            confidence: mkConfidence(0.5),
            decision,
            signals: [],
            reasoning: saved.reasoning,
            recommendations: saved.recommendations,
            processingTimeMs,
            analyzedAt: saved.analyzedAt,
        };
    }

    toResponseDto(a: AnalysisEntity): AnalysisResponseDto {
        return {
            id: a.id,
            transactionId: a.transactionId,
            modelVersion: a.modelVersion,
            riskScore: a.riskScore,
            confidence: mkConfidence(Number(a.confidence)),
            verdict: a.verdict,
            riskLevel: a.riskLevel,
            requiresReview: a.requiresReview,
            signals: a.signals,
            reasoning: a.reasoning,
            recommendations: a.recommendations,
            processingTimeMs: a.processingTimeMs,
            reviewDeadlineMs: a.reviewDeadlineMs,
            blockedReason: a.blockedReason,
            analyzeAt: a.analyzedAt.toISOString(),
        };
    }

<<<<<<< Updated upstream
    // Перевіряє активні правила та повертає сумарну поправку до ризик-скору (від -50 до +50)
    private applyRules(
        tx: AnyTransaction,
        rules: ReadonlyArray<RuleDefinition>,
    ): number {
        let delta = 0
        const txFlat = tx as unknown as Record<string, unknown>
        for(const rule of rules){
            if(!rule.isActive) continue
            // Кожна умова правила перевіряється окремо
=======
    private extractMlFeatures(tx: AnyTransaction): MlFeatures | null {
        const extras = (tx as unknown as { extraFields?: Record<string, unknown> }).extraFields;
        const candidate =
            (extras?.['mlFeatures'] as Record<string, unknown>) ??
            (extras?.['ml_features'] as Record<string, unknown>) ??
            (extras as Record<string, unknown> | undefined);

        if (!candidate) return null;
        const features: Record<string, number> = {};
        for (const k of ML_FEATURE_KEYS) {
            const raw = candidate[k];
            const num = typeof raw === 'number' ? raw : Number(raw);
            if (!Number.isFinite(num)) return null;
            features[k] = num;
        }
        return features as unknown as MlFeatures;
    }

    private applyRules(tx: AnyTransaction, rules: ReadonlyArray<RuleDefinition>): number {
        let delta = 0;
        const txFlat = tx as unknown as Record<string, unknown>;
        for (const rule of rules) {
            if (!rule.isActive) continue;
>>>>>>> Stashed changes
            const results = rule.conditions.map((c) => {
                const val = txFlat[c.field];
                if (val === undefined) return false;
                switch (c.operator) {
                    case 'gt':
                        return Number(val) > Number(c.value);
                    case 'gte':
                        return Number(val) >= Number(c.value);
                    case 'lt':
                        return Number(val) < Number(c.value);
                    case 'lte':
                        return Number(val) <= Number(c.value);
                    case 'eq':
                        return String(val) === String(c.value);
                    case 'neq':
                        return String(val) !== String(c.value);
                    case 'contains':
                        return String(val).includes(String(c.value));
                    case 'not_contains':
                        return !String(val).includes(String(c.value));
                    case 'in':
                        return Array.isArray(c.value) && (c.value as unknown[]).includes(val);
                    case 'not_in':
                        return Array.isArray(c.value) && !(c.value as unknown[]).includes(val);
                    default:
                        return false;
                }
<<<<<<< Updated upstream
            })

            // AND — всі умови мають бути true; OR — хоча б одна
            const triggered = rule.conditionLogic === 'AND'
                ? results.every(Boolean)
                : results.some(Boolean)

            if(triggered){
                this.logger.debug(`Rule "${rule.name}" triggered → delta ${rule.riskScoreImpact}`)
                delta += rule.riskScoreImpact
=======
            });
            const triggered =
                rule.conditionLogic === 'AND' ? results.every(Boolean) : results.some(Boolean);
            if (triggered) {
                this.logger.debug(`Rule "${rule.name}" triggered → delta ${rule.riskScoreImpact}`);
                delta += rule.riskScoreImpact;
>>>>>>> Stashed changes
            }
        }
        return Math.max(-50, Math.min(50, delta));
    }

    private deriveVerdictFromScore(score: number): Verdict {
        if (score <= 30) return 'approved';
        if (score <= 60) return 'approved_with_review';
        if (score <= 85) return 'approved_with_review';
        return 'blocked';
    }

    // Будує фінальне рішення: вибирає суворіший з двох вердиктів — Claude та порогового
    private buildDecision(
        verdict: Verdict,
        riskLevel: RiskLevel,
<<<<<<< Updated upstream
    ): LegitimacyDecision {
        const reviewDeadlineMs = parsed.reviewDeadlineHours
            ? Date.now() + parsed.reviewDeadlineHours * 3_600_000
            : null

        const primarySignal = parsed.signals[0] ?? null
        const toSignal = (s: ClaudeSchema['blockedReason']): FraudSignal | null => s ? {...s, weight: mkConfidence(s.weight) } : null

        // Пороговий вердикт на основі числового скору
        const effectiveVerdict: Verdict =
            score <= 30 ? 'approved'
            : score <= 60 ? 'approved'
            : score <= 85 ? 'approved_with_review'
            : 'blocked'

        // Числовий порядок для порівняння суворості вердиктів
        const ORDER: Record<Verdict, number> = {
            approved: 0, approved_with_review: 1, pending_manual_review: 2, blocked: 3
        }

        // Беремо суворіший вердикт — Claude або пороговий
        const finalVerdict: Verdict =
            ORDER[parsed.verdict] >= ORDER[effectiveVerdict]
                ? parsed.verdict
                : effectiveVerdict

        switch(finalVerdict){
=======
        signals: ReadonlyArray<FraudSignal>,
        explicitBlockedReason?: ClaudeSchema['blockedReason'],
    ): LegitimacyDecision {
        const reviewDeadlineMs = Date.now() + 24 * 3_600_000;
        switch (verdict) {
>>>>>>> Stashed changes
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
                    reviewDeadlineMs,
                };
            case 'blocked': {
                const blocked: FraudSignal = explicitBlockedReason
                    ? {
                          ...explicitBlockedReason,
                          weight: mkConfidence(Math.min(1, Math.max(0, explicitBlockedReason.weight))),
                      }
                    : signals[0] ?? {
                          category: 'ai_detected',
                          code: 'HIGH_RISK',
                          description: 'Risk exceeds blocking threshold',
                          weight: mkConfidence(1),
                      };
                return {
                    verdict: 'blocked',
                    riskLevel: riskLevel as Extract<RiskLevel, 'high' | 'critical'>,
                    requiresReview: false,
                    blockedReason: blocked,
                    reviewDeadlineMs: null,
                };
            }
            default:
                return {
                    verdict: 'pending_manual_review',
                    riskLevel,
                    requiresReview: true,
                    blockedReason: null,
                    reviewDeadlineMs,
                };
        }
    }

    private systemPrompt(): string {
<<<<<<< Updated upstream
        return `You are an expert financial fraud detection AI.
        Analyze transactions and respond ONLY with a JSON code block.
        IMPORTANT: All text fields (reasoning, recommendations, signals descriptions, blockedReason description) MUST be written in Ukrainian language.
        Required schema:
        \`\`\`json
        {
        "riskScore": <integer 0-100>,
        "confidence": <float 0.0-1.0>,
        "verdict": <"approved"|"approved_with_review"|"blocked"|"pending_manual_review">,
        "riskLevel": <"low"|"medium"|"high"|"critical">,
        "requiresReview": <boolean>,
        "reviewDeadlineHours": <number|null>,
        "signals": [{"category": <string>, "code": <string>, "description": <string in Ukrainian>, "weight": <float>}],
        "reasoning": <string 2-4 sentences in Ukrainian>,
        "recommendations": [<string in Ukrainian>],
        "blockedReason": <signal object with description in Ukrainian|null>
        }
        \`\`\`

        Signal categories: velocity, geolocation, device_fingerprint, behavioral, amount_anomaly, blacklist, pattern_match, ai_detected

        Risk thresholds: 0-30=low/approved, 31-60=medium, 61-85=high/review, 86-100=critical/block
        Conservative bias: false negatives (missed fraud) cost more than false positives.`;
=======
        return `You are an expert financial fraud detection AI. Analyze transactions and respond ONLY with a JSON code block.
Required schema:
\`\`\`json
{
"riskScore": <integer 0-100>,
"confidence": <float 0.0-1.0>,
"verdict": <"approved"|"approved_with_review"|"blocked"|"pending_manual_review">,
"riskLevel": <"low"|"medium"|"high"|"critical">,
"requiresReview": <boolean>,
"reviewDeadlineHours": <number|null>,
"signals": [{"category": <string>, "code": <string>, "description": <string>, "weight": <float>}],
"reasoning": <string 2-4 sentences>,
"recommendations": [<string>],
"blockedReason": <signal object|null>
}
\`\`\`
Signal categories: velocity, geolocation, device_fingerprint, behavioral, amount_anomaly, blacklist, pattern_match, ai_detected
Risk thresholds: 0-30=low/approved, 31-60=medium, 61-85=high/review, 86-100=critical/block
Conservative bias: false negatives (missed fraud) cost more than false positives.`;
>>>>>>> Stashed changes
    }

    private buildPrompt(
        tx: AnyTransaction,
        rules: ReadonlyArray<RuleDefinition>,
        ruleDelta: number,
    ): string {
        const txData = JSON.stringify(
            { ...tx, amountFormatted: `${(tx.amount / 100).toFixed(2)} ${tx.currency}` },
            null,
            2,
        );
        const rulesText =
            rules.length > 0
                ? rules
                      .map(
                          (r) =>
                              `• ${r.name} [${r.action}] impact:${r.riskScoreImpact > 0 ? '+' : ''}${r.riskScoreImpact} — ${r.description}`,
                      )
                      .join('\n')
                : 'No custom rules configured.';
        return `## Transaction Data
<<<<<<< Updated upstream
        \`\`\`json
        ${txData}
        \`\`\`
        
        ## Active Fraud Rules
        ${rulesText}
        
        ## Rule Engine Pre-Score
        Rule delta applied: ${ruleDelta > 0 ? '+' : ''}${ruleDelta} points
        
        Analyze for fraud. Consider: amount anomalies, channel risk, authentication signals (3DS, PIN, CVV), behavioral patterns, rule triggers. Provide your JSON analysis. All text in Ukrainian.`;
    }

    // Витягує JSON з відповіді Claude (markdown-блок або голий об'єкт)
    private parseResponse(raw: string): ClaudeSchema{
        const match = raw.match(/```json\s*([\s\S]*?)\s*```/) ??
        raw.match(/\{[\s\S]*\}/)
        const jsonStr = match?.[1] ?? match?.[0] ?? '{}'

        try{
            const parsed: unknown = JSON.parse(jsonStr)
            if(!isvalidClaudeSchema(parsed)){
                this.logger.warn('Claude returned invalid schema, using fallback')
                return this.fullbackSchema();
=======
\`\`\`json
${txData}
\`\`\`

## Active Fraud Rules
${rulesText}

## Rule Engine Pre-Score
Rule delta applied: ${ruleDelta > 0 ? '+' : ''}${ruleDelta} points

Analyze for fraud. Provide your JSON analysis.`;
    }

    private parseResponse(raw: string): ClaudeSchema {
        const match = raw.match(/```json\s*([\s\S]*?)\s*```/) ?? raw.match(/\{[\s\S]*\}/);
        const jsonStr = match?.[1] ?? match?.[0] ?? '{}';
        try {
            const parsed: unknown = JSON.parse(jsonStr);
            if (!isvalidClaudeSchema(parsed)) {
                this.logger.warn('Claude returned invalid schema, using fallback');
                return this.fallbackSchema();
>>>>>>> Stashed changes
            }
            return parsed;
        } catch {
            this.logger.error('Failed to parse Claude response JSON');
            return this.fallbackSchema();
        }
    }

<<<<<<< Updated upstream
    // Безпечний fallback при помилці парсингу — транзакція йде на ручну перевірку
    private fullbackSchema(): ClaudeSchema {
=======
    private fallbackSchema(): ClaudeSchema {
>>>>>>> Stashed changes
        return {
            riskScore: 50,
            confidence: 0.5,
            verdict: 'pending_manual_review',
            riskLevel: 'medium',
            requiresReview: true,
            reviewDeadlineHours: 48,
            signals: [],
            reasoning: 'Analysis could not be completed. Transaction flagged for manual review.',
            recommendations: ['Perform manual review of this transaction'],
            blockedReason: null,
        };
    }
}
