import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Catch-all filter so unexpected failures (Playwright timeouts, DNS errors,
 * etc.) return a predictable JSON shape instead of Nest's default 500 page.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json({
        success: false,
        statusCode: status,
        error: exception.getResponse(),
      });
      return;
    }

    const err = exception as Error;
    this.logger.error(err?.message ?? String(exception), err?.stack);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: err?.message ?? 'Unknown error while rendering the page',
    });
  }
}
