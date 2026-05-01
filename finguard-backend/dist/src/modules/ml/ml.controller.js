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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MlController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
require("multer");
const response_1 = require("../../common/interceptors/response");
const ml_service_1 = require("./ml.service");
class PredictBodyDto {
    features;
    threshold;
    model;
}
__decorate([
    (0, class_validator_1.IsObject)(),
    (0, class_validator_1.IsNotEmptyObject)(),
    __metadata("design:type", Object)
], PredictBodyDto.prototype, "features", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(1),
    __metadata("design:type", Number)
], PredictBodyDto.prototype, "threshold", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['logreg', 'nn', 'ensemble']),
    __metadata("design:type", String)
], PredictBodyDto.prototype, "model", void 0);
class RetrainQueryDto {
    skipNn;
}
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Transform)(({ value }) => value === true || value === 'true' || value === '1'),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], RetrainQueryDto.prototype, "skipNn", void 0);
const PIPES = new common_1.ValidationPipe({ transform: true, whitelist: true });
const MAX_DATASET_BYTES = 200 * 1024 * 1024;
let MlController = class MlController {
    ml;
    constructor(ml) {
        this.ml = ml;
    }
    health() {
        return this.ml.health();
    }
    modelInfo() {
        return this.ml.modelInfo();
    }
    metrics() {
        return this.ml.metrics();
    }
    async predict(body) {
        const features = body.features;
        const raw = await this.ml.predict(features, {
            threshold: body.threshold,
            model: body.model,
        });
        const scoring = this.ml.toScoring(features, raw);
        return { raw, scoring };
    }
    retrain(q) {
        return this.ml.retrain(q.skipNn ?? false);
    }
    retrainStatus() {
        return this.ml.retrainStatus();
    }
    datasetInfo() {
        return this.ml.datasetInfo();
    }
    async uploadDataset(file) {
        if (!file)
            throw new common_1.BadRequestException('No file provided in field "file"');
        if (!file.originalname.toLowerCase().endsWith('.csv')) {
            throw new common_1.BadRequestException('Only .csv files are accepted');
        }
        return this.ml.uploadDataset(file.buffer, file.originalname, file.mimetype);
    }
};
exports.MlController = MlController;
__decorate([
    (0, common_1.Get)('health'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MlController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('model-info'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MlController.prototype, "modelInfo", null);
__decorate([
    (0, common_1.Get)('metrics'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MlController.prototype, "metrics", null);
__decorate([
    (0, common_1.Post)('predict'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [PredictBodyDto]),
    __metadata("design:returntype", Promise)
], MlController.prototype, "predict", null);
__decorate([
    (0, common_1.Post)('retrain'),
    (0, common_1.HttpCode)(common_1.HttpStatus.ACCEPTED),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [RetrainQueryDto]),
    __metadata("design:returntype", void 0)
], MlController.prototype, "retrain", null);
__decorate([
    (0, common_1.Get)('retrain/status'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MlController.prototype, "retrainStatus", null);
__decorate([
    (0, common_1.Get)('dataset/info'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], MlController.prototype, "datasetInfo", null);
__decorate([
    (0, common_1.Post)('dataset/upload'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('file', {
        limits: { fileSize: MAX_DATASET_BYTES },
    })),
    __param(0, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], MlController.prototype, "uploadDataset", null);
exports.MlController = MlController = __decorate([
    (0, common_1.UseInterceptors)(response_1.ResponseIntercaptor),
    (0, common_1.UsePipes)(PIPES),
    (0, common_1.Controller)('ml'),
    __metadata("design:paramtypes", [ml_service_1.MlService])
], MlController);
//# sourceMappingURL=ml.controller.js.map