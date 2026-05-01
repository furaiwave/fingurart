import {
    BadRequestException,
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
    Query,
    UploadedFile,
    UseInterceptors,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmptyObject, IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator';
import type { Express } from 'express';
import 'multer';

import { ResponseIntercaptor } from '../../common/interceptors/response';
import { MlService } from './ml.service';
import type { MlFeatures, MlModelChoice } from './ml.service';

class PredictBodyDto {
    @IsObject()
    @IsNotEmptyObject()
    features!: Record<string, number>;

    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(1)
    threshold?: number;

    @IsOptional()
    @IsIn(['logreg', 'nn', 'ensemble'])
    model?: string;
}

class RetrainQueryDto {
    @IsOptional()
    @Transform(({ value }) => value === true || value === 'true' || value === '1')
    @IsBoolean()
    skipNn?: boolean;
}

const PIPES = new ValidationPipe({ transform: true, whitelist: true });
const MAX_DATASET_BYTES = 200 * 1024 * 1024; // 200 MB

@UseInterceptors(ResponseIntercaptor)
@UsePipes(PIPES)
@Controller('ml')
export class MlController {
    constructor(private readonly ml: MlService) {}

    @Get('health')
    health() {
        return this.ml.health();
    }

    @Get('model-info')
    modelInfo() {
        return this.ml.modelInfo();
    }

    @Get('metrics')
    metrics() {
        return this.ml.metrics();
    }

    @Post('predict')
    @HttpCode(HttpStatus.OK)
    async predict(@Body() body: PredictBodyDto) {
        const features = body.features as unknown as MlFeatures;
        const raw = await this.ml.predict(features, {
            threshold: body.threshold,
            model: body.model as MlModelChoice | undefined,
        });
        const scoring = this.ml.toScoring(features, raw);
        return { raw, scoring };
    }

    // ─── Async training control ───────────────────────────────────────────────

    @Post('retrain')
    @HttpCode(HttpStatus.ACCEPTED)
    retrain(@Query() q: RetrainQueryDto) {
        return this.ml.retrain(q.skipNn ?? false);
    }

    @Get('retrain/status')
    retrainStatus() {
        return this.ml.retrainStatus();
    }

    // ─── Dataset upload ──────────────────────────────────────────────────────

    @Get('dataset/info')
    datasetInfo() {
        return this.ml.datasetInfo();
    }

    @Post('dataset/upload')
    @HttpCode(HttpStatus.OK)
    @UseInterceptors(
        FileInterceptor('file', {
            limits: { fileSize: MAX_DATASET_BYTES },
        }),
    )
    async uploadDataset(@UploadedFile() file: Express.Multer.File) {
        if (!file) throw new BadRequestException('No file provided in field "file"');
        if (!file.originalname.toLowerCase().endsWith('.csv')) {
            throw new BadRequestException('Only .csv files are accepted');
        }
        return this.ml.uploadDataset(file.buffer, file.originalname, file.mimetype);
    }
}
