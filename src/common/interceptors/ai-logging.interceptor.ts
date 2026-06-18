import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class AiLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AiPerformance');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - now;
        
        // Log performance for AI generation and daily task endpoints
        if (url.includes('/generate') || url.includes('/daily-tasks/regenerate') || url.includes('/daily-tasks/today')) {
          this.logger.log(
            `[AI Request Latency] ${method} ${url} - Total Request Time: ${duration}ms`,
          );
        }
      }),
    );
  }
}
