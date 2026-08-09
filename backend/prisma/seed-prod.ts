import { PrismaPg } from "@prisma/adapter-pg";
import * as bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";

import {
  type ItemCategory,
  PrismaClient,
  type Role,
} from "../src/prisma/generated/client/client";

/**
 * Seed de PRODUCCIÓN.
 *
 * Diferencias con `seed.ts` (desarrollo), y cada una tiene su razón:
 *
 *  · Contraseñas ALEATORIAS de 16 bytes, impresas UNA sola vez por stdout.
 *    Nunca `changeme123`: esa está escrita en el README y en docs/api.md,
 *    o sea que es pública.
 *  · NO crea empleados de demo. Los empleados son personas reales de ASOFER
 *    y los carga la empresa. Sembrar "Empleado 1..45" contamina la
 *    trazabilidad de dotación, que es justo lo que el módulo existe para dar.
 *  · NO siembra stock. El inventario inicial se carga con un conteo físico,
 *    no con números inventados. Un stock falso es peor que un stock vacío:
 *    la gente le cree.
 *  · Es IDEMPOTENTE y NO pisa contraseñas existentes. Correrlo dos veces no
 *    deja a nadie afuera del sistema.
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

/** Catálogo base. Son insumos reales del rubro, no datos de relleno. */
const ITEMS: { sku: string; name: string; category: ItemCategory; unit: string }[] = [
  { sku: "MAT-001", name: "Cemento gris 50kg", category: "MATERIALES", unit: "bolsa" },
  { sku: "MAT-002", name: "Arena de río", category: "MATERIALES", unit: "m3" },
  { sku: "MAT-003", name: "Grava triturada", category: "MATERIALES", unit: "m3" },
  { sku: "MAT-004", name: "Varilla corrugada 1/2", category: "MATERIALES", unit: "unidad" },
  { sku: "MAT-005", name: "Varilla corrugada 3/8", category: "MATERIALES", unit: "unidad" },
  { sku: "MAT-006", name: "Alambre de amarre", category: "MATERIALES", unit: "kg" },
  { sku: "EQU-001", name: "Andamio tubular módulo", category: "EQUIPOS", unit: "unidad" },
  { sku: "EQU-002", name: "Mezcladora de concreto", category: "EQUIPOS", unit: "unidad" },
  { sku: "EQU-003", name: "Vibrador de concreto", category: "EQUIPOS", unit: "unidad" },
  { sku: "DOT-001", name: "Casco de seguridad", category: "DOTACION", unit: "unidad" },
  { sku: "DOT-002", name: "Botas punta de acero", category: "DOTACION", unit: "par" },
  { sku: "DOT-003", name: "Guantes de carnaza", category: "DOTACION", unit: "par" },
  { sku: "DOT-004", name: "Arnés de cuerpo completo", category: "DOTACION", unit: "unidad" },
  { sku: "CON-001", name: "Disco de corte 7", category: "CONSUMIBLES", unit: "unidad" },
  { sku: "CON-002", name: "Electrodo E7018", category: "CONSUMIBLES", unit: "kg" },
];

/** 16 bytes en base64url: suficiente entropía, y se puede dictar por teléfono. */
function generarPassword(): string {
  return randomBytes(16).toString("base64url");
}

async function main(): Promise<void> {
  // Sin dependencia de `src/config/load-env`: la imagen de runtime no copia
  // `src/` (salvo el cliente generado) y ese import rompía el seed dentro
  // del contenedor. Acá las variables llegan del entorno de Docker; el
  // `.env` solo existe cuando se corre desde una máquina de desarrollo.
  try {
    process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
  } catch {
    // Sin .env: se asume que las variables ya están en el entorno.
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está definida");

  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "⚠️  NODE_ENV no es 'production'. Este seed está pensado para el " +
        "servidor real; en desarrollo usá `npm run prisma:seed`.",
    );
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const credenciales: { email: string; rol: string; contrato: string; password: string }[] = [];

  try {
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

    // 2. Usuarios
    const definiciones: { email: string; name: string; role: Role; contractCode?: string }[] = [
      { email: "admin@asofer.com", name: "Administrador ASOFER", role: "ADMIN" },
      { email: "bodega@asofer.com", name: "Encargado de Bodega", role: "WAREHOUSE" },
      { email: "compras@asofer.com", name: "Jefe de Compras", role: "PURCHASING_MANAGER" },
      ...CONTRACTS.map((c, i) => ({
        email: `coord${i + 1}@asofer.com`,
        name: `Coordinador ${c.code}`,
        role: "COORDINATOR" as Role,
        contractCode: c.code,
      })),
    ];

    for (const def of definiciones) {
      const existente = await prisma.user.findUnique({ where: { email: def.email } });
      const contrato = def.contractCode
        ? contracts.find((c) => c.code === def.contractCode)
        : undefined;

      if (existente) {
        // NO se pisa la contraseña de alguien que ya está operando.
        await prisma.user.update({
          where: { email: def.email },
          data: { name: def.name, role: def.role, contractId: contrato?.id ?? null },
        });
        continue;
      }

      const password = generarPassword();
      await prisma.user.create({
        data: {
          email: def.email,
          name: def.name,
          role: def.role,
          passwordHash: await bcrypt.hash(password, 12),
          contractId: contrato?.id ?? null,
        },
      });
      credenciales.push({
        email: def.email,
        rol: def.role,
        contrato: def.contractCode ?? "todos",
        password,
      });
    }

    // 3. Catálogo de artículos
    for (const item of ITEMS) {
      await prisma.item.upsert({
        where: { sku: item.sku },
        update: { name: item.name, category: item.category, unit: item.unit },
        create: item,
      });
    }

    console.log(
      `\n✅ Seed de producción: ${contracts.length} contratos · ` +
        `${definiciones.length} usuarios · ${ITEMS.length} artículos\n`,
    );

    if (credenciales.length > 0) {
      console.log("═".repeat(72));
      console.log("CREDENCIALES GENERADAS — SE MUESTRAN UNA SOLA VEZ");
      console.log("Copiálas AHORA y entregalas por un canal seguro.");
      console.log("═".repeat(72));
      for (const c of credenciales) {
        console.log(
          `${c.email.padEnd(26)} ${c.rol.padEnd(20)} ${c.contrato.padEnd(10)} ${c.password}`,
        );
      }
      console.log("═".repeat(72));
      console.log(
        "\nNo quedan guardadas en ningún lado: la base tiene solo el hash " +
          "bcrypt. Si las perdés hay que resetearlas a mano.\n",
      );
    } else {
      console.log("Todos los usuarios ya existían. No se generó ninguna contraseña.\n");
    }

    console.log(
      "PENDIENTE, y lo carga ASOFER — este seed NO lo inventa:\n" +
        "  · Empleados reales de cada contrato (trazabilidad de dotación)\n" +
        "  · Stock inicial, a partir de un conteo físico de bodega\n",
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
