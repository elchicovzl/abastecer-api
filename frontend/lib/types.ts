import type { RequisitionStatus } from "./format";
import type { Role } from "./permissions";
import type { LineType } from "./schemas";

/** Formas que devuelve la API. Espejo de lo que sirve el backend. */

export interface Item {
  id: string;
  sku: string;
  name: string;
  category: "MATERIALES" | "EQUIPOS" | "DOTACION" | "CONSUMIBLES";
  unit: string;
}

export interface Employee {
  id: string;
  documentId: string;
  name: string;
  position: string | null;
}

export interface RequisitionLine {
  id: string;
  itemId: string;
  quantity: number;
  justification: string;
  type: LineType;
  employeeId: string | null;
  item?: Pick<Item, "name" | "sku" | "category">;
}

export interface Requisition {
  id: string;
  contractId: string;
  requesterId: string;
  status: RequisitionStatus;
  createdAt: string;
  lines: RequisitionLine[];
}

export interface PurchaseOrderLine {
  id: string;
  itemId: string;
  orderedQty: number;
  receivedQty: number;
  unitPrice: string;
}

export interface PurchaseOrder {
  id: string;
  contractId: string;
  requisitionId: string;
  status:
    | "PENDIENTE"
    | "APROBADA"
    | "RECHAZADA"
    | "RECIBIDA_PARCIAL"
    | "RECIBIDA_TOTAL";
  rejectionReason: string | null;
  createdAt: string;
  lines: PurchaseOrderLine[];
}

export interface StockRow {
  warehouseId: string;
  itemId: string;
  quantity: number;
  minQuantity: number;
  itemName: string;
  sku: string;
}

export interface SpendRow {
  category: Item["category"];
  total: number;
}

export interface DeliveryRow {
  itemName: string;
  quantity: number;
  deliveredAt: string;
  contractId: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
  contractId: string | null;
}
