import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');
  constructor(private configService: ConfigService) {}

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const env = this.configService.get<string>('NODE_ENV') || 'development';

    let status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    if (exception?.code === 'P2002') {
      status = HttpStatus.BAD_REQUEST;
      const target = exception.meta?.target
        ? Array.isArray(exception.meta.target)
          ? exception.meta.target.join(', ')
          : exception.meta.target
        : 'value';
      message = `${target} already exists`;
    }

    // Format message if it's a NestJS default validation error object
    if (typeof message === 'object' && (message as any).message) {
      message = (message as any).message;
    }

    // Log the error if it's a 500 or unknown exception
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} → ${exception.message || message}`,
        exception.stack,
      );
    }

    const errorResponse = {
      code: status,
      message: message,
      success: false,
      ...(env === 'development' && { stack: exception.stack }),
    };

    response.status(status).json(errorResponse);
  }
}
