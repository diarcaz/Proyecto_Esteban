import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
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
}
