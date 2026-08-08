import { Body, Controller, Get, HttpCode, Post, UsePipes } from "@nestjs/common";

import { AuthService } from "./auth.service";
import { loginSchema, refreshSchema, type AuthenticatedUser } from "./auth.types";
import { CurrentUser, Public } from "./decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("login")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(loginSchema))
  login(@Body() body: { email: string; password: string }) {
    return this.auth.login(body.email, body.password);
  }

  @Public()
  @Post("refresh")
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(refreshSchema))
  refresh(@Body() body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken);
  }

  @Post("logout")
  @HttpCode(204)
  @UsePipes(new ZodValidationPipe(refreshSchema))
  async logout(@Body() body: { refreshToken: string }): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }

  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
