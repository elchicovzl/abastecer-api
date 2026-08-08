"use client";

import {
  BarChart3,
  ClipboardList,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Warehouse,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { logoutAction } from "@/app/actions";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { canAccessRoute, type Role } from "@/lib/permissions";
import type { SessionUser } from "@/lib/session";

/**
 * El menú se arma con la MISMA tabla que usa el middleware
 * (`canAccessRoute`). Una sola fuente de verdad: si mañana cambia un permiso,
 * cambia el gating Y el menú a la vez. Dos listas separadas se desincronizan
 * y terminás mostrando links que dan 403.
 */
const NAV = [
  { href: "/requisitions", label: "Requisiciones", icon: ClipboardList },
  { href: "/warehouse", label: "Bodega", icon: Warehouse },
  { href: "/purchase-orders", label: "Órdenes de compra", icon: ShoppingCart },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/admin", label: "Administración", icon: Settings },
] as const;

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  COORDINATOR: "Coordinador",
  WAREHOUSE: "Bodega",
  PURCHASING_MANAGER: "Jefe de compras",
};

export function AppSidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const visible = NAV.filter((item) => canAccessRoute(user.role, item.href));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Package className="size-4" />
          </div>
          <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate font-semibold">ASOFER</span>
            <span className="truncate text-xs text-muted-foreground">
              Compras e inventarios
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Operación</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible.map((item) => {
                const active =
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="px-2 py-1.5 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-medium">{user.email}</p>
              <p className="text-xs text-muted-foreground">
                {ROLE_LABELS[user.role]}
              </p>
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <form action={logoutAction} className="w-full">
              <SidebarMenuButton asChild tooltip="Cerrar sesión">
                <button type="submit" className="w-full">
                  <LogOut />
                  <span>Cerrar sesión</span>
                </button>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
