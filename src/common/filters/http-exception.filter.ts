import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private configService: ConfigService) {}

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
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

    const errorResponse = {
      code: status,
      message: message,
      success: false,
      ...(env === 'development' && { stack: exception.stack }),
    };

    response.status(status).json(errorResponse);
  }
}
