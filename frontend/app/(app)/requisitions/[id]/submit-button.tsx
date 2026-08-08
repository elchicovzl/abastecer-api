"use client";

import { Send } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { submitRequisitionAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

/**
 * BORRADOR → PENDIENTE_INVENTARIO.
 *
 * Existía el endpoint pero NO el botón: la requisición quedaba en borrador
 * para siempre y el workflow no arrancaba. Lo detectó el E2E, no la
 * revisión manual — a ojo la pantalla se veía completa.
 */
export function SubmitRequisitionButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await submitRequisitionAction(id);
          if (result.error) {
            toast.error("No se pudo enviar", { description: result.error });
            return;
          }
          toast.success("Requisición enviada a inventario", {
            description: "Bodega ya la ve en su lista para verificar stock.",
          });
        })
      }
    >
      <Send />
      {pending ? "Enviando…" : "Enviar a inventario"}
    </Button>
  );
}
