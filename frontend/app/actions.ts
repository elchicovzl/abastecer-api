"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { api, ApiError } from "@/lib/api-client";
import { homeRouteFor } from "@/lib/permissions";
import { createRequisitionSchema, loginSchema } from "@/lib/schemas";
import { clearSession, getRefreshToken, saveSession, type SessionUser } from "@/lib/session";
import type { PurchaseOrder, Requisition } from "@/lib/types";

/**
 * Server Actions: todas las mutaciones pasan por acá.
 *
 * Ventaja concreta: el token vive en una cookie httpOnly del servidor y
 * nunca toca el bundle del navegador. El cliente manda un FormData y listo.
 */

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function loginAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      fieldErrors: Object.fromEntries(
        parsed.error.issues.map((i) => [i.path.join("."), i.message]),
      ),
    };
  }

  let user: SessionUser;
  try {
    const res = await api<{
      accessToken: string;
      refreshToken: string;
      user: SessionUser;
    }>("/auth/login", { method: "POST", body: parsed.data });

    await saveSession(res.accessToken, res.refreshToken, res.user);
    user = res.user;
  } catch (error) {
    // Mensaje genérico: distinguir "no existe" de "clave mala" le regala al
    // atacante un enumerador de usuarios válidos.
    if (error instanceof ApiError && error.status === 401) {
      return { error: "Correo o contraseña incorrectos" };
    }
    return { error: "No se pudo conectar con el servidor" };
  }

  redirect(homeRouteFor(user.role));
}

export async function logoutAction(): Promise<void> {
  const refreshToken = await getRefreshToken();
  if (refreshToken) {
    // Revocación REAL en el backend (ADR-001), no solo borrar la cookie.
    await api("/auth/logout", { method: "POST", body: { refreshToken } }).catch(() => {});
  }
  await clearSession();
  redirect("/login");
}

export async function createRequisitionAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const raw = formData.get("payload");
  const parsed = createRequisitionSchema.safeParse(
    JSON.parse(typeof raw === "string" ? raw : "{}"),
  );

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Revisá los datos del formulario",
    };
  }

  let created: Requisition;
  try {
    created = await api<Requisition>("/requisitions", {
      method: "POST",
      body: parsed.data,
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Error inesperado" };
  }

  revalidatePath("/requisitions");
  redirect(`/requisitions/${created.id}`);
}

/**
 * Toda transición de estado revalida el LISTADO además del detalle.
 *
 * Si solo se revalida el detalle, la lista sigue mostrando el estado viejo
 * hasta que expire el cache del router. El usuario ve "En compra" en una
 * requisición que ya entregó, y desconfía del sistema entero.
 */
function revalidateRequisition(id: string): void {
  revalidatePath("/requisitions");
  revalidatePath(`/requisitions/${id}`);
  revalidatePath("/warehouse");
  revalidatePath("/dashboard");
}

export async function submitRequisitionAction(id: string): Promise<ActionState> {
  try {
    await api(`/requisitions/${id}/submit`, { method: "POST" });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Error inesperado" };
  }
  revalidateRequisition(id);
  return {};
}

export async function verifyStockAction(id: string): Promise<ActionState> {
  try {
    await api(`/requisitions/${id}/verify-stock`, { method: "POST" });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Error inesperado" };
  }
  revalidateRequisition(id);
  return {};
}

export async function deliverRequisitionAction(id: string): Promise<ActionState> {
  try {
    await api(`/requisitions/${id}/deliver`, { method: "POST" });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Error inesperado" };
  }
  revalidateRequisition(id);
  return {};
}

export async function adjustStockAction(
  warehouseId: string,
  itemId: string,
  quantity: number,
  reason: string,
): Promise<ActionState> {
  try {
    await api(`/inventory/${warehouseId}/adjust`, {
      method: "POST",
      body: { itemId, quantity, reason },
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Error inesperado" };
  }
  revalidatePath("/warehouse");
  return {};
}

export async function setMinimumAction(
  warehouseId: string,
  itemId: string,
  minQuantity: number,
): Promise<ActionState> {
  try {
    await api(`/inventory/${warehouseId}/minimum`, {
      method: "POST",
      body: { itemId, minQuantity },
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Error inesperado" };
  }
  revalidatePath("/warehouse");
  return {};
}

export async function approveOrderAction(
  id: string,
  lines: { lineId: string; unitPrice: number; orderedQty?: number }[],
): Promise<ActionState> {
  try {
    await api<PurchaseOrder>(`/purchase-orders/${id}/approve`, {
      method: "POST",
      body: { lines },
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Error inesperado" };
  }
  revalidatePath("/purchase-orders");
  revalidatePath("/requisitions");
  return {};
}

export async function rejectOrderAction(id: string, reason: string): Promise<ActionState> {
  if (reason.trim().length < 5) {
    return { error: "Indicá por qué se rechaza (mínimo 5 caracteres)" };
  }
  try {
    await api(`/purchase-orders/${id}/reject`, { method: "POST", body: { reason } });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Error inesperado" };
  }
  revalidatePath("/purchase-orders");
  return {};
}

export async function receiveOrderAction(
  id: string,
  lines: { lineId: string; receivedQty: number }[],
): Promise<ActionState> {
  try {
    await api(`/purchase-orders/${id}/receive`, { method: "POST", body: { lines } });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Error inesperado" };
  }
  revalidatePath("/warehouse");
  revalidatePath("/purchase-orders");
  revalidatePath("/requisitions");
  revalidatePath("/dashboard");
  return {};
}
