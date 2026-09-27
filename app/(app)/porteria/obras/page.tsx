import { HardHat, Truck } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fecha } from "@/lib/format";
import { label } from "@/lib/labels";
import { obrasYMudanzasHoy } from "@/lib/porteria/turnos";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/form/action-form";
import { ingresoContratistaAction } from "../actions";
import { KSection, KTitle } from "../_components/kiosk";

export const metadata = { title: "Obras y mudanzas de hoy" };

/** Solo lectura para portería: obras y mudanzas APROBADAS de hoy. La gestión la hace la administración. */
export default async function ObrasPorteriaPage() {
  const ctx = await requirePage("porteria.ver");
  const { obras, mudanzas, exigirSeguridadSocial } = await obrasYMudanzasHoy(ctx);
  const registrar = can(ctx, "porteria.registrar");
  return (
    <>
      <KTitle>Obras y mudanzas de hoy</KTitle>
      <KSection
        titulo={
          <span className="inline-flex items-center gap-2">
            <HardHat className="size-6" /> Obras autorizadas ({obras.length})
          </span>
        }
      >
        {obras.length === 0 ? (
          <EmptyState titulo="No hay obras aprobadas para hoy" />
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {obras.map((o) => (
              <li key={o.id} className="rounded-2xl border-2 p-3">
                <p className="text-lg font-black">
                  {o.unidad.codigo} <span className="text-base font-semibold text-foreground/75">· {label(o.tipo)}</span>
                </p>
                <p className="text-base">{o.descripcion}</p>
                <p className="text-sm text-foreground/75">
                  Horario: {o.horario ?? "—"} · del {fecha(o.fechaInicio)} al {fecha(o.fechaFin)}
                </p>
                <p className="mt-2 font-bold">Contratistas autorizados</p>
                <ul className="mt-1 space-y-2">
                  {o.contratistas.map((c, i) => (
                    <li key={`${c.nombre}-${i}`} className={`flex flex-wrap items-center gap-2 rounded-xl border-2 p-2 ${c.vigente ? "border-green-700/50" : "border-red-700 bg-red-50 dark:bg-red-950/30"}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{c.nombre}</span>
                        <span className="text-sm">
                          {c.documento && `CC ${c.documento} · `}
                          {c.vigente ? `Seguridad social vigente${c.vence ? ` hasta ${fecha(c.vence)}` : ""}` : "⛔ Sin seguridad social vigente"}
                        </span>
                      </span>
                      {registrar && (c.vigente || !exigirSeguridadSocial) && (
                        <ActionButton action={ingresoContratistaAction} input={{ obraId: o.id, indice: i }} successMessage={`Ingreso de ${c.nombre} registrado`} className="h-12 text-base font-bold">
                          Registrar ingreso
                        </ActionButton>
                      )}
                    </li>
                  ))}
                  {o.contratistas.length === 0 && <li className="text-sm text-muted-foreground">La solicitud no tiene contratistas registrados.</li>}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </KSection>
      <KSection
        titulo={
          <span className="inline-flex items-center gap-2">
            <Truck className="size-6" /> Mudanzas ({mudanzas.length})
          </span>
        }
      >
        {mudanzas.length === 0 ? (
          <EmptyState titulo="No hay mudanzas aprobadas para hoy" />
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {mudanzas.map((m) => (
              <li key={m.id} className="rounded-2xl border-2 p-3">
                <p className="text-lg font-black">
                  {m.unidad.codigo} <span className="text-base font-semibold">· {m.tipo === "SALIDA" ? "Salida de enseres" : "Ingreso de enseres"}</span>
                </p>
                <p className="text-base">
                  {m.horaInicio}–{m.horaFin}
                  {m.recurso && ` · ${m.recurso}`}
                  {m.empresa && ` · ${m.empresa}`}
                  {m.placaVehiculo && ` · 🚚 ${m.placaVehiculo}`}
                </p>
                <p className={`text-sm font-semibold ${m.pazYSalvoVerificado ? "text-green-800 dark:text-green-300" : "text-red-800 dark:text-red-300"}`}>{m.pazYSalvoVerificado ? "✅ Paz y salvo verificado" : "⚠️ Paz y salvo sin verificar"}</p>
                {m.enseres.length > 0 && (
                  <>
                    <p className="mt-2 font-bold">Enseres autorizados</p>
                    <ul className="list-inside list-disc text-base">
                      {m.enseres.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </>
                )}
                {m.observaciones && <p className="mt-1 text-sm">📝 {m.observaciones}</p>}
              </li>
            ))}
          </ul>
        )}
      </KSection>
    </>
  );
}
