import { format, transports } from 'winston';
import {
  WinstonModuleOptions,
  utilities as nestWinstonModuleUtilities,
} from 'nest-winston';
import * as DailyRotateFile from 'winston-daily-rotate-file';

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
      dirname: 'logs',
      filename: 'error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'error',
      format: format.combine(format.timestamp(), format.json()),
    }),
    // Combined logs (Daily rotate)
    new DailyRotateFile({
      dirname: 'logs',
      filename: 'combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: format.combine(format.timestamp(), format.json()),
    }),
  ],
};
