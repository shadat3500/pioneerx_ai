import { Controller, Get } from '@nestjs/common';
import { HealthCheckService, HttpHealthIndicator, HealthCheck, PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaService } from './prisma/prisma.service';
import { Public } from './modules/auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private prismaHealth: PrismaHealthIndicator,
    private prisma: PrismaService,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.http.pingCheck('google', 'https://google.com'),
      () => this.prismaHealth.pingCheck('database', this.prisma),
    ]);
  }
}
