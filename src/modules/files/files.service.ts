import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FilesService {
  constructor(private configService: ConfigService) {}

  async uploadFile(file: any) {
    const baseUrl = this.configService.get<string>('BASE_URL') || 'http://localhost:3000';
    return {
      filename: file.filename,
      url: `${baseUrl}/uploads/${file.filename}`,
    };
  }
}
