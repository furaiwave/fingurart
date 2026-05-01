import { ConfigService } from '@nestjs/config';
import { type AiAnalysisResult, type AnyTransaction, type RuleDefinition } from "../../../shared/types";
import { Repository } from 'typeorm';
import { AnalysisEntity } from "../../common/interceptors/entities/analysis";
import type { AnalysisResponseDto } from "../../common/dto/responseAnalysis";
import { MlService } from '../ml/ml.service';
export declare class AiAnalysisService {
    private readonly config;
    private readonly repo;
    private readonly ml;
    private readonly logger;
    private readonly client;
    private readonly anthropicEnabled;
    constructor(config: ConfigService, repo: Repository<AnalysisEntity>, ml: MlService);
    analyze(transaction: AnyTransaction, activeRules: ReadonlyArray<RuleDefinition>): Promise<AiAnalysisResult>;
    private analyzeWithMl;
    private analyzeWithClaude;
    private analyzeWithFallback;
    toResponseDto(a: AnalysisEntity): AnalysisResponseDto;
    private extractMlFeatures;
    private applyRules;
    private deriveVerdictFromScore;
    private buildDecision;
    private systemPrompt;
    private buildPrompt;
    private parseResponse;
    private fallbackSchema;
}
