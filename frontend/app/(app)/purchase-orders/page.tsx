import { EmptyState, PageHeader } from "@/app/_components/ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import type { PurchaseOrder } from "@/lib/types";

import { OrderDecision } from "./order-decision";

export const metadata = { title: "Órdenes de compra — ASOFER" };

export default async function PurchaseOrdersPage() {
  const orders = await api<PurchaseOrder[]>("/purchase-orders");
  const pendientes = orders.filter((o) => o.status === "PENDIENTE");
  const resueltas = orders.filter((o) => o.status !== "PENDIENTE");

  const totalOrden = (o: PurchaseOrder) =>
    o.lines.reduce((acc, l) => acc + l.orderedQty * Number(l.unitPrice), 0);

  return (
    <>
      <PageHeader
        title="Órdenes de compra"
        description="Aprobación, ajuste de precios y rechazo"
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Pendientes de aprobación ({pendientes.length})
        </h2>
        {pendientes.length === 0 ? (
          <EmptyState message="No hay órdenes esperando tu aprobación." />
        ) : (
          <div className="flex flex-col gap-3">
            {pendientes.map((order) => (
              <OrderDecision key={order.id} order={order} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Historial ({resueltas.length})
        </h2>
        {resueltas.length === 0 ? (
          <EmptyState message="Todavía no hay órdenes resueltas." />
        ) : (
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Fecha</TableHead>
                    <TableHead className="w-44">Estado</TableHead>
                    <TableHead className="w-36">Total</TableHead>
                    <TableHead>Motivo de rechazo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resueltas.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-muted-foreground">
                        {formatDate(o.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            o.status === "RECHAZADA"
                              ? "border-status-danger/30 bg-status-danger/15 text-status-danger"
                              : "border-status-success/30 bg-status-success/15 text-status-success"
                          }
                        >
                          {o.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatCurrency(totalOrden(o))}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {o.rejectionReason ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}
