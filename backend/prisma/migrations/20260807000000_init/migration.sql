-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'COORDINATOR', 'WAREHOUSE', 'PURCHASING_MANAGER');

-- CreateEnum
CREATE TYPE "RequisitionStatus" AS ENUM ('BORRADOR', 'PENDIENTE_INVENTARIO', 'PENDIENTE_APROBACION_JEFE', 'EN_COMPRA', 'RECIBIDO_EN_BODEGA', 'ENTREGADO', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "LineType" AS ENUM ('MATERIAL_OBRA', 'HERRAMIENTA_EQUIPO', 'DOTACION_PERSONAL');

-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('MATERIALES', 'EQUIPOS', 'DOTACION', 'CONSUMIBLES');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'RECIBIDA_PARCIAL', 'RECIBIDA_TOTAL');

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "contractId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "contractId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ItemCategory" NOT NULL,
    "unit" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisitions" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "status" "RequisitionStatus" NOT NULL DEFAULT 'BORRADOR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisition_lines" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "justification" TEXT NOT NULL,
    "type" "LineType" NOT NULL,
    "employeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requisition_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'PENDIENTE',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "orderedQty" INTEGER NOT NULL,
    "receivedQty" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_logs" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "employeeId" TEXT,
    "quantity" INTEGER NOT NULL,
    "deliveredById" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contracts_code_key" ON "contracts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_contractId_key" ON "warehouses"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_contractId_idx" ON "users"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "employees_contractId_idx" ON "employees"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_contractId_documentId_key" ON "employees"("contractId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "items_sku_key" ON "items"("sku");

-- CreateIndex
CREATE INDEX "items_category_idx" ON "items"("category");

-- CreateIndex
CREATE INDEX "stock_warehouseId_idx" ON "stock"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_warehouseId_itemId_key" ON "stock"("warehouseId", "itemId");

-- CreateIndex
CREATE INDEX "requisitions_contractId_status_idx" ON "requisitions"("contractId", "status");

-- CreateIndex
CREATE INDEX "requisitions_requesterId_idx" ON "requisitions"("requesterId");

-- CreateIndex
CREATE INDEX "requisition_lines_requisitionId_idx" ON "requisition_lines"("requisitionId");

-- CreateIndex
CREATE INDEX "requisition_lines_employeeId_idx" ON "requisition_lines"("employeeId");

-- CreateIndex
CREATE INDEX "purchase_orders_contractId_status_idx" ON "purchase_orders"("contractId", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_requisitionId_idx" ON "purchase_orders"("requisitionId");

-- CreateIndex
CREATE INDEX "purchase_order_lines_purchaseOrderId_idx" ON "purchase_order_lines"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "delivery_logs_employeeId_idx" ON "delivery_logs"("employeeId");

-- CreateIndex
CREATE INDEX "delivery_logs_contractId_deliveredAt_idx" ON "delivery_logs"("contractId", "deliveredAt");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_at_idx" ON "audit_logs"("userId", "at");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock" ADD CONSTRAINT "stock_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "requisitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "requisitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_logs" ADD CONSTRAINT "delivery_logs_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_logs" ADD CONSTRAINT "delivery_logs_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_logs" ADD CONSTRAINT "delivery_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_logs" ADD CONSTRAINT "delivery_logs_deliveredById_fkey" FOREIGN KEY ("deliveredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- CHECK constraints
--
-- Prisma NO expresa CHECK en el schema, así que van acá a mano. No son
-- decoración: son las reglas de negocio que ninguna capa de aplicación puede
-- saltear. Un script de carga, una migración mal hecha o un bug en un service
-- se saltean la validación de la app. Esto no.
-- ---------------------------------------------------------------------------

-- ADR-007: última defensa contra stock negativo si el lock pesimista fallara.
ALTER TABLE "stock"
  ADD CONSTRAINT "stock_quantity_non_negative" CHECK ("quantity" >= 0);

-- ADR-005: dotación SIEMPRE identifica a su receptor. Sin esto, el módulo de
-- trazabilidad no puede responder "¿a quién le entregamos las botas?".
ALTER TABLE "requisition_lines"
  ADD CONSTRAINT "reqline_dotacion_requires_employee"
  CHECK ("type" <> 'DOTACION_PERSONAL' OR "employeeId" IS NOT NULL);

ALTER TABLE "requisition_lines"
  ADD CONSTRAINT "reqline_quantity_positive" CHECK ("quantity" > 0);

-- Un rechazo sin motivo es inauditable.
ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "po_rejection_requires_reason"
  CHECK ("status" <> 'RECHAZADA' OR "rejectionReason" IS NOT NULL);

ALTER TABLE "purchase_order_lines"
  ADD CONSTRAINT "poline_ordered_positive" CHECK ("orderedQty" > 0);

-- ADR-003: no se puede recibir más de lo pedido ni cantidades negativas.
ALTER TABLE "purchase_order_lines"
  ADD CONSTRAINT "poline_received_within_ordered"
  CHECK ("receivedQty" >= 0 AND "receivedQty" <= "orderedQty");

ALTER TABLE "delivery_logs"
  ADD CONSTRAINT "delivery_quantity_positive" CHECK ("quantity" > 0);
