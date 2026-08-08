import { AlertTriangle } from "lucide-react";

import { EmptyState, PageHeader, StatusBadge } from "@/app/_components/ui";
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
import { formatDate } from "@/lib/format";
import type { PurchaseOrder, Requisition, StockRow } from "@/lib/types";

import {
  DeliverButton,
  ReceiveForm,
  VerifyStockButton,
} from "./warehouse-actions";

export const metadata = { title: "Bodega — ASOFER" };

export default async function WarehousePage() {
  const [requisitions, orders, lowStock] = await Promise.all([
    api<Requisition[]>("/requisitions"),
    api<PurchaseOrder[]>("/purchase-orders"),
    api<StockRow[]>("/reports/low-stock"),
  ]);

  const porVerificar = requisitions.filter(
    (r) => r.status === "PENDIENTE_INVENTARIO",
  );
  const porRecibir = orders.filter(
    (o) => o.status === "APROBADA" || o.status === "RECIBIDA_PARCIAL",
  );
  // Recepción total completada: falta entregar al contrato o al empleado.
  const porEntregar = requisitions.filter(
    (r) => r.status === "RECIBIDO_EN_BODEGA",
  );

  return (
    <>
      <PageHeader
        title="Bodega"
        description="Verificación de stock y recepción de compras"
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Requisiciones por verificar ({porVerificar.length})
        </h2>
        {porVerificar.length === 0 ? (
          <EmptyState message="No hay requisiciones esperando verificación de stock." />
        ) : (
          <div className="flex flex-col gap-3">
            {porVerificar.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">
                      {r.lines.length} línea{r.lines.length === 1 ? "" : "s"} ·{" "}
                      {formatDate(r.createdAt)}
                    </p>
                    <StatusBadge status={r.status} />
                  </div>
                  <VerifyStockButton id={r.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Órdenes por recibir ({porRecibir.length})
        </h2>
        {porRecibir.length === 0 ? (
          <EmptyState message="No hay órdenes de compra pendientes de recepción." />
        ) : (
          <div className="flex flex-col gap-3">
            {porRecibir.map((o) => (
              // La `key` incluye las cantidades recibidas: cuando cambian,
              // React REMONTA el formulario y su estado se reinicia con lo
              // que queda pendiente.
              //
              // Sin esto, `useState` conserva el valor de la recepción
              // anterior y el usuario recibiría la misma cantidad dos veces
              // sin notarlo. Lo detectó el E2E: pidió recibir el resto y la
              // orden sumó 10 en vez de 490.
              <ReceiveForm
                key={`${o.id}-${o.lines.map((l) => l.receivedQty).join("-")}`}
                order={o}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Listas para entregar ({porEntregar.length})
        </h2>
        {porEntregar.length === 0 ? (
          <EmptyState message="No hay requisiciones esperando entrega." />
        ) : (
          <div className="flex flex-col gap-3">
            {porEntregar.map((r) => (
              <Card key={r.id}>
                <CardContent className="flex items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium">
                      {r.lines.length} línea{r.lines.length === 1 ? "" : "s"} ·{" "}
                      {formatDate(r.createdAt)}
                    </p>
                    <StatusBadge status={r.status} />
                  </div>
                  <DeliverButton id={r.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {lowStock.length > 0 && (
            <AlertTriangle className="size-4 text-status-danger" />
          )}
          Alertas de stock mínimo ({lowStock.length})
        </h2>
        {lowStock.length === 0 ? (
          <EmptyState message="Ningún artículo por debajo de su mínimo." />
        ) : (
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Artículo</TableHead>
                    <TableHead className="w-32">Disponible</TableHead>
                    <TableHead className="w-32">Mínimo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStock.map((s) => (
                    <TableRow key={`${s.warehouseId}-${s.itemId}`}>
                      <TableCell className="font-medium">
                        {s.sku} · {s.itemName}
                      </TableCell>
                      <TableCell className="font-semibold tabular-nums text-status-danger">
                        {s.quantity}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {s.minQuantity}
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
