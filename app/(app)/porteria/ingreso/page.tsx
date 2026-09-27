import Link from "next/link";
import { AlertTriangle, Car, CheckCircle2, ClipboardEdit, KeyRound, XCircle } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { spGet, type SP } from "@/lib/pagination";
import { label } from "@/lib/labels";
import { unidadOptions } from "@/lib/conjunto/options";
import { buscarAutorizacion, parqueaderoOptions } from "@/lib/porteria/service";
import { textoVigencia } from "@/lib/porteria/autorizaciones";
import { Alerta, Foto, KSection, KTitle } from "../_components/kiosk";
import { CodigoEntrada, ConfirmarIngreso, UnidadPicker } from "../_components/ingreso";

export const metadata = { title: "Ingreso de visitante" };

export default async function IngresoPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("porteria.registrar");
  const sp = await searchParams;
  const codigo = spGet(sp, "codigo");
  const token = spGet(sp, "token");

  if (codigo || token) {
    const [r, parqs] = await Promise.all([buscarAutorizacion(ctx, { codigo, token }), parqueaderoOptions(ctx)]);
    if (!r) {
      return (
        <>
          <KTitle>Ingreso con código</KTitle>
          <Alerta className="mb-4 flex items-center gap-2 text-lg">
            <XCircle className="size-6" /> No existe una autorización con {codigo ? `el código ${codigo}` : "ese QR"}.
          </Alerta>
          <Link href="/porteria/ingreso" className="inline-flex h-14 items-center rounded-xl border-2 px-5 text-lg font-bold">
            Intentar otro código
          </Link>
        </>
      );
    }
    const a = r.autorizacion;
    const ok = r.evaluacion.ok && r.alertas.length === 0;
    return (
      <>
        <KTitle>Confirmar ingreso</KTitle>
        <div className={`mb-4 rounded-2xl border-4 p-4 ${ok ? "border-green-700" : "border-red-700"}`}>
          <div className="flex items-start gap-4">
            <Foto src={r.visitante?.fotoUrl} alt={a.nombreVisitante} className="size-24 text-3xl" />
            <div className="min-w-0 flex-1">
              <p className="text-3xl font-black leading-tight">{a.nombreVisitante}</p>
              <p className="text-lg font-semibold">
                Visita a <span className="rounded-md bg-foreground px-2 text-background">{a.unidad.codigo}</span> · {label(a.tipo)}
              </p>
              {a.documentoVisitante && <p className="text-base">Documento: {a.documentoVisitante}</p>}
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-base sm:grid-cols-4">
            <div className="col-span-2">
              <dt className="text-sm text-muted-foreground">Vigencia</dt>
              <dd className="font-semibold">{textoVigencia(a)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Usos</dt>
              <dd className="font-semibold">{a.usosPermitidos === 0 ? `${a.usos} (ilimitado)` : `${a.usos} de ${a.usosPermitidos}`}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Placa</dt>
              <dd className="font-mono text-lg font-bold">{a.placa ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Código</dt>
              <dd className="font-mono text-lg font-bold">{a.codigo}</dd>
            </div>
          </dl>
          {a.observaciones && <p className="mt-2 text-base">📝 {a.observaciones}</p>}
          {a.tipo === "CONTRATISTA" && a.soporteSeguridadSocialUrl && (
            <a href={a.soporteSeguridadSocialUrl} target="_blank" className="mt-2 inline-block text-base font-semibold text-primary underline">
              Ver soporte de seguridad social
            </a>
          )}
        </div>
        {!r.evaluacion.ok && (
          <Alerta className="mb-3 flex items-center gap-2 text-lg">
            <XCircle className="size-6 shrink-0" /> {r.evaluacion.motivo}
          </Alerta>
        )}
        {r.alertas.map((al) => (
          <Alerta key={al} className="mb-3 flex items-center gap-2 text-lg">
            <AlertTriangle className="size-6 shrink-0" /> {al}
          </Alerta>
        ))}
        {ok ? (
          <>
            <Alerta tono="green" className="mb-4 flex items-center gap-2 text-lg">
              <CheckCircle2 className="size-6" /> Autorización válida
              {a.placa && (
                <span className="ml-auto inline-flex items-center gap-1">
                  <Car className="size-5" /> {a.placa}
                </span>
              )}
            </Alerta>
            <ConfirmarIngreso codigo={token ? undefined : a.codigo} token={token} nombre={a.nombreVisitante} parqueaderos={parqs} placa={a.placa} />
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Link href={`/porteria/unidad/${a.unidadId}`} className="inline-flex h-14 items-center rounded-xl bg-primary px-5 text-lg font-bold text-primary-foreground">
              Notificar al residente
            </Link>
            <Link href="/porteria/ingreso" className="inline-flex h-14 items-center rounded-xl border-2 px-5 text-lg font-bold">
              Otro código
            </Link>
          </div>
        )}
      </>
    );
  }

  const unidades = await unidadOptions(ctx);
  return (
    <>
      <KTitle>Ingreso de visitante</KTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        <KSection
          titulo={
            <span className="inline-flex items-center gap-2">
              <KeyRound className="size-6" /> Con autorización (QR o código)
            </span>
          }
        >
          <CodigoEntrada />
        </KSection>
        <div>
          <KSection titulo="Sin autorización previa">
            <p className="mb-3 text-base text-muted-foreground">Busca la unidad para ver sus frecuentes o notificar al residente (responde Autorizar/Rechazar desde su teléfono).</p>
            <UnidadPicker unidades={unidades} />
          </KSection>
          {can(ctx, "porteria.registrar") && (
            <KSection titulo="Domicilios, proveedores y otros">
              <Link href="/porteria/ingreso/manual" className="flex h-16 items-center justify-center gap-2 rounded-xl border-2 text-lg font-bold hover:bg-muted">
                <ClipboardEdit className="size-6" /> Registro manual
              </Link>
            </KSection>
          )}
        </div>
      </div>
    </>
  );
}
