# API — ASOFER

Base: `http://localhost:3100/api`

Autenticación por `Authorization: Bearer <accessToken>` salvo donde se indica.
**Todo endpoint exige token por defecto**: los guards son globales y hay que
marcar explícitamente lo público. Un endpoint nuevo nace protegido.

---

## Reglas transversales

| Situación | Respuesta | Por qué |
|-----------|-----------|---------|
| Sin token o token vencido | `401` | — |
| Rol sin permiso para la ACCIÓN | `403` | El recurso existe, la acción no te corresponde |
| Recurso de **otro contrato** | `404` | Un `403` confirmaría que existe → filtración entre contratos (ADR-008) |
| Recurso inexistente | `404` | Indistinguible del anterior, a propósito |
| Body inválido | `400` + `issues[]` | Validación Zod |

**Segregación (ADR-002)**: un `COORDINATOR` solo lee y escribe sobre su
propio `contractId`. Se aplica en la capa de servicio, no en los controllers.

---

## Autenticación

### `POST /auth/login` · público
```json
{ "email": "coord1@asofer.com", "password": "changeme123" }
```
→ `200` `{ accessToken, refreshToken, user: { id, email, role, contractId } }`
→ `401` credenciales inválidas — **mismo error** si el usuario no existe o la
clave está mal: distinguirlos regala un enumerador de usuarios válidos.

### `POST /auth/refresh` · público
`{ "refreshToken": "..." }` → `200 { accessToken }`
→ `401` si fue revocado (logout), venció, o no existe.

### `POST /auth/logout`
`{ "refreshToken": "..." }` → `204`
Revocación **real**: marca `revokedAt` en la base (ADR-001). El token deja de
servir en el acto, no cuando expira.

### `GET /auth/me`
→ `200 { id, email, role, contractId }`

---

## Requisiciones

### `GET /requisitions`
Lista con scope de contrato aplicado.

### `GET /requisitions/:id`
→ `404` si es de otro contrato.

### `POST /requisitions` · solo `COORDINATOR`
```json
{
  "lines": [
    {
      "itemId": "uuid",
      "quantity": 10,
      "justification": "Vaciado de placa",
      "type": "MATERIAL_OBRA",
      "employeeId": "uuid  // OBLIGATORIO si type = DOTACION_PERSONAL"
    }
  ]
}
```
`type`: `MATERIAL_OBRA` · `HERRAMIENTA_EQUIPO` · `DOTACION_PERSONAL`
El empleado debe ser **del mismo contrato**; si no, `404` (ADR-005).

### `POST /requisitions/:id/submit` · solo `COORDINATOR`
`BORRADOR → PENDIENTE_INVENTARIO`

### `POST /requisitions/:id/verify-stock` · `WAREHOUSE` | `ADMIN`
El paso central del sistema. Por cada línea, dentro de una transacción con
`SELECT ... FOR UPDATE`:

```
disponible >= pedido ?
  sí  → descuenta y despacha
  no  → despacha lo que hay Y genera OC por el FALTANTE
```

→ `{ status, purchaseOrder: { id } | null }`
Si ninguna línea generó OC → `ENTREGADO`. Si alguna generó → `PENDIENTE_APROBACION_JEFE`.

---

## Órdenes de compra

### `GET /purchase-orders`

### `POST /purchase-orders/:id/approve` · solo `PURCHASING_MANAGER`
```json
{ "lines": [{ "lineId": "uuid", "unitPrice": 28500, "orderedQty": 8 }] }
```
`orderedQty` es opcional (permite ajustar la cantidad negociada).

### `POST /purchase-orders/:id/reject` · solo `PURCHASING_MANAGER`
`{ "reason": "Precio fuera de presupuesto" }`
El motivo es **obligatorio** (mínimo 5 caracteres): un rechazo sin
explicación es inauditable.

### `POST /purchase-orders/:id/receive` · `WAREHOUSE` | `ADMIN`
```json
{ "lines": [{ "lineId": "uuid", "receivedQty": 8 }] }
```
**ADR-003**: el stock sube por lo **efectivamente recibido**. Si la OC pedía
10 y llegan 8, se suman 8 y quedan 2 pendientes visibles. Recibir más de lo
pedido → `400`.
Estado resultante: `RECIBIDA_PARCIAL` o `RECIBIDA_TOTAL`.

---

## Reportes

| Endpoint | Devuelve |
|----------|----------|
| `GET /reports/spend?contractId&from&to` | Gasto por clasificación. Solo OC `APROBADA`/`RECIBIDA_*` — una pendiente todavía no es gasto |
| `GET /reports/requisitions?contractId&from&to` | Dashboard: qué pidió cada contrato y su estado |
| `GET /reports/deliveries/:employeeId` | Historial de dotación del empleado |
| `GET /reports/low-stock` | Artículos bajo su mínimo |

Un `COORDINATOR` que pase un `contractId` ajeno recibe `404`, **no una lista
vacía**: un array vacío parece "no hay datos" y esconde que no tenía permiso.

---

## Catálogos

| Endpoint | Alcance |
|----------|---------|
| `GET /admin/items` | Global (el catálogo es el mismo para toda ASOFER) |
| `GET /admin/employees` | **Filtrado por contrato** |
| `GET /admin/contracts` | Filtrado por contrato |
| `GET /admin/users` | Solo `ADMIN`. Nunca incluye `passwordHash` |

---

## Estados de requisición (ADR-004)

```
BORRADOR
   └→ PENDIENTE_INVENTARIO
         ├→ ENTREGADO                    (bodega cubrió TODO)
         └→ PENDIENTE_APROBACION_JEFE
               ├→ RECHAZADA
               └→ EN_COMPRA
                     └→ RECIBIDO_EN_BODEGA
                           └→ ENTREGADO
```

`ENTREGADO` y `RECHAZADA` son terminales.
**Desde `EN_COMPRA` NO se puede rechazar**: ya se le compró al proveedor;
rechazar dejaría material pago sin destino. Los problemas se resuelven en la
recepción.

---

## Auditoría

Un interceptor **global** registra toda mutación (`POST`/`PATCH`/`PUT`/`DELETE`)
en `audit_logs` con usuario, entidad, acción y payload (ADR-006). Contraseñas
y tokens se redactan antes de guardar. La escritura no bloquea la respuesta:
si falla la auditoría, la operación de negocio ya ocurrió.

---

## Credenciales del seed

Todas con contraseña `changeme123`:

| Usuario | Rol |
|---------|-----|
| `admin@asofer.com` | ADMIN |
| `coord1@asofer.com` … `coord12@asofer.com` | COORDINATOR (contratos distintos) |
| `bodega@asofer.com` | WAREHOUSE |
| `compras@asofer.com` | PURCHASING_MANAGER |

`coord1` y `coord2` están en **contratos distintos** a propósito: es lo que
necesitan los E2E de segregación.
