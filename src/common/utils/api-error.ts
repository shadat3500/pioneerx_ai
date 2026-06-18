import { HttpException } from '@nestjs/common';

export class ApiError extends HttpException {
  public statusCode: number;
  public isOperational: boolean;

  constructor(
    statusCode: number,
    message: string,
    isOperational = true,
    stack = '',
  ) {
    super(message, statusCode);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
