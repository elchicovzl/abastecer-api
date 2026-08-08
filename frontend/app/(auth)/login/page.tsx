import { Package } from "lucide-react";
import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Ingresar — ASOFER",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Package className="size-5" />
          </div>
          <div>
            <p className="text-lg font-semibold leading-tight">ASOFER</p>
            <p className="text-xs text-muted-foreground">
              Obras y mejoras estructurales
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ingresar</CardTitle>
            <CardDescription>
              Compras e inventarios · acceso por rol
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
