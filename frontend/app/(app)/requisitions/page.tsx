import { Plus } from "lucide-react";
import Link from "next/link";

import { EmptyState, PageHeader, StatusBadge } from "@/app/_components/ui";
import { Button } from "@/components/ui/button";
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
import { getSessionUser } from "@/lib/session";
import type { Requisition } from "@/lib/types";

export const metadata = { title: "Requisiciones — ASOFER" };

/**
 * Server Component: la data se pide en el servidor con el token de la cookie.
 * El scope por contrato ya lo aplicó el backend — acá no se filtra nada,
 * porque filtrar en el cliente sería filtrar después de haber transmitido.
 */
export default async function RequisitionsPage() {
  const [requisitions, user] = await Promise.all([
    api<Requisition[]>("/requisitions"),
    getSessionUser(),
  ]);

  return (
    <>
      <PageHeader
        title="Requisiciones"
        description="Solicitudes de material, herramienta y dotación"
        action={
          user?.role === "COORDINATOR" ? (
            <Button asChild>
              <Link href="/requisitions/new">
                <Plus />
                Nueva requisición
              </Link>
            </Button>
          ) : null
        }
      />

      {requisitions.length === 0 ? (
        <EmptyState message="Todavía no hay requisiciones para este contrato." />
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Fecha</TableHead>
                  <TableHead>Artículos</TableHead>
                  <TableHead className="w-52">Estado</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {requisitions.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.createdAt)}
                    </TableCell>
                    <TableCell>
                      {r.lines.length} línea{r.lines.length === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="link" size="sm">
                        <Link href={`/requisitions/${r.id}`}>Ver detalle</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
