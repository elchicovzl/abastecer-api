"use client";

import { HandHeart, PackageCheck, ScanSearch } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  deliverRequisitionAction,
  receiveOrderAction,
  verifyStockAction,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PurchaseOrder } from "@/lib/types";

export function VerifyStockButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await verifyStockAction(id);
          if (result.error) {
            toast.error("No se pudo verificar el stock", {
              description: result.error,
            });
            return;
          }
          // El mensaje explica QUÉ pasó, no solo que "salió bien":
          // la división de líneas es la parte que la gente no espera.
          toast.success("Stock verificado", {
            description:
              "Se despachó lo disponible. Si faltó algo, se generó una orden de compra por la diferencia.",
          });
        })
      }
    >
      <ScanSearch />
      {pending ? "Verificando…" : "Verificar stock"}
    </Button>
  );
}

/**
 * Entrega final: cierra la requisición y registra el DeliveryLog.
 * Es un acto MANUAL a propósito — de ahí sale la trazabilidad del ADR-005.
 */
export function DeliverButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await deliverRequisitionAction(id);
          if (result.error) {
            toast.error("No se pudo registrar la entrega", {
              description: result.error,
            });
            return;
          }
          toast.success("Entrega registrada", {
            description:
              "La requisición quedó ENTREGADA y la dotación trazada contra su empleado receptor.",
          });
        })
      }
    >
      <HandHeart />
      {pending ? "Registrando…" : "Registrar entrega"}
    </Button>
  );
}

export function ReceiveForm({ order }: { order: PurchaseOrder }) {
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      order.lines.map((l) => [l.id, l.orderedQty - l.receivedQty]),
    ),
  );

  const totalARecibir = Object.values(values).reduce((a, b) => a + b, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Orden {order.id.slice(0, 8)}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {order.status}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Ya recibido</TableHead>
              <TableHead>Pendiente</TableHead>
              <TableHead className="w-32">Recibir ahora</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.lines.map((line) => {
              const pendiente = line.orderedQty - line.receivedQty;
              return (
                <TableRow key={line.id}>
                  <TableCell>{line.orderedQty}</TableCell>
                  <TableCell>{line.receivedQty}</TableCell>
                  <TableCell className="font-medium text-status-pending">
                    {pendiente}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      aria-label="Recibir ahora"
                      min={0}
                      max={pendiente}
                      value={values[line.id] ?? 0}
                      onChange={(e) =>
                        setValues({
                          ...values,
                          [line.id]: Number(e.target.value),
                        })
                      }
                      className="w-24"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await receiveOrderAction(
                order.id,
                order.lines.map((l) => ({
                  lineId: l.id,
                  receivedQty: values[l.id] ?? 0,
                })),
              );
              if (result.error) {
                toast.error("No se pudo registrar la recepción", {
                  description: result.error,
                });
                return;
              }
              toast.success(`Recepción registrada: ${totalARecibir} unidades`, {
                description:
                  "El stock subió por lo efectivamente recibido. Lo que falte queda pendiente en la orden.",
              });
            })
          }
        >
          <PackageCheck />
          {pending ? "Registrando…" : "Registrar recepción"}
        </Button>
      </CardContent>
    </Card>
  );
}
