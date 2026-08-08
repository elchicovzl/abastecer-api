import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combina clases resolviendo conflictos de Tailwind.
 *
 * Usala SOLO cuando hay condicionales o cuando merge-eás un `className`
 * que viene de afuera. Para clases estáticas va `className` directo:
 * envolver un string fijo en cn() es ruido sin beneficio.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
