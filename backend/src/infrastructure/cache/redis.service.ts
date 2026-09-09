import { Injectable, OnModuleDestroy, OnModuleInit, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD', '');

    this.client = new Redis({
      host,
      port,
      password: password || undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });

    void this.client.connect().catch(() => this.logger.warn('Redis unavailable'));

    this.client.on('error', (err) => {
      this.logger.warn(`Redis connection status: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {}
    }
  }

  async setRefreshToken(userId: string, tokenId: string, token: string, ttlSeconds: number = 604800): Promise<void> {
    const key = `refresh_token:${userId}:${tokenId}`;
    try {
      await this.client.set(key, token, 'EX', ttlSeconds);
    } catch {}
  }

  async getRefreshToken(userId: string, tokenId: string): Promise<string | null> {
    const key = `refresh_token:${userId}:${tokenId}`;
    try {
      return await this.client.get(key);
    } catch {
      return null;
    }
  }

  async revokeRefreshToken(userId: string, tokenId: string): Promise<void> {
    const key = `refresh_token:${userId}:${tokenId}`;
    try {
      await this.client.del(key);
    } catch {}
  }

  async incrementFailedAttempts(key: string, ttlSeconds: number = 900, strict = false): Promise<number> {
    try {
      if (strict) {
        const count = Number(await this.client.eval("local n=redis.call('INCR',KEYS[1]); if redis.call('TTL',KEYS[1])<0 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n", 1, `failed_attempts:${key}`, ttlSeconds));
        if (!Number.isSafeInteger(count) || count < 1) throw new Error('Invalid counter');
        return count;
      }
      const attempts = await this.client.incr(`failed_attempts:${key}`);
      if (attempts === 1) {
        await this.client.expire(`failed_attempts:${key}`, ttlSeconds);
      }
      return attempts;
    } catch {
      if (strict) throw new ServiceUnavailableException('Clock authentication temporarily unavailable. Please try later.');
      return 0;
    }
  }

  async getFailedAttempts(key: string, strict = false): Promise<number> {
    try {
      const val = await this.client.get(`failed_attempts:${key}`);
      const count = val === null ? 0 : Number(val);
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid counter');
      return count;
    } catch {
      if (strict) throw new ServiceUnavailableException('Clock authentication temporarily unavailable. Please try later.');
      return 0;
    }
  }

  async resetFailedAttempts(key: string, strict = false): Promise<void> {
    try {
      await this.client.del(`failed_attempts:${key}`);
    } catch {
      if (strict) throw new ServiceUnavailableException('Clock authentication temporarily unavailable. Please try later.');
    }
  }
}
