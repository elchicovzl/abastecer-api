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
import type { Employee, Item } from "@/lib/types";
import type { Role } from "@/lib/permissions";

export const metadata = { title: "Administración — ASOFER" };

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  contractId: string | null;
}

interface Contract {
  id: string;
  code: string;
  name: string;
}

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrador",
  COORDINATOR: "Coordinador",
  WAREHOUSE: "Bodega",
  PURCHASING_MANAGER: "Jefe de compras",
};

export default async function AdminPage() {
  const [users, employees, items, contracts] = await Promise.all([
    api<AdminUser[]>("/admin/users"),
    api<Employee[]>("/admin/employees"),
    api<Item[]>("/admin/items"),
    api<Contract[]>("/admin/contracts"),
  ]);

  const byCode = new Map(contracts.map((c) => [c.id, c.code]));

  return (
    <>
      <PageHeader
        title="Administración"
        description={`${contracts.length} contratos · ${users.length} usuarios · ${employees.length} empleados · ${items.length} artículos`}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Usuarios</h2>
        {users.length === 0 ? (
          <EmptyState message="No hay usuarios registrados." />
        ) : (
          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Correo</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Contrato</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.email}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {ROLE_LABELS[u.role]}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {u.contractId
                          ? (byCode.get(u.contractId) ?? "—")
                          : "Todos"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.active ? "default" : "secondary"}>
                          {u.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Empleados ({employees.length})
        </h2>
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Documento</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Cargo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      {e.documentId}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {e.position ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Artículos ({items.length})</h2>
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Unidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.sku}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {i.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {i.category}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {i.unit}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
