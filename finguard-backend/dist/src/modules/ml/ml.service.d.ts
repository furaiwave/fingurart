import { ConfigService } from '@nestjs/config';
import { type ConfidenceScore, type FraudSignal, type LegitimacyDecision, type RiskLevel, type RiskScore, type Verdict } from "../../../shared/types";
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
export declare class MlService {
    private readonly cfg;
    private readonly logger;
    private readonly baseUrl;
    private readonly threshold;
    constructor(cfg: ConfigService);
    private req;
    health(): Promise<unknown>;
    modelInfo(): Promise<unknown>;
    metrics(): Promise<unknown>;
    predict(features: MlFeatures, opts?: {
        threshold?: number;
        model?: MlModelChoice;
    }): Promise<MlPredictResponse>;
    retrain(skipNn?: boolean): Promise<unknown>;
    retrainStatus(): Promise<unknown>;
    datasetInfo(): Promise<unknown>;
    uploadDataset(buffer: Buffer, filename: string, mimetype: string): Promise<unknown>;
    toScoring(features: MlFeatures, raw: MlPredictResponse): MlScoringResult;
    private deriveVerdict;
    private buildDecision;
    private buildSignals;
    private buildReasoning;
    private buildRecommendations;
}
