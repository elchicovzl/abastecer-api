import { Boxes, HardHat, ShieldCheck, Wrench } from "lucide-react";

import { EmptyState, PageHeader, StatusBadge } from "@/app/_components/ui";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/format";
import { getSessionUser } from "@/lib/session";
import type { Requisition, SpendRow } from "@/lib/types";

import { SpendChart } from "./spend-chart";

export const metadata = { title: "Dashboard — ASOFER" };

const CATEGORIES = [
  { key: "MATERIALES", label: "Materiales", icon: Boxes },
  { key: "EQUIPOS", label: "Equipos", icon: Wrench },
  { key: "DOTACION", label: "Dotación", icon: HardHat },
  { key: "CONSUMIBLES", label: "Consumibles", icon: ShieldCheck },
] as const;

interface Contract {
  id: string;
  code: string;
  name: string;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ contractId?: string; from?: string; to?: string }>;
}) {
  const filters = await searchParams;
  const user = await getSessionUser();
  const esCoordinador = user?.role === "COORDINATOR";

  const query = new URLSearchParams();
  // El COORDINATOR nunca manda contractId: el backend le impone el suyo.
  // Mandarlo desde acá sería confiar en el cliente para algo de seguridad.
  if (!esCoordinador && filters.contractId)
    query.set("contractId", filters.contractId);
  if (filters.from) query.set("from", filters.from);
  if (filters.to) query.set("to", filters.to);
  const qs = query.toString() ? `?${query.toString()}` : "";

  const [spend, requisitions, contracts] = await Promise.all([
    api<SpendRow[]>(`/reports/spend${qs}`),
    api<Requisition[]>(`/reports/requisitions${qs}`),
    esCoordinador
      ? Promise.resolve([] as Contract[])
      : api<Contract[]>("/admin/contracts").catch(() => [] as Contract[]),
  ]);

  const total = spend.reduce((acc, s) => acc + s.total, 0);
  const enCurso = requisitions.filter(
    (r) => r.status !== "ENTREGADO" && r.status !== "RECHAZADA",
  ).length;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          esCoordinador
            ? "Métricas de tu contrato"
            : "Métricas por contrato y clasificación de gasto"
        }
      />

      <Card>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3">
            {/* Sin selector de contrato para el coordinador: no tiene nada
                que elegir, y ofrecerlo sería mentirle. */}
            {!esCoordinador && contracts.length > 0 && (
              <div className="grid gap-1.5">
                <Label htmlFor="contractId">Contrato</Label>
                <select
                  id="contractId"
                  name="contractId"
                  defaultValue={filters.contractId ?? ""}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                >
                  <option value="">Todos</option>
                  {contracts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="from">Desde</Label>
              <Input
                id="from"
                name="from"
                type="date"
                defaultValue={filters.from ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="to">Hasta</Label>
              <Input
                id="to"
                name="to"
                type="date"
                defaultValue={filters.to ?? ""}
              />
            </div>
            <Button type="submit">Filtrar</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardDescription>Gasto total aprobado</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {formatCurrency(total)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Solo órdenes aprobadas o recibidas. Una orden pendiente todavía no
              es gasto: puede rechazarse.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Gasto por clasificación</CardTitle>
            <CardDescription>
              {enCurso} requisición{enCurso === 1 ? "" : "es"} en curso
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SpendChart spend={spend} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {CATEGORIES.map((cat) => (
          <Card key={cat.key}>
            <CardContent className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted">
                <cat.icon className="size-5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{cat.label}</p>
                <p className="truncate text-lg font-semibold tabular-nums">
                  {formatCurrency(
                    spend.find((s) => s.category === cat.key)?.total ?? 0,
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Artículos solicitados ({requisitions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {requisitions.length === 0 ? (
            <EmptyState message="No hay requisiciones en el rango seleccionado." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Fecha</TableHead>
                  <TableHead>Artículos</TableHead>
                  <TableHead className="w-52">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requisitions.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.createdAt)}
                    </TableCell>
                    <TableCell>
                      {r.lines
                        .map(
                          (l) => `${l.item?.name ?? "Artículo"} ×${l.quantity}`,
                        )
                        .join(", ")}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
