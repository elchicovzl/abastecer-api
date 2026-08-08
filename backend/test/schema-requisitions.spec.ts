import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma, resetDatabase } from "./db";

/**
 * Tarea 2.4 — Requisition y RequisitionLine.
 *
 * El constraint central es el del ADR-005: si la línea es DOTACION_PERSONAL,
 * `employeeId` NO puede ser NULL. Y va a nivel de LÍNEA, no de cabecera,
 * porque una misma requisición puede entregar EPP a varios empleados.
 *
 * Está en la BASE y no solo en la app a propósito: la validación de app la
 * saltea un script de migración o una carga masiva. El constraint no.
 */
async function seedContract(code: string) {
  const contract = await prisma.contract.create({
    data: { code, name: `Obra ${code}` },
  });
  const user = await prisma.user.create({
    data: {
      email: `coord-${code}@asofer.com`,
      passwordHash: "hash",
      name: `Coordinador ${code}`,
      role: "COORDINATOR",
      contractId: contract.id,
    },
  });
  const item = await prisma.item.create({
    data: { sku: `SKU-${code}`, name: `Ítem ${code}`, category: "MATERIALES", unit: "u" },
  });
  const employee = await prisma.employee.create({
    data: { documentId: `DOC-${code}`, name: `Empleado ${code}`, contractId: contract.id },
  });
  return { contract, user, item, employee };
}

describe("requisiciones", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("nace en BORRADOR y pertenece al contrato del solicitante", async () => {
    const { contract, user } = await seedContract("C-201");

    const requisition = await prisma.requisition.create({
      data: { contractId: contract.id, requesterId: user.id },
    });

    expect(requisition.status).toBe("BORRADOR");
    expect(requisition.contractId).toBe(contract.id);
    expect(requisition.requesterId).toBe(user.id);
  });

  it("una línea de MATERIAL_OBRA no necesita empleado", async () => {
    const { contract, user, item } = await seedContract("C-202");
    const requisition = await prisma.requisition.create({
      data: { contractId: contract.id, requesterId: user.id },
    });

    const line = await prisma.requisitionLine.create({
      data: {
        requisitionId: requisition.id,
        itemId: item.id,
        quantity: 10,
        justification: "Reposición de obra",
        type: "MATERIAL_OBRA",
      },
    });

    expect(line.employeeId).toBeNull();
    expect(line.quantity).toBe(10);
  });

  it("ADR-005: DOTACION_PERSONAL SIN empleado es rechazada por la base", async () => {
    const { contract, user, item } = await seedContract("C-203");
    const requisition = await prisma.requisition.create({
      data: { contractId: contract.id, requesterId: user.id },
    });

    await expect(
      prisma.requisitionLine.create({
        data: {
          requisitionId: requisition.id,
          itemId: item.id,
          quantity: 1,
          justification: "Botas de seguridad",
          type: "DOTACION_PERSONAL",
        },
      }),
    ).rejects.toThrow();
  });

  it("ADR-005: DOTACION_PERSONAL CON empleado se acepta", async () => {
    const { contract, user, item, employee } = await seedContract("C-204");
    const requisition = await prisma.requisition.create({
      data: { contractId: contract.id, requesterId: user.id },
    });

    const line = await prisma.requisitionLine.create({
      data: {
        requisitionId: requisition.id,
        itemId: item.id,
        quantity: 1,
        justification: "Casco",
        type: "DOTACION_PERSONAL",
        employeeId: employee.id,
      },
    });

    expect(line.employeeId).toBe(employee.id);
  });

  it("una requisición entrega dotación a empleados DISTINTOS en la misma solicitud", async () => {
    const { contract, user, item, employee } = await seedContract("C-205");
    const segundo = await prisma.employee.create({
      data: { documentId: "DOC-205-B", name: "Segundo Empleado", contractId: contract.id },
    });
    const requisition = await prisma.requisition.create({
      data: { contractId: contract.id, requesterId: user.id },
    });

    await prisma.requisitionLine.createMany({
      data: [
        {
          requisitionId: requisition.id,
          itemId: item.id,
          quantity: 1,
          justification: "Casco",
          type: "DOTACION_PERSONAL",
          employeeId: employee.id,
        },
        {
          requisitionId: requisition.id,
          itemId: item.id,
          quantity: 1,
          justification: "Casco",
          type: "DOTACION_PERSONAL",
          employeeId: segundo.id,
        },
      ],
    });

    const receptores = await prisma.requisitionLine.findMany({
      where: { requisitionId: requisition.id },
      select: { employeeId: true },
    });

    // ESTA es la razón de que employeeId viva en la línea y no en la cabecera.
    expect(receptores).toHaveLength(2);
    expect(new Set(receptores.map((r) => r.employeeId))).toEqual(
      new Set([employee.id, segundo.id]),
    );
  });

  it("la cantidad debe ser positiva", async () => {
    const { contract, user, item } = await seedContract("C-206");
    const requisition = await prisma.requisition.create({
      data: { contractId: contract.id, requesterId: user.id },
    });

    await expect(
      prisma.requisitionLine.create({
        data: {
          requisitionId: requisition.id,
          itemId: item.id,
          quantity: 0,
          justification: "Cantidad inválida",
          type: "MATERIAL_OBRA",
        },
      }),
    ).rejects.toThrow();
  });
});
