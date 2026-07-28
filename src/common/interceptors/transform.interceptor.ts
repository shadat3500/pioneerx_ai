import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  statusCode: number;
  message: string;
  data: T;
  success: boolean;
}

function isPaginatedPayload(
  data: unknown,
): data is { data: unknown[]; meta: Record<string, unknown>; message?: string } {
  return (
    !!data &&
    typeof data === 'object' &&
    Array.isArray((data as any).data) &&
    !!(data as any).meta &&
    typeof (data as any).meta === 'object'
  );
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const response = context.switchToHttp().getResponse();
    return next.handle().pipe(
      map((data) => {
        if (response.headersSent || typeof data === 'undefined') {
          return {
            statusCode: response.statusCode ?? 200,
            message: 'Operation successful',
            data: undefined as unknown as T,
            success: true,
          };
        }

        // Keep { data, meta } intact for list endpoints
        if (isPaginatedPayload(data)) {
          return {
            statusCode: response.statusCode,
            message: data.message || 'Operation successful',
            data: { data: data.data, meta: data.meta } as T,
            success: true,
          };
        }

        return {
          statusCode: response.statusCode,
          message: data?.message || 'Operation successful',
          data: (data?.data !== undefined ? data.data : data) as T,
          success: true,
        };
      }),
    );
  }
}
