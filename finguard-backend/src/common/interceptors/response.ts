<<<<<<< Updated upstream
import { Injectable, NestInterceptor, ExecutionContext, CallHandler,
    HttpException, HttpStatus
} from '@nestjs/common'
import { Observable, throwError } from 'rxjs'
import { map, catchError } from 'rxjs/operators'
=======
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
>>>>>>> Stashed changes
import { type ApiResponse } from 'shared/types'

/**
 * Wraps successful responses in the {success, data, timestamp} envelope.
 * Errors are handled by GlobalExceptionFilter — DO NOT re-throw plain objects
 * here; NestJS only knows how to serialise Errors / HttpExceptions.
 */
@Injectable()
export class ResponseIntercaptor<T> implements NestInterceptor<T, ApiResponse<T>> {
    intercept(
        _ctx: ExecutionContext,
        next: CallHandler<T>
    ): Observable<ApiResponse<T>> {
        return next.handle().pipe(
            map((data): ApiResponse<T> => ({
                success: true,
                data,
                timestamp: new Date().toISOString()
<<<<<<< Updated upstream
            })),
            catchError((err: unknown) => {
                const status  = err instanceof HttpException ? err.getStatus() : 500
                const code    = HttpStatus[status] ?? 'INTERNAL_ERROR'
                const message = err instanceof HttpException
                    ? (() => { const r = err.getResponse(); return typeof r === 'string' ? r : (r as any).message ?? err.message })()
                    : err instanceof Error ? err.message : 'Unknown error'
                return throwError(() => new HttpException(
                    { success: false, error: { code, message }, timestamp: new Date().toISOString() },
                    status,
                ))
            })
=======
            }))
>>>>>>> Stashed changes
        )
    }
}