import 'multer';
import { MlService } from './ml.service';
declare class PredictBodyDto {
    features: Record<string, number>;
    threshold?: number;
    model?: string;
}
declare class RetrainQueryDto {
    skipNn?: boolean;
}
export declare class MlController {
    private readonly ml;
    constructor(ml: MlService);
    health(): Promise<unknown>;
    modelInfo(): Promise<unknown>;
    metrics(): Promise<unknown>;
    predict(body: PredictBodyDto): Promise<{
        raw: import("./ml.service").MlPredictResponse;
        scoring: import("./ml.service").MlScoringResult;
    }>;
    retrain(q: RetrainQueryDto): Promise<unknown>;
    retrainStatus(): Promise<unknown>;
    datasetInfo(): Promise<unknown>;
    uploadDataset(file: Express.Multer.File): Promise<unknown>;
}
export {};
