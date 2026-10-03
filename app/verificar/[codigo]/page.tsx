import { headers } from "next/headers";
import { BadgeCheck, Building2, CircleX, Clock, SearchX } from "lucide-react";
import { prisma } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { fecha, fechaLarga } from "@/lib/format";
import { label } from "@/lib/labels";

export const metadata = { title: "Verificación de documentos", robots: { index: false } };
export const dynamic = "force-dynamic";

type Resultado = {
  tipo: string;
  estado: "VALIDO" | "VENCIDO" | "ANULADO" | "NO_VIGENTE";
  conjunto: string;
  datos: [string, string][];
};

/** Nombre con datos mínimos: "Laura G." (protección de datos personales, Ley 1581 de 2012). */
function nombreMinimo(n: string | null | undefined) {
  if (!n) return "—";
  const [p, ...r] = n.trim().split(/\s+/);
  return `${p}${r[0] ? ` ${r[0][0]}.` : ""}`;
}

async function buscar(codigoRaw: string): Promise<Resultado | null> {
  const codigo = decodeURIComponent(codigoRaw).trim();
  if (!codigo || codigo.length > 80) return null;
  const variantes = [...new Set([codigo, codigo.toUpperCase()])];
  const conj = async (id: string) => (await prisma.conjunto.findUnique({ where: { id }, select: { nombre: true } }))?.nombre ?? "—";

  const cert = await prisma.certificadoPazYSalvo.findFirst({ where: { codigo: { in: variantes }, deletedAt: null }, include: { unidad: { select: { codigo: true } } } });
  if (cert) {
    const vencido = cert.estado === "VENCIDO" || (cert.estado === "VIGENTE" && cert.vigenteHasta < new Date());
    return {
      tipo: "Certificado de paz y salvo",
      estado: cert.estado === "ANULADO" ? "ANULADO" : vencido ? "VENCIDO" : "VALIDO",
      conjunto: await conj(cert.conjuntoId),
      datos: [
        ["Código", cert.codigo],
        ["Unidad", cert.unidad.codigo],
        ["A nombre de", nombreMinimo(cert.personaNombre)],
        ["Expedido", fechaLarga(cert.fecha)],
        ["Válido hasta", fecha(cert.vigenteHasta)],
      ],
    };
  }
  const asamblea = await prisma.asamblea.findFirst({ where: { actaCodigo: { in: variantes }, deletedAt: null } });
  if (asamblea) {
    return {
      tipo: "Acta de asamblea",
      estado: asamblea.actaPublicadaEn ? "VALIDO" : "NO_VIGENTE",
      conjunto: await conj(asamblea.conjuntoId),
      datos: [
        ["Código", asamblea.actaCodigo ?? codigo],
        ["Asamblea", asamblea.titulo],
        ["Tipo", `${label(asamblea.tipo)} · ${label(asamblea.modalidad)}`],
        ["Fecha", fechaLarga(asamblea.fecha)],
        ["Acta publicada", asamblea.actaPublicadaEn ? fecha(asamblea.actaPublicadaEn) : "Pendiente de publicación"],
      ],
    };
  }
  const votacion = await prisma.votacion.findFirst({ where: { codigoActa: { in: variantes }, deletedAt: null } });
  if (votacion) {
    return {
      tipo: "Acta de resultados de votación",
      estado: votacion.estado === "ANULADA" ? "ANULADO" : votacion.estado === "CERRADA" ? "VALIDO" : "NO_VIGENTE",
      conjunto: await conj(votacion.conjuntoId),
      datos: [
        ["Código", votacion.codigoActa ?? codigo],
        ["Pregunta", votacion.pregunta],
        ["Cierre", fechaLarga(votacion.fin)],
        ["Estado", label(votacion.estado)],
      ],
    };
  }
  const doc = await prisma.documento.findFirst({ where: { codigoVerificacion: { in: variantes }, deletedAt: null } });
  if (doc) {
    return {
      tipo: "Documento oficial",
      estado: doc.publicado ? (doc.vence && doc.vence < new Date() ? "VENCIDO" : "VALIDO") : "NO_VIGENTE",
      conjunto: await conj(doc.conjuntoId),
      datos: [
        ["Código", doc.codigoVerificacion ?? codigo],
        ["Documento", doc.titulo],
        ["Categoría", label(doc.categoria)],
        ["Versión", String(doc.versionActual)],
        ["Actualizado", fecha(doc.updatedAt)],
        ...(doc.vence ? ([["Vence", fecha(doc.vence)]] as [string, string][]) : []),
      ],
    };
  }
  return null;
}

const ESTADOS = {
  VALIDO: { texto: "Documento válido", icon: BadgeCheck, cls: "border-success/40 bg-success/10 text-success" },
  VENCIDO: { texto: "Documento auténtico, pero vencido", icon: Clock, cls: "border-warning/40 bg-warning/10 text-warning" },
  ANULADO: { texto: "Documento anulado: no tiene validez", icon: CircleX, cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  NO_VIGENTE: { texto: "Documento registrado, aún no vigente", icon: Clock, cls: "border-warning/40 bg-warning/10 text-warning" },
} as const;

export default async function VerificarPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const h = await headers();
  const limitado = !rateLimit(`verificar:${clientIp(h)}`, 30, 60_000).ok;
  const r = limitado ? null : await buscar(codigo);
  const e = r ? ESTADOS[r.estado] : null;
  return (
    <main className="flex min-h-dvh flex-col bg-gradient-to-b from-primary/10 via-background to-background">
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Building2 className="size-7" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xl font-bold leading-tight">Conjunto360</p>
            <p className="text-sm text-muted-foreground">Verificación de documentos</p>
          </div>
        </div>
        {limitado ? (
          <p className="rounded-xl border p-4 text-sm">Demasiadas consultas. Intenta de nuevo en un minuto.</p>
        ) : !r || !e ? (
          <div className="rounded-2xl border border-destructive/40 bg-card p-5 text-center">
            <SearchX className="mx-auto mb-2 size-10 text-destructive" />
            <h1 className="text-lg font-semibold">Código no encontrado</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              El código <span className="font-mono">{decodeURIComponent(codigo).slice(0, 80)}</span> no corresponde a ningún documento emitido por Conjunto360. Verifica que lo escribiste bien o comunícate con la administración del conjunto.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className={`flex items-center gap-3 border-b p-4 ${e.cls}`}>
              <e.icon className="size-8 shrink-0" />
              <div>
                <h1 className="font-semibold">{e.texto}</h1>
                <p className="text-sm text-foreground">{r.tipo}</p>
              </div>
            </div>
            <dl className="divide-y text-sm">
              <div className="flex justify-between gap-3 px-4 py-2.5">
                <dt className="text-muted-foreground">Emitido por</dt>
                <dd className="text-right font-medium">{r.conjunto}</dd>
              </div>
              {r.datos.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 px-4 py-2.5">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className={`text-right font-medium ${k === "Código" ? "font-mono" : ""}`}>{v}</dd>
                </div>
              ))}
            </dl>
            <p className="border-t p-4 text-xs text-muted-foreground">Consulta realizada el {fechaLarga(new Date())}. Por protección de datos personales solo se muestra la información mínima necesaria.</p>
          </div>
        )}
        <form action="/verificar" method="get" className="mt-6 flex gap-2">
          <input name="codigo" placeholder="Otro código, p. ej. PYS-ABCD-1234" aria-label="Código de verificación" className="h-11 flex-1 rounded-lg border bg-background px-3 uppercase" />
          <button type="submit" className="h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
            Verificar
          </button>
        </form>
      </div>
    </main>
  );
}
