import { PrismaPg } from "@prisma/adapter-pg";
import { Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { PrismaClient } from "./generated/client/client";

/**
 * Prisma 7 exige un driver adapter: la URL ya no vive en el schema, así que
 * el cliente la recibe explícitamente.
 *
 * En tests apunta a TEST_DATABASE_URL. El fallback es deliberadamente
 * explícito: nada de caer a la base de dev por accidente y truncarla.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    const isTest = config.get<string>("NODE_ENV") === "test";
    const url = isTest
      ? config.get<string>("TEST_DATABASE_URL")
      : config.get<string>("DATABASE_URL");

    if (!url) {
      throw new Error(
        isTest
          ? "TEST_DATABASE_URL no está definida (NODE_ENV=test)"
          : "DATABASE_URL no está definida",
      );
    }

    super({ adapter: new PrismaPg({ connectionString: url }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
