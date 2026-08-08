import { Controller, Get } from "@nestjs/common";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../auth/decorators";
import { AdminService } from "./admin.service";

@Controller("admin")
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get("items")
  items() {
    return this.service.listItems();
  }

  @Get("employees")
  employees(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listEmployees(user);
  }

  @Get("contracts")
  contracts(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listContracts(user);
  }

  @Get("users")
  users(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listUsers(user);
  }
}
