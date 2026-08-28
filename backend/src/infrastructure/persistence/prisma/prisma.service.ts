import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await (this as any).$connect();
      this.logger.log('PostgreSQL database connected via Prisma.');
    } catch (err: any) {
      this.logger.warn('PostgreSQL connection deferred (local DB offline). Server running in dev mode.');
    }
  }

  async onModuleDestroy() {
    try {
      await (this as any).$disconnect();
    } catch {}
  }
}
