import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { Ctx } from "@/lib/auth/context";
import { readSheet } from "@/lib/export/xlsx";
import { aplicarImportacion, prepararImportacion } from "@/lib/importacion/service";
import { saldoUnidad } from "@/lib/cartera/core";
import { makeConjunto } from "../helpers/db";

/** Arma un .xlsx real (como el que sube la administración) y lo lee con el mismo parser de la pantalla. */
async function excel(encabezados: string[], filas: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Datos");
  ws.addRow(encabezados);
  for (const f of filas) ws.addRow(f);
  return readSheet(Buffer.from(await wb.xlsx.writeBuffer()), "datos.xlsx");
}

describe("importación de apertura desde Excel", () => {
  let ctx: Ctx;

  beforeAll(async () => {
    ({ ctx } = await makeConjunto("Importacion"));
  });

  it("unidades y coeficientes: valida fila por fila y aplica solo las filas válidas", async () => {
    // Encabezados con mayúsculas y tildes, como los escribe la gente en Excel.
    const filas = await excel(
      ["Código", "Torre", "Tipo", "Piso", "Coeficiente", "Cuota administración"],
      [
        ["T1-101", "Torre 1", "APARTAMENTO", 1, 40, 300000],
        ["T1-102", "Torre 1", "APARTAMENTO", 1, 35, 280000],
        ["T1-201", "Torre 1", "CASTILLO", 2, 25, 250000], // tipo no válido
        ["T1-101", "Torre 1", "APARTAMENTO", 1, 10, 100000], // código repetido
        ["", "Torre 1", "APARTAMENTO", 3, "", ""], // faltan obligatorios
      ],
    );
    const v = await prepararImportacion(ctx, "UNIDADES", "unidades.xlsx", filas);
    expect(v.filasOk).toBe(2);
    expect(v.filasConError).toBe(3);
    expect(v.errores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fila: 4, campo: "tipo" }),
        expect.objectContaining({ fila: 5, campo: "codigo", mensaje: "Código repetido en el archivo" }),
        expect.objectContaining({ fila: 6, campo: "codigo", mensaje: "Campo obligatorio vacío" }),
        expect.objectContaining({ fila: 6, campo: "coeficiente" }),
      ]),
    );
    const r = await aplicarImportacion(ctx, v.id);
    expect(r).toMatchObject({ creados: 2 });
    const unidades = await ctx.db.unidad.findMany({ orderBy: { codigo: "asc" }, include: { torre: true } });
    expect(unidades.map((u) => [u.codigo, Number(u.coeficiente), u.torre?.nombre])).toEqual([
      ["T1-101", 40, "Torre 1"],
      ["T1-102", 35, "Torre 1"],
    ]);
    await expect(aplicarImportacion(ctx, v.id)).rejects.toThrow("ya fue aplicada");
  });

  it("propietarios y residentes: crea personas y vínculos; rechaza unidades inexistentes", async () => {
    const filas = await excel(
      ["unidad", "vinculo", "tipo_documento", "numero_documento", "nombres", "apellidos", "email"],
      [
        ["T1-101", "PROPIETARIO", "CC", "72123456", "Carlos", "Pérez Díaz", "carlos@correo.com"],
        ["T1-101", "RESIDENTE", "CC", "1045123456", "Ana", "Pérez Ruiz", ""],
        ["T1-102", "ARRENDATARIO", "CE", "998877", "Luis", "Gómez", "correo-malo"], // correo no válido
        ["T9-999", "PROPIETARIO", "CC", "111", "Nadie", "Existe", ""], // la unidad no existe
      ],
    );
    const v = await prepararImportacion(ctx, "PROPIETARIOS", "propietarios.xlsx", filas);
    expect(v.filasOk).toBe(2);
    expect(v.errores.map((e) => [e.fila, e.campo])).toEqual([
      [4, "email"],
      [5, "unidad"],
    ]);
    await aplicarImportacion(ctx, v.id);
    const vinculos = await ctx.db.vinculoUnidad.findMany({ include: { persona: true, unidad: true }, orderBy: { createdAt: "asc" } });
    expect(vinculos.map((x) => [x.unidad.codigo, x.tipo, x.persona.numeroDocumento, x.principal])).toEqual([
      ["T1-101", "PROPIETARIO", "72123456", true],
      ["T1-101", "RESIDENTE", "1045123456", false],
    ]);
  });

  it("saldos iniciales: crea la cartera de apertura y valida valores y fechas", async () => {
    const filas = await excel(
      ["unidad", "concepto", "valor", "fecha_vencimiento", "periodo", "descripcion"],
      [
        ["T1-101", "ADMINISTRACION", "780000", "2026-08-10", "2026-08", "Saldo a la fecha de inicio"],
        ["T1-101", "INTERES_MORA", "24500", "2026-08-31", "2026-08", "Intereses acumulados"],
        ["T1-102", "ADMINISTRACION", "-5000", "2026-08-10", "2026-08", ""], // valor negativo
        ["T1-102", "ADMINISTRACION", "100000", "31/31/2026", "2026-08", ""], // fecha no válida
      ],
    );
    const v = await prepararImportacion(ctx, "SALDOS", "saldos.xlsx", filas);
    expect(v.filasOk).toBe(2);
    expect(v.errores.map((e) => [e.fila, e.campo])).toEqual([
      [4, "valor"],
      [5, "fecha_vencimiento"],
    ]);
    await aplicarImportacion(ctx, v.id);
    const t101 = await ctx.db.unidad.findFirstOrThrow({ where: { codigo: "T1-101" } });
    const t102 = await ctx.db.unidad.findFirstOrThrow({ where: { codigo: "T1-102" } });
    expect((await saldoUnidad(ctx, t101.id)).total).toBe(804500);
    expect((await saldoUnidad(ctx, t102.id)).total).toBe(0);
    const cuotas = await ctx.db.cuota.findMany({ where: { unidadId: t101.id } });
    expect(cuotas.every((c) => c.origen === "APERTURA")).toBe(true);
  });

  it("vehículos: valida placa según el tipo, duplicados, unidad y parqueadero; reimportar actualiza", async () => {
    await ctx.db.parqueadero.create({ data: { conjuntoId: ctx.conjuntoId, codigo: "P-001", tipo: "PRIVADO" } });
    const filas = await excel(
      ["unidad", "placa", "tipo", "marca", "color", "soat_vence", "parqueadero"],
      [
        ["T1-101", "abc 123", "CARRO", "Mazda", "Gris", "2027-03-15", "P-001"],
        ["T1-102", "XYZ12D", "MOTO", "Yamaha", "Negro", "", ""],
        ["T1-102", "ABC123", "CARRO", "Renault", "Rojo", "", ""], // repetida en el archivo
        ["T1-102", "AB1", "MOTO", "", "", "", ""], // placa de moto no válida
        ["T9-999", "QWE456", "CARRO", "", "", "", ""], // unidad inexistente
        ["T1-102", "RTY789", "AVION", "", "", "2027-99-99", "P-404"], // tipo, fecha y parqueadero no válidos
      ],
    );
    const v = await prepararImportacion(ctx, "VEHICULOS", "vehiculos.xlsx", filas);
    expect(v.filasOk).toBe(2);
    expect(v.errores.map((e) => [e.fila, e.campo])).toEqual([
      [4, "placa"],
      [5, "placa"],
      [6, "unidad"],
      [7, "tipo"],
      [7, "soat_vence"],
      [7, "parqueadero"],
    ]);
    await aplicarImportacion(ctx, v.id);
    const carro = await ctx.db.vehiculo.findFirstOrThrow({ where: { placa: "ABC123" }, include: { unidad: true, parqueadero: true } });
    expect(carro).toMatchObject({ tipo: "CARRO", marca: "Mazda", unidad: { codigo: "T1-101" }, parqueadero: { codigo: "P-001" } });
    expect(carro.soatVence?.toISOString().slice(0, 10)).toBe("2027-03-15");

    // Una placa registrada en otra unidad se rechaza; en la misma unidad se actualiza.
    const otra = await prepararImportacion(ctx, "VEHICULOS", "v2.xlsx", await excel(["unidad", "placa", "tipo", "color"], [["T1-102", "ABC123", "CARRO", "Azul"]]));
    expect(otra.errores[0]).toMatchObject({ campo: "placa", mensaje: "La placa ya está registrada en T1-101" });
    const misma = await prepararImportacion(ctx, "VEHICULOS", "v3.xlsx", await excel(["unidad", "placa", "tipo", "color"], [["T1-101", "ABC123", "CARRO", "Azul"]]));
    expect(await aplicarImportacion(ctx, misma.id)).toMatchObject({ creados: 0, actualizados: 1 });
    expect((await ctx.db.vehiculo.findFirstOrThrow({ where: { placa: "ABC123" } })).color).toBe("Azul");
    expect(await ctx.db.vehiculo.count()).toBe(2);
  });

  it("la importación queda aislada en su conjunto", async () => {
    const otro = await makeConjunto("Otro");
    expect(await otro.ctx.db.unidad.count()).toBe(0);
    expect(await prisma.unidad.count({ where: { conjuntoId: ctx.conjuntoId } })).toBe(2);
  });
});
