import { format, transports } from 'winston';
import {
  WinstonModuleOptions,
  utilities as nestWinstonModuleUtilities,
} from 'nest-winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';
import { join } from 'path';

// Absolute path so log + audit files always land in backend/logs,
// regardless of the working directory the app was started from.
const logDir = join(process.cwd(), 'logs');

export const winstonConfig: WinstonModuleOptions = {
  transports: [
    // Console log
    new transports.Console({
      format: format.combine(
        format.timestamp(),
        format.ms(),
        nestWinstonModuleUtilities.format.nestLike('NestApp', {
          colors: true,
          prettyPrint: true,
        }),
      ),
    }),
    // Error logs (Daily rotate)
    new DailyRotateFile({
      dirname: logDir,
      filename: 'error-%DATE%.log',
      auditFile: join(logDir, '.error-audit.json'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'error',
      format: format.combine(format.timestamp(), format.json()),
    }),
    // Combined logs (Daily rotate)
    new DailyRotateFile({
      dirname: logDir,
      filename: 'combined-%DATE%.log',
      auditFile: join(logDir, '.combined-audit.json'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: format.combine(format.timestamp(), format.json()),
    }),
  ],
};
