"use client";

import { Check, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { approveOrderAction, rejectOrderAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/format";
import type { PurchaseOrder } from "@/lib/types";

/**
 * El jefe de compras aprueba ajustando precio y cantidad, o rechaza CON
 * motivo. El motivo es obligatorio: un rechazo sin explicación deja al
 * coordinador sin saber si rehacer la solicitud o buscar otro camino.
 */
export function OrderDecision({ order }: { order: PurchaseOrder }) {
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState(() =>
    order.lines.map((l) => ({
      lineId: l.id,
      unitPrice: Number(l.unitPrice),
      orderedQty: l.orderedQty,
    })),
  );

  const total = lines.reduce((acc, l) => acc + l.unitPrice * l.orderedQty, 0);

  const update = (lineId: string, patch: Partial<(typeof lines)[number]>) =>
    setLines(lines.map((l) => (l.lineId === lineId ? { ...l, ...patch } : l)));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">
          Orden {order.id.slice(0, 8)}
        </CardTitle>
        <span className="text-lg font-semibold tabular-nums">
          {formatCurrency(total)}
        </span>
      </CardHeader>

      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Cantidad</TableHead>
              <TableHead className="w-36">Precio unitario</TableHead>
              <TableHead>Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l) => (
              <TableRow key={l.lineId}>
                <TableCell>
                  <Input
                    type="number"
                    aria-label="Cantidad de la orden"
                    min={1}
                    value={l.orderedQty}
                    onChange={(e) =>
                      update(l.lineId, { orderedQty: Number(e.target.value) })
                    }
                    className="w-24"
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    aria-label="Precio unitario"
                    min={0}
                    step="0.01"
                    value={l.unitPrice}
                    onChange={(e) =>
                      update(l.lineId, { unitPrice: Number(e.target.value) })
                    }
                    className="w-32"
                  />
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {formatCurrency(l.unitPrice * l.orderedQty)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {rejecting ? (
          <div className="space-y-2">
            <Label htmlFor={`reason-${order.id}`}>Motivo del rechazo</Label>
            <Textarea
              id={`reason-${order.id}`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="Por qué se rechaza esta compra"
            />
            <div className="flex gap-2">
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await rejectOrderAction(order.id, reason);
                    if (result.error) {
                      toast.error("No se pudo rechazar", {
                        description: result.error,
                      });
                      return;
                    }
                    toast.success("Orden rechazada", {
                      description:
                        "El motivo quedó registrado en la auditoría.",
                    });
                    setRejecting(false);
                  })
                }
              >
                Confirmar rechazo
              </Button>
              <Button variant="outline" onClick={() => setRejecting(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await approveOrderAction(order.id, lines);
                  if (result.error) {
                    toast.error("No se pudo aprobar", {
                      description: result.error,
                    });
                    return;
                  }
                  toast.success(`Orden aprobada por ${formatCurrency(total)}`, {
                    description: "Bodega ya puede registrar la recepción.",
                  });
                })
              }
            >
              <Check />
              {pending ? "Procesando…" : "Aprobar"}
            </Button>
            <Button variant="outline" onClick={() => setRejecting(true)}>
              <X />
              Rechazar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
