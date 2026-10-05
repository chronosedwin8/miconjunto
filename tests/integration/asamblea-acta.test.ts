import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { finalizarAsamblea, firmarActa, guardarActa, guardarAsamblea, iniciarAsamblea, registrarAsistenciaManual } from "@/lib/asambleas/service";
import { actaAsambleaPdf, publicarActa } from "@/lib/asambleas/acta";
import { makeConjunto, makeUnidades } from "../helpers/db";

// PNG mínimo válido (1×1) como firma dibujada en pantalla.
const FIRMA = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("acta de asamblea: generar, firmar, publicar y PDF", () => {
  it("al finalizar se redacta el acta; se firma, se publica en documentos y se descarga en PDF", async () => {
    const { ctx } = await makeConjunto("Acta");
    const unidades = await makeUnidades(ctx.conjuntoId, 4);
    const a = await guardarAsamblea(ctx, { titulo: "Asamblea ordinaria 2026", tipo: "ORDINARIA", modalidad: "PRESENCIAL", fecha: new Date(), lugar: "Salón social" });
    // La convocatoria (con su antelación legal) se prueba en votaciones.test.ts; aquí se parte de una asamblea convocada.
    await prisma.asamblea.update({ where: { id: a.id }, data: { estado: "CONVOCADA" } });
    await iniciarAsamblea(ctx, a.id);
    for (const u of unidades.slice(0, 3)) await registrarAsistenciaManual(ctx, { asambleaId: a.id, unidadId: u.id, tipo: "PRESENCIAL" });

    await finalizarAsamblea(ctx, a.id);
    const fin = await prisma.asamblea.findUniqueOrThrow({ where: { id: a.id } });
    expect(fin.estado).toBe("FINALIZADA");
    // El texto del acta se genera automáticamente al terminar.
    expect(fin.actaTexto).toBeTruthy();
    expect(fin.actaTexto).toMatch(/qu[oó]rum/i);
    expect(fin.actaTexto).toContain("ACTA DE ASAMBLEA GENERAL ORDINARIA");

    // No se puede publicar sin las dos firmas.
    await expect(publicarActa(ctx, a.id)).rejects.toThrow("firmada por el presidente y el secretario");

    await firmarActa(ctx, { asambleaId: a.id, rol: "PRESIDENTE", nombre: "María Torres", firma: FIRMA });
    // Si el texto cambia después de firmar, las firmas se invalidan.
    await guardarActa(ctx, { asambleaId: a.id, actaTexto: `${fin.actaTexto}\nNota agregada.` });
    expect((await prisma.asamblea.findUniqueOrThrow({ where: { id: a.id } })).firmaPresidente).toBeNull();

    await firmarActa(ctx, { asambleaId: a.id, rol: "PRESIDENTE", nombre: "María Torres", firma: FIRMA });
    await firmarActa(ctx, { asambleaId: a.id, rol: "SECRETARIO", nombre: "Jorge Ruiz", firma: FIRMA });
    await expect(firmarActa(ctx, { asambleaId: a.id, rol: "SECRETARIO", nombre: "X", firma: "no-es-una-imagen" })).rejects.toThrow("firma no es válida");

    const pub = await publicarActa(ctx, a.id);
    expect(pub.actaCodigo).toMatch(/^ACT/);
    expect(pub.version).toBe(1);
    const doc = await prisma.documento.findUniqueOrThrow({ where: { id: pub.documentoId } });
    expect(doc).toMatchObject({ categoria: "ACTA", publicado: true });
    expect(await prisma.versionDocumento.count({ where: { documentoId: pub.documentoId } })).toBe(1);
    expect((await prisma.asamblea.findUniqueOrThrow({ where: { id: a.id } })).actaPublicadaEn).not.toBeNull();

    const pdf = await actaAsambleaPdf(ctx, a.id);
    expect(Buffer.from(pdf.buffer).subarray(0, 4).toString()).toBe("%PDF");
    expect(pdf.nombre).toBe(`acta-${pub.actaCodigo}.pdf`);

    // Publicar de nuevo agrega una versión al mismo documento.
    const pub2 = await publicarActa(ctx, a.id);
    expect(pub2).toMatchObject({ documentoId: pub.documentoId, version: 2, actaCodigo: pub.actaCodigo });
  });
});
