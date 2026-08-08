import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix("api");

  // CORS explícito, no wildcard. `credentials: true` es necesario para
  // la cookie httpOnly del refresh token (ADR-001) — y un wildcard con
  // credentials lo rechaza el navegador, no el servidor.
  app.enableCors({
    origin: config.get<string>("CORS_ORIGIN", "http://localhost:3000"),
    credentials: true,
  });

  // Cierra conexiones de Prisma y termina requests en vuelo antes de morir.
  app.enableShutdownHooks();

  const port = config.get<number>("PORT", 3100);
  await app.listen(port);

  new Logger("Bootstrap").log(`ASOFER API escuchando en :${port}/api`);
}

void bootstrap();
