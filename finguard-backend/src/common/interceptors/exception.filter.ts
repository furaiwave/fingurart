import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';
import type { Response } from 'express';

import type { ApiError } from 'shared/types';

/**
 * Single envelope for every error path. Without this, a thrown HttpException
 * (or any other error) bypasses ResponseIntercaptor and NestJS emits the bare
 * `{statusCode, message, error}` body — which the frontend's req() can't parse
 * as ApiResponse<T>, leading to "json.error is undefined" TypeErrors on the UI.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(GlobalExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse<Response>();

        const status =
            exception instanceof HttpException
                ? exception.getStatus()
                : HttpStatus.INTERNAL_SERVER_ERROR;

        const code =
            exception instanceof HttpException
                ? HttpStatus[status] ?? `HTTP_${status}`
                : 'INTERNAL_ERROR';

        let message = 'Unknown error';
        let details: Record<string, unknown> | undefined;

        if (exception instanceof HttpException) {
            const r = exception.getResponse();
            if (typeof r === 'string') {
                message = r;
            } else if (r && typeof r === 'object') {
                const obj = r as Record<string, unknown>;
                const m = obj.message;
                if (typeof m === 'string') message = m;
                else if (Array.isArray(m)) message = m.join('; ');
                else if (typeof obj.error === 'string') message = obj.error;
                else message = exception.message;
                // Carry over any structured detail (e.g. validation errors).
                if ('details' in obj) details = obj.details as Record<string, unknown>;
                else if (Array.isArray(m)) details = { items: m };
            } else {
                message = exception.message;
            }
        } else if (exception instanceof Error) {
            message = exception.message;
        }

        if (status >= 500) {
            this.logger.error(`[${status}] ${code}: ${message}`);
        }

        const body: ApiError = {
            success: false,
            error: { code, message, ...(details ? { details } : {}) },
            timestamp: new Date().toISOString(),
        };

        res.status(status).json(body);
    }
}
