import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes } from "node:crypto";

import { PrismaService } from "../prisma/prisma.service";
import type { AuthenticatedUser, JwtPayload } from "./auth.types";

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string): Promise<TokenPair & { user: AuthenticatedUser }> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Mismo error para "no existe" y "contraseña mala": distinguirlos le
    // regala al atacante un enumerador de usuarios válidos.
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException("Credenciales inválidas");
    }

    const authenticated: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      role: user.role,
      contractId: user.contractId,
    };

    return { ...(await this.issueTokens(authenticated)), user: authenticated };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    // ADR-001: revocación REAL. Si el logout marcó `revokedAt`, el token deja
    // de servir en el acto — no hay que esperar a que expire.
    if (!stored || stored.revokedAt !== null || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token inválido o revocado");
    }
    if (!stored.user.active) {
      throw new UnauthorizedException("Usuario inactivo");
    }

    return {
      accessToken: await this.signAccessToken({
        id: stored.user.id,
        email: stored.user.email,
        role: stored.user.role,
        contractId: stored.user.contractId,
      }),
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    // updateMany y no update: si el token no existe, no queremos filtrar esa
    // información con un 404. El logout siempre responde igual.
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(user: AuthenticatedUser): Promise<TokenPair> {
    const refreshToken = randomBytes(48).toString("base64url");

    await this.prisma.refreshToken.create({
      data: {
        tokenHash: this.hashToken(refreshToken),
        userId: user.id,
        expiresAt: this.refreshExpiry(),
      },
    });

    return { accessToken: await this.signAccessToken(user), refreshToken };
  }

  private signAccessToken(user: AuthenticatedUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      contractId: user.contractId,
    };
    return this.jwt.signAsync(payload);
  }

  /**
   * SHA-256 y no bcrypt a propósito. El refresh token ya es aleatorio de 48
   * bytes: no hay diccionario que atacar, así que el costo de bcrypt no
   * compra seguridad y sí encarece cada refresh. Lo que importa es que un
   * volcado de la base no entregue tokens usables.
   */
  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private refreshExpiry(): Date {
    const ttl = this.config.get<string>("JWT_REFRESH_TTL", "7d");
    const days = Number.parseInt(ttl.replace(/\D/g, ""), 10) || 7;
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }
}
