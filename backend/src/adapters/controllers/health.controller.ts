import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../infrastructure/persistence/prisma/prisma.service';
import { RedisService } from '../../infrastructure/cache/redis.service';
import { Public } from '@adapters/decorators/public.decorator';

@Public()
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}
  @Get(['health', 'api/v1/health'])
  async checkHealth() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.all([this.prisma.$queryRaw`SELECT 1`, this.redis.ping()]),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timeout')), 3500); }),
      ]);
      return { status: 'ok' };
    } catch { throw new ServiceUnavailableException('Service temporarily unavailable'); }
    finally { if (timer) clearTimeout(timer); }
  }
}
