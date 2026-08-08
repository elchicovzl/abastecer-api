import { notFound } from "next/navigation";

import { PageHeader, StatusBadge } from "@/app/_components/ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, ApiError } from "@/lib/api-client";
import {
  formatDate,
  STATUS_LABELS,
  type RequisitionStatus,
} from "@/lib/format";
import { LINE_TYPES } from "@/lib/schemas";
import { getSessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import type { Requisition } from "@/lib/types";

import { SubmitRequisitionButton } from "./submit-button";

export const metadata = { title: "Detalle de requisición — ASOFER" };

/** Orden del workflow (ADR-004). RECHAZADA se muestra aparte: es salida lateral. */
const TIMELINE: RequisitionStatus[] = [
  "BORRADOR",
  "PENDIENTE_INVENTARIO",
  "PENDIENTE_APROBACION_JEFE",
  "EN_COMPRA",
  "RECIBIDO_EN_BODEGA",
  "ENTREGADO",
];

export default async function RequisitionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let requisition: Requisition;
  try {
    requisition = await api<Requisition>(`/requisitions/${id}`);
  } catch (error) {
    // El backend devuelve 404 tanto si no existe como si es de otro contrato
    // (ADR-008). La UI respeta esa indistinción: no revela cuál de las dos.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  const user = await getSessionUser();
  const puedeEnviar =
    requisition.status === "BORRADOR" && user?.role === "COORDINATOR";
  const current = TIMELINE.indexOf(requisition.status);
  const rechazada = requisition.status === "RECHAZADA";

  return (
    <>
      <PageHeader
        title="Requisición"
        description={`Creada el ${formatDate(requisition.createdAt)}`}
        action={
          <div className="flex items-center gap-3">
            <StatusBadge status={requisition.status} />
            {puedeEnviar && <SubmitRequisitionButton id={requisition.id} />}
          </div>
        }
      />

      {rechazada ? (
        <Alert variant="destructive">
          <AlertTitle>Requisición rechazada</AlertTitle>
          <AlertDescription>
            El jefe de compras rechazó esta solicitud. El motivo queda
            registrado en la auditoría.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estado del trámite</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-wrap items-center gap-1.5">
              {TIMELINE.map((step, i) => (
                <li key={step} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium",
                      i < current && "bg-status-success/15 text-status-success",
                      i === current && "bg-primary text-primary-foreground",
                      i > current && "bg-muted text-muted-foreground",
                    )}
                  >
                    {STATUS_LABELS[step]}
                  </span>
                  {i < TIMELINE.length - 1 && (
                    <span className="text-muted-foreground">›</span>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Artículos solicitados ({requisition.lines.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artículo</TableHead>
                <TableHead className="w-24">Cantidad</TableHead>
                <TableHead className="w-48">Tipo</TableHead>
                <TableHead>Justificación</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requisition.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="font-medium">
                    {line.item
                      ? `${line.item.sku} · ${line.item.name}`
                      : line.itemId}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {line.quantity}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {LINE_TYPES[line.type]}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {line.justification}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
