"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var GlobalExceptionFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
let GlobalExceptionFilter = GlobalExceptionFilter_1 = class GlobalExceptionFilter {
    logger = new common_1.Logger(GlobalExceptionFilter_1.name);
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse();
        const status = exception instanceof common_1.HttpException
            ? exception.getStatus()
            : common_1.HttpStatus.INTERNAL_SERVER_ERROR;
        const code = exception instanceof common_1.HttpException
            ? common_1.HttpStatus[status] ?? `HTTP_${status}`
            : 'INTERNAL_ERROR';
        let message = 'Unknown error';
        let details;
        if (exception instanceof common_1.HttpException) {
            const r = exception.getResponse();
            if (typeof r === 'string') {
                message = r;
            }
            else if (r && typeof r === 'object') {
                const obj = r;
                const m = obj.message;
                if (typeof m === 'string')
                    message = m;
                else if (Array.isArray(m))
                    message = m.join('; ');
                else if (typeof obj.error === 'string')
                    message = obj.error;
                else
                    message = exception.message;
                if ('details' in obj)
                    details = obj.details;
                else if (Array.isArray(m))
                    details = { items: m };
            }
            else {
                message = exception.message;
            }
        }
        else if (exception instanceof Error) {
            message = exception.message;
        }
        if (status >= 500) {
            this.logger.error(`[${status}] ${code}: ${message}`);
        }
        const body = {
            success: false,
            error: { code, message, ...(details ? { details } : {}) },
            timestamp: new Date().toISOString(),
        };
        res.status(status).json(body);
    }
};
exports.GlobalExceptionFilter = GlobalExceptionFilter;
exports.GlobalExceptionFilter = GlobalExceptionFilter = GlobalExceptionFilter_1 = __decorate([
    (0, common_1.Catch)()
], GlobalExceptionFilter);
//# sourceMappingURL=exception.filter.js.map