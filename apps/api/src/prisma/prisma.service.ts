import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { getRequestContext } from '../common/http/request-context';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? ['warn', 'error']
          : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  withTenant() {
    const tenantId = getRequestContext()?.tenantId;
    if (!tenantId) {
      return this;
    }

    return this.$extends({
      query: {
        $allModels: {
          async findMany({ args, query }) {
            return query(applyTenant(args, tenantId));
          },
          async findFirst({ args, query }) {
            return query(applyTenant(args, tenantId));
          },
          async findUnique({ args, query }) {
            return query(args);
          },
          async update({ args, query }) {
            return query(applyTenant(args, tenantId));
          },
          async updateMany({ args, query }) {
            return query(applyTenant(args, tenantId));
          },
          async deleteMany({ args, query }) {
            return query(applyTenant(args, tenantId));
          },
        },
      },
    });
  }
}

function applyTenant<T extends { where?: unknown }>(
  args: T,
  tenantId: string,
): T {
  const where =
    typeof args.where === 'object' && args.where !== null
      ? { ...args.where, tenantId }
      : { tenantId };
  return { ...args, where };
}
