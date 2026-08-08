import { PageHeader } from "@/app/_components/ui";
import { api } from "@/lib/api-client";
import type { Employee, Item } from "@/lib/types";

import { RequisitionForm } from "./requisition-form";

export const metadata = { title: "Nueva requisición — ASOFER" };

/**
 * Los catálogos se cargan en el SERVIDOR y bajan como props. Así el
 * formulario no arranca vacío ni muestra spinners: la primera pintura ya
 * trae los datos.
 */
export default async function NewRequisitionPage() {
  const [items, employees] = await Promise.all([
    api<Item[]>("/admin/items").catch((e: unknown) => {
      console.error(
        "[requisitions/new] no se pudieron cargar los artículos:",
        e,
      );
      return [] as Item[];
    }),
    api<Employee[]>("/admin/employees").catch((e: unknown) => {
      console.error(
        "[requisitions/new] no se pudieron cargar los empleados:",
        e,
      );
      return [] as Employee[];
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Nueva requisición"
        description="Se asigna automáticamente a tu contrato"
      />
      <RequisitionForm items={items} employees={employees} />
    </>
  );
}
