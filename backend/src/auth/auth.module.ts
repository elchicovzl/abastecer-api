import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule, type JwtModuleOptions } from "@nestjs/jwt";

import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      // `expiresIn` de jsonwebtoken no acepta `string` genérico sino su
      // propio `StringValue` ("15m", "7d"...). El cast es acotado y explícito.
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.get<string>("JWT_ACCESS_SECRET"),
        signOptions: {
          expiresIn: config.get<string>(
            "JWT_ACCESS_TTL",
            "15m",
          ) as JwtModuleOptions["signOptions"] extends { expiresIn?: infer E }
            ? E
            : never,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
