import { PrismaPg } from "@prisma/adapter-pg";
import * as bcrypt from "bcrypt";

import { loadEnvFileIfPresent } from "../src/config/load-env";
import {
  type ItemCategory,
  PrismaClient,
  type Role,
} from "../src/prisma/generated/client/client";

/**
 * Seed de ASOFER: 9 contratos, 9 bodegas, 15 usuarios, 45 empleados,
 * 50 ítems y stock inicial.
 *
 * Es IDEMPOTENTE (upsert por clave natural) a propósito. Un seed que
 * revienta la segunda vez que lo corrés obliga a resetear la base para
 * cualquier ajuste, y eso hace que la gente deje de correrlo.
 */

const CONTRACTS = [
  { code: "C-001", name: "Reforzamiento Estructural Torre Norte" },
  { code: "C-002", name: "Rehabilitación Puente Vehicular Sur" },
  { code: "C-003", name: "Ampliación Planta Industrial Este" },
  { code: "C-004", name: "Reforzamiento Sísmico Hospital Central" },
  { code: "C-005", name: "Mejoras Estructurales Colegio Occidente" },
  { code: "C-006", name: "Refuerzo Cimentación Bodega Logística" },
  { code: "C-007", name: "Remodelación Estructural Centro Comercial" },
  { code: "C-008", name: "Estabilización Talud Vía Interna" },
  { code: "C-009", name: "Reforzamiento Silos Planta Cemento" },
] as const;

const ITEM_TEMPLATES: { prefix: string; category: ItemCategory; unit: string; names: string[] }[] = [
  {
    prefix: "MAT",
    category: "MATERIALES",
    unit: "unidad",
    names: [
      "Cemento gris 50kg", "Arena de río m3", "Grava triturada m3",
      "Varilla corrugada 1/2", "Varilla corrugada 3/8", "Alambre de amarre kg",
      "Ladrillo estructural", "Bloque de concreto", "Mortero de pega 25kg",
      "Aditivo impermeabilizante", "Malla electrosoldada", "Perfil metálico IPE",
      "Lámina galvanizada", "Soldadura E6011 kg", "Anclaje químico",
    ],
  },
  {
    prefix: "EQU",
    category: "EQUIPOS",
    unit: "unidad",
    names: [
      "Andamio tubular módulo", "Mezcladora de concreto", "Vibrador de concreto",
      "Compactadora tipo rana", "Taladro percutor", "Pulidora angular",
      "Equipo de soldadura", "Generador eléctrico 5kW", "Bomba sumergible",
      "Nivel láser autonivelante", "Cortadora de concreto", "Martillo demoledor",
    ],
  },
  {
    prefix: "DOT",
    category: "DOTACION",
    unit: "unidad",
    names: [
      "Casco de seguridad", "Botas punta de acero", "Guantes de carnaza",
      "Gafas de seguridad", "Arnés de cuerpo completo", "Chaleco reflectivo",
      "Overol de trabajo", "Protector auditivo", "Respirador media cara",
      "Careta para soldar", "Eslinga de posicionamiento", "Impermeable de obra",
    ],
  },
  {
    prefix: "CON",
    category: "CONSUMIBLES",
    unit: "unidad",
    names: [
      "Disco de corte 7", "Broca para concreto", "Clavo de acero kg",
      "Cinta de señalización", "Lija para metal", "Silicona estructural",
      "Puntilla 2 kg", "Estopa industrial kg", "Grasa multipropósito",
      "Tornillo autoperforante ciento", "Electrodo E7018 kg",
    ],
  },
];

const EMPLOYEE_POSITIONS = [
  "Oficial de obra",
  "Ayudante de obra",
  "Soldador",
  "Maestro de obra",
  "Operario de equipos",
];

type SeedClient = Pick<PrismaClient, "contract" | "warehouse" | "user" | "employee" | "item" | "stock">;

export async function seed(prisma: SeedClient): Promise<void> {
  const passwordHash = await bcrypt.hash("changeme123", 12);

  // 1. Contratos + bodega (una por contrato, ADR-002)
  const contracts = [];
  for (const c of CONTRACTS) {
    const contract = await prisma.contract.upsert({
      where: { code: c.code },
      update: { name: c.name },
      create: { code: c.code, name: c.name },
    });
    await prisma.warehouse.upsert({
      where: { contractId: contract.id },
      update: {},
      create: { name: `Bodega ${c.code}`, contractId: contract.id },
    });
    contracts.push(contract);
  }

  // 2. Usuarios — 12 coordinadores (uno por contrato, con 3 contratos que
  //    tienen dos) + admin + bodega + compras = 15
  const staff: { email: string; name: string; role: Role }[] = [
    { email: "admin@asofer.com", name: "Administrador ASOFER", role: "ADMIN" },
    { email: "bodega@asofer.com", name: "Encargado de Bodega", role: "WAREHOUSE" },
    { email: "compras@asofer.com", name: "Jefe de Compras", role: "PURCHASING_MANAGER" },
  ];
  for (const u of staff) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, contractId: null },
      create: { ...u, passwordHash, contractId: null },
    });
  }

  for (let i = 0; i < 12; i++) {
    // Los primeros 9 van uno por contrato; los 3 restantes refuerzan
    // los contratos 1..3. coord1 y coord2 quedan en contratos DISTINTOS,
    // que es lo que necesitan los E2E de segregación (tarea 8.3).
    const contract = contracts[i % contracts.length];
    if (!contract) throw new Error("faltan contratos para asignar coordinadores");
    const email = `coord${i + 1}@asofer.com`;
    await prisma.user.upsert({
      where: { email },
      update: { contractId: contract.id },
      create: {
        email,
        name: `Coordinador ${i + 1}`,
        role: "COORDINATOR",
        passwordHash,
        contractId: contract.id,
      },
    });
  }

  // 3. Empleados — 5 por contrato = 45
  for (const [ci, contract] of contracts.entries()) {
    for (let e = 0; e < 5; e++) {
      const documentId = `${contract.code}-EMP-${String(e + 1).padStart(2, "0")}`;
      await prisma.employee.upsert({
        where: { contractId_documentId: { contractId: contract.id, documentId } },
        update: {},
        create: {
          documentId,
          name: `Empleado ${ci * 5 + e + 1}`,
          position: EMPLOYEE_POSITIONS[e % EMPLOYEE_POSITIONS.length],
          contractId: contract.id,
        },
      });
    }
  }

  // 4. Ítems — 50 en 4 categorías
  const items = [];
  for (const tpl of ITEM_TEMPLATES) {
    for (const [i, name] of tpl.names.entries()) {
      const sku = `${tpl.prefix}-${String(i + 1).padStart(3, "0")}`;
      const item = await prisma.item.upsert({
        where: { sku },
        update: { name, category: tpl.category },
        create: { sku, name, category: tpl.category, unit: tpl.unit },
      });
      items.push(item);
    }
  }

  // 5. Stock inicial — cada bodega arranca con los primeros 20 ítems.
  //    Cantidades variadas a propósito: algunas por debajo del mínimo, para
  //    que las alertas de stock bajo tengan algo que mostrar desde el día uno.
  const warehouses = await prisma.warehouse.findMany();
  for (const [wi, warehouse] of warehouses.entries()) {
    for (const [ii, item] of items.slice(0, 20).entries()) {
      const quantity = (wi * 7 + ii * 3) % 60;
      await prisma.stock.upsert({
        where: { warehouseId_itemId: { warehouseId: warehouse.id, itemId: item.id } },
        update: {},
        create: { warehouseId: warehouse.id, itemId: item.id, quantity, minQuantity: 10 },
      });
    }
  }
}

/** Entrada CLI: `npm run prisma:seed`. Los tests importan `seed()` directo. */
async function main(): Promise<void> {
  // `tsx` no carga `.env` solo. Sin esto el seed muere con
  // "DATABASE_URL no está definida" aunque el archivo exista.
  loadEnvFileIfPresent();

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está definida");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    await seed(prisma);
    console.log("Seed completado: 9 contratos · 15 usuarios · 45 empleados · 50 ítems");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.includes("seed")) {
  void main();
}
