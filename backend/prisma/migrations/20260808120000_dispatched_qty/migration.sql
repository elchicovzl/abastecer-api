-- Cuánto salió de bodega en la verificación de stock.
--
-- Sin este dato la entrega final no sabe cuánto FALTA sacar y descuenta
-- todo lo comprado: se pedía 1 casco, compras compraba 5, y al entregar
-- desaparecían las 5 en vez de salir 1 y quedar 4 disponibles.
--
-- El default 0 es correcto para las filas existentes: en las requisiciones
-- ya entregadas el descuento (errado) ya ocurrió, y en las pendientes
-- todavía no se despachó nada.
ALTER TABLE "requisition_lines"
  ADD COLUMN "dispatchedQty" INTEGER NOT NULL DEFAULT 0;

-- Nunca se puede haber despachado más de lo pedido.
ALTER TABLE "requisition_lines"
  ADD CONSTRAINT "reqline_dispatched_within_quantity"
  CHECK ("dispatchedQty" >= 0 AND "dispatchedQty" <= "quantity");
