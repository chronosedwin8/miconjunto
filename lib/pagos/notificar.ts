import type { Ctx } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { notify, usuariosDeUnidad } from "@/lib/notificaciones";
import { appUrl, queueBrandedEmail } from "@/lib/email";
import { cop } from "@/lib/format";
import { reciboPagoPdf } from "./cartera-bridge";

/**
 * Avisa al pagador y a los responsables de la cuenta el resultado de un pago en línea:
 * centro de notificaciones + push, y correo (con el recibo PDF adjunto si fue aprobado).
 */
export async function notificarResultadoPago(ctx: Ctx, pagoId: string, estado: "APROBADO" | "RECHAZADO") {
  try {
    const pago = await prisma.pago.findUniqueOrThrow({ where: { id: pagoId }, include: { unidad: { select: { codigo: true } } } });
    const conjunto = await prisma.conjunto.findUniqueOrThrow({ where: { id: pago.conjuntoId }, select: { nombre: true, colorPrimario: true } });
    const responsables = await usuariosDeUnidad(pago.conjuntoId, pago.unidadId, { soloPropietarios: true, incluirAutorizadosCuenta: true });
    const usuarioIds = [...new Set([pago.registradoPorId, ...responsables].filter((x): x is string => !!x))];
    const aprobado = estado === "APROBADO";
    const titulo = aprobado ? "Pago aprobado" : "Tu pago no fue aprobado";
    const cuerpo = aprobado
      ? `Recibimos tu pago de ${cop(pago.valor)} para ${pago.unidad.codigo}.${pago.numeroRecibo ? ` Recibo N.º ${pago.numeroRecibo}.` : ""}`
      : `La pasarela rechazó el pago de ${cop(pago.valor)} para ${pago.unidad.codigo}. No se hizo ningún cobro; puedes intentarlo de nuevo.`;
    const enlace = aprobado ? `/cuenta/pagos/${pago.referencia}` : `/cuenta/pagar?unidad=${pago.unidadId}`;
    await notify({
      conjuntoId: pago.conjuntoId,
      usuarioIds,
      titulo,
      cuerpo,
      enlace,
      tipo: aprobado ? "PAGO_APROBADO" : "PAGO_RECHAZADO",
      canales: ["push"],
      data: { pagoId: pago.id, referencia: pago.referencia },
    });

    // Correo al pagador (usuario que pagó o correo capturado en el link público); si no hay, a los responsables.
    const pagador = pago.registradoPorId ? await prisma.usuario.findUnique({ where: { id: pago.registradoPorId }, select: { email: true } }) : null;
    let correos = [pagador?.email ?? pago.pagadorEmail].filter((x): x is string => !!x);
    if (!correos.length && usuarioIds.length) {
      const us = await prisma.usuario.findMany({ where: { id: { in: usuarioIds } }, select: { email: true } });
      correos = us.map((u) => u.email);
    }
    const adjuntos = aprobado
      ? [
          {
            filename: `recibo-${pago.numeroRecibo ?? pago.referencia}.pdf`,
            contentBase64: (await reciboPagoPdf(ctx, pago.id)).toString("base64"),
            contentType: "application/pdf",
          },
        ]
      : [];
    for (const to of [...new Set(correos)]) {
      await queueBrandedEmail(
        to,
        aprobado ? `Pago aprobado · ${pago.unidad.codigo}` : `Pago no aprobado · ${pago.unidad.codigo}`,
        {
          conjuntoNombre: conjunto.nombre,
          color: conjunto.colorPrimario ?? undefined,
          titulo,
          parrafos: aprobado
            ? [cuerpo, `Referencia: ${pago.referencia}.`, "Adjuntamos tu recibo de caja en PDF."]
            : [cuerpo, `Referencia: ${pago.referencia}.`],
          boton: pago.registradoPorId ? { texto: aprobado ? "Ver mi cuenta" : "Intentar de nuevo", url: appUrl(enlace) } : undefined,
        },
        { conjuntoId: pago.conjuntoId, attachments: adjuntos },
      );
    }
  } catch (e) {
    console.error("[pagos] no se pudo notificar el resultado del pago", pagoId, (e as Error).message);
  }
}
