"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useActionState, useEffect, useTransition } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";

import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createRequisitionAction, type ActionState } from "@/app/actions";
import { ErrorMessage } from "@/app/_components/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createRequisitionSchema,
  LINE_TYPES,
  type CreateRequisitionFormValues,
  type CreateRequisitionInput,
} from "@/lib/schemas";
import type { Employee, Item } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Formulario dinámico de líneas.
 *
 * La regla del ADR-005 (dotación exige empleado) está en el schema de Zod,
 * así que se valida en el navegador Y en el servidor con la MISMA
 * definición. El usuario ve el error al instante; el backend igual lo
 * revalida, porque el cliente nunca es de fiar.
 */
export function RequisitionForm({
  items,
  employees,
}: {
  items: Item[];
  employees: Employee[];
}) {
  const [state, action, isActionPending] = useActionState<
    ActionState | null,
    FormData
  >(createRequisitionAction, null);
  // `action()` de useActionState DEBE invocarse dentro de una transición.
  // Fuera de ella, `isPending` no se actualiza y el botón nunca muestra
  // "Guardando…". React lo avisa por consola; el E2E lo hizo visible.
  const [isTransitionPending, startTransition] = useTransition();
  const isPending = isActionPending || isTransitionPending;

  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateRequisitionFormValues, unknown, CreateRequisitionInput>({
    resolver: zodResolver(createRequisitionSchema),
    defaultValues: {
      lines: [
        { itemId: "", quantity: 1, justification: "", type: "MATERIAL_OBRA" },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  // `useWatch` y no `watch()`: el React Compiler no puede memoizar `watch`
  // de forma segura y saltea la optimización de TODO el componente.
  const lines = useWatch({ control, name: "lines" });

  useEffect(() => {
    if (state?.error)
      toast.error("No se pudo crear la requisición", {
        description: state.error,
      });
  }, [state]);

  const onSubmit = handleSubmit((data) => {
    const payload = new FormData();
    payload.set("payload", JSON.stringify(data));
    startTransition(() => action(payload));
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {fields.map((field, index) => {
        const esDotacion = lines?.[index]?.type === "DOTACION_PERSONAL";

        return (
          <Card key={field.id}>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="grid gap-2 md:col-span-4">
                <Label htmlFor={`item-${index}`}>Artículo</Label>
                <select
                  id={`item-${index}`}
                  {...register(`lines.${index}.itemId`)}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                >
                  <option value="">Seleccionar…</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku} · {item.name}
                    </option>
                  ))}
                </select>
                {errors.lines?.[index]?.itemId && (
                  <ErrorMessage>
                    {errors.lines[index]?.itemId?.message}
                  </ErrorMessage>
                )}
              </div>

              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor={`quantity-${index}`}>Cantidad</Label>
                <Input
                  type="number"
                  id={`quantity-${index}`}
                  min={1}
                  {...register(`lines.${index}.quantity`)}
                />
                {errors.lines?.[index]?.quantity && (
                  <ErrorMessage>
                    {errors.lines[index]?.quantity?.message}
                  </ErrorMessage>
                )}
              </div>

              <div className="grid gap-2 md:col-span-3">
                <Label htmlFor={`type-${index}`}>Tipo</Label>
                <select
                  id={`type-${index}`}
                  {...register(`lines.${index}.type`)}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                >
                  {Object.entries(LINE_TYPES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Solo aparece si es dotación: ADR-005 hecho visible. */}
              <div
                className={cn(
                  "grid gap-2 md:col-span-3",
                  !esDotacion && "hidden",
                )}
              >
                <Label htmlFor={`employee-${index}`}>Empleado receptor</Label>
                <select
                  id={`employee-${index}`}
                  {...register(`lines.${index}.employeeId`)}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
                >
                  <option value="">Seleccionar…</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.documentId} · {e.name}
                    </option>
                  ))}
                </select>
                {errors.lines?.[index]?.employeeId && (
                  <ErrorMessage>
                    {errors.lines[index]?.employeeId?.message}
                  </ErrorMessage>
                )}
              </div>

              <div className="grid gap-2 md:col-span-10">
                <Label htmlFor={`justification-${index}`}>Justificación</Label>
                <Input
                  id={`justification-${index}`}
                  {...register(`lines.${index}.justification`)}
                  placeholder="¿Para qué se necesita?"
                />
                {errors.lines?.[index]?.justification && (
                  <ErrorMessage>
                    {errors.lines[index]?.justification?.message}
                  </ErrorMessage>
                )}
              </div>

              <div className="flex items-end md:col-span-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 />
                  Quitar
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {state?.error && <ErrorMessage>{state.error}</ErrorMessage>}

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            append({
              itemId: "",
              quantity: 1,
              justification: "",
              type: "MATERIAL_OBRA",
            })
          }
        >
          <Plus />
          Agregar artículo
        </Button>
        <Button type="submit" disabled={isPending}>
          <Save />
          {isPending ? "Guardando…" : "Crear requisición"}
        </Button>
      </div>
    </form>
  );
}
