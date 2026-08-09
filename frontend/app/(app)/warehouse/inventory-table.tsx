"use client";

import { AlertTriangle, Check, Pencil } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { adjustStockAction, setMinimumAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
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
import type { StockRow } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Inventario de bodega, editable.
 *
 * Antes esta pantalla mostraba requisiciones y órdenes pero NO el stock:
 * una bodega sin bodega. Y el stock solo podía entrar por una orden de
 * compra, así que ASOFER no tenía forma de cargar el inventario que ya
 * tiene físicamente.
 */
export function InventoryTable({ rows }: { rows: StockRow[] }) {
  const [editando, setEditando] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        La bodega todavía no tiene artículos cargados. Usá “Ajustar” sobre
        cualquier artículo del catálogo para registrar el conteo inicial.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Artículo</TableHead>
          <TableHead className="w-28">Disponible</TableHead>
          <TableHead className="w-28">Mínimo</TableHead>
          <TableHead className="w-64">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const clave = `${row.warehouseId}-${row.itemId}`;
          const bajoMinimo = row.minQuantity > 0 && row.quantity < row.minQuantity;

          return (
            <TableRow key={clave}>
              <TableCell className="font-medium">
                {row.sku} · {row.itemName}
              </TableCell>
              <TableCell
                className={cn(
                  "tabular-nums",
                  bajoMinimo && "font-semibold text-status-danger",
                )}
              >
                <span className="inline-flex items-center gap-1.5">
                  {bajoMinimo && <AlertTriangle className="size-3.5" />}
                  {row.quantity}
                </span>
              </TableCell>
              <TableCell className="tabular-nums text-muted-foreground">
                {row.minQuantity === 0 ? "—" : row.minQuantity}
              </TableCell>
              <TableCell>
                {editando === clave ? (
                  <EditorFila row={row} onCerrar={() => setEditando(null)} />
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditando(clave)}
                  >
                    <Pencil />
                    Ajustar
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function EditorFila({ row, onCerrar }: { row: StockRow; onCerrar: () => void }) {
  const [pending, startTransition] = useTransition();
  const [cantidad, setCantidad] = useState(row.quantity);
  const [minimo, setMinimo] = useState(row.minQuantity);
  const [motivo, setMotivo] = useState("");

  const cambioCantidad = cantidad !== row.quantity;
  const cambioMinimo = minimo !== row.minQuantity;

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`cant-${row.itemId}`} className="text-xs">
            Cantidad real
          </Label>
          <Input
            id={`cant-${row.itemId}`}
            type="number"
            min={0}
            value={cantidad}
            onChange={(e) => setCantidad(Number(e.target.value))}
            className="w-24"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`min-${row.itemId}`} className="text-xs">
            Mínimo
          </Label>
          <Input
            id={`min-${row.itemId}`}
            type="number"
            min={0}
            value={minimo}
            onChange={(e) => setMinimo(Number(e.target.value))}
            className="w-24"
          />
        </div>
      </div>

      {/* El motivo solo se pide si cambia la CANTIDAD: mover un mínimo no
          altera el inventario, cambiar el conteo sí. */}
      {cambioCantidad && (
        <div className="grid gap-1">
          <Label htmlFor={`motivo-${row.itemId}`} className="text-xs">
            Motivo del ajuste (obligatorio)
          </Label>
          <Input
            id={`motivo-${row.itemId}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Conteo físico, rotura, corrección…"
            className="w-72"
          />
        </div>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || (!cambioCantidad && !cambioMinimo)}
          onClick={() =>
            startTransition(async () => {
              if (cambioMinimo) {
                const r = await setMinimumAction(row.warehouseId, row.itemId, minimo);
                if (r.error) {
                  toast.error("No se pudo guardar el mínimo", { description: r.error });
                  return;
                }
              }
              if (cambioCantidad) {
                const r = await adjustStockAction(
                  row.warehouseId,
                  row.itemId,
                  cantidad,
                  motivo,
                );
                if (r.error) {
                  toast.error("No se pudo ajustar el stock", { description: r.error });
                  return;
                }
              }
              toast.success(`${row.sku} actualizado`, {
                description: cambioCantidad
                  ? `Stock: ${row.quantity} → ${cantidad}. El motivo quedó auditado.`
                  : `Mínimo: ${minimo}. Vas a ver alerta cuando baje de ahí.`,
              });
              onCerrar();
            })
          }
        >
          <Check />
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
