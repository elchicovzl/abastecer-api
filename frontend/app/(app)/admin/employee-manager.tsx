"use client";

import { Plus, UserMinus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createEmployeeAction, setEmployeeActiveAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import type { Employee } from "@/lib/types";

interface Contract {
  id: string;
  code: string;
  name: string;
}

/**
 * Padrón de empleados.
 *
 * Sin esta pantalla el desplegable "Empleado receptor" salía vacío y NINGUNA
 * requisición de dotación se podía crear: el ADR-005 exige receptor en cada
 * línea. El módulo entero quedaba bloqueado.
 *
 * La baja es LÓGICA: un empleado que recibió EPP no se puede borrar sin
 * destruir su historial de entregas.
 */
export function EmployeeManager({
  employees,
  contracts,
  puedeElegirContrato,
}: {
  employees: Employee[];
  contracts: Contract[];
  puedeElegirContrato: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [documentId, setDocumentId] = useState("");
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [contractId, setContractId] = useState(contracts[0]?.id ?? "");

  const byCode = new Map(contracts.map((c) => [c.id, c.code]));

  const limpiar = () => {
    setDocumentId("");
    setName("");
    setPosition("");
    setAbierto(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Empleados ({employees.length})</h2>
        {!abierto && (
          <Button size="sm" onClick={() => setAbierto(true)}>
            <Plus />
            Nuevo empleado
          </Button>
        )}
      </div>

      {abierto && (
        <Card>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="grid gap-2">
                <Label htmlFor="emp-doc">Documento</Label>
                <Input
                  id="emp-doc"
                  value={documentId}
                  onChange={(e) => setDocumentId(e.target.value)}
                  placeholder="CC-1090234"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="emp-nombre">Nombre completo</Label>
                <Input
                  id="emp-nombre"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ana Pérez"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="emp-cargo">Cargo</Label>
                <Input
                  id="emp-cargo"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Oficial de obra"
                />
              </div>
              {/* El coordinador no elige contrato: solo puede el suyo, y
                  ofrecerle una lista sería mentirle. */}
              {puedeElegirContrato && (
                <div className="grid gap-2">
                  <Label htmlFor="emp-contrato">Contrato</Label>
                  <select
                    id="emp-contrato"
                    value={contractId}
                    onChange={(e) => setContractId(e.target.value)}
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                  >
                    {contracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} · {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                disabled={pending || !documentId || !name}
                onClick={() =>
                  startTransition(async () => {
                    const r = await createEmployeeAction({
                      documentId,
                      name,
                      position: position || undefined,
                      contractId: puedeElegirContrato
                        ? contractId
                        : (contracts[0]?.id ?? ""),
                    });
                    if (r.error) {
                      toast.error("No se pudo crear el empleado", {
                        description: r.error,
                      });
                      return;
                    }
                    toast.success(`${name} cargado`, {
                      description: "Ya aparece en el selector de dotación.",
                    });
                    limpiar();
                  })
                }
              >
                {pending ? "Guardando…" : "Crear empleado"}
              </Button>
              <Button variant="ghost" onClick={limpiar}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          {employees.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Todavía no hay empleados. Sin ellos no se pueden crear
              requisiciones de dotación.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Documento</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Cargo</TableHead>
                  {puedeElegirContrato && <TableHead>Contrato</TableHead>}
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.documentId}</TableCell>
                    <TableCell>{e.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.position ?? "—"}
                    </TableCell>
                    {puedeElegirContrato && (
                      <TableCell className="text-muted-foreground">
                        {byCode.get(e.contractId ?? "") ?? "—"}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const r = await setEmployeeActiveAction(e.id, false);
                            if (r.error) {
                              toast.error("No se pudo desactivar", {
                                description: r.error,
                              });
                              return;
                            }
                            toast.success(`${e.name} desactivado`, {
                              description:
                                "Su historial de dotación se conserva intacto.",
                            });
                          })
                        }
                      >
                        <UserMinus />
                        Desactivar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
