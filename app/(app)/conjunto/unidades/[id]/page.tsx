import Link from "next/link";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { fichaUnidad } from "@/lib/conjunto/service";
import { torreOptions } from "@/lib/conjunto/options";
import { cop, edad, fecha, fechaHora, nombreCompleto, num } from "@/lib/format";
import { label } from "@/lib/labels";
import { Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { ActionButton } from "@/components/form/action-form";
import { Button } from "@/components/ui/button";
import { UnidadForm } from "../unidad-form";
import { eliminarUnidadAction } from "../../actions";

export const metadata = { title: "Ficha de unidad" };

export default async function UnidadPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("conjunto.ver");
  const { id } = await params;
  const u = await fichaUnidad(ctx, id);
  const verFin = can(ctx, ["cartera.ver_todos", "campos.unidad_financiero"]);
  const verTel = can(ctx, "campos.persona_telefono");
  const verSalud = can(ctx, "campos.persona_salud");
  const med = (u.medidores ?? {}) as Record<string, string>;
  const datos: [string, React.ReactNode][] = [
    ["Torre", u.torre?.nombre ?? "—"],
    ["Tipo", label(u.tipo)],
    ["Piso", u.piso ?? "—"],
    ["Área privada", u.areaPrivada ? `${num(u.areaPrivada)} m²` : "—"],
    ["Área construida", u.areaConstruida ? `${num(u.areaConstruida)} m²` : "—"],
    ["Coeficiente", `${num(u.coeficiente, 6)} %`],
    ...(verFin ? ([["Cuota de administración", cop(u.cuotaAdministracion)]] as [string, React.ReactNode][]) : []),
    ["Ocupación", <StatusBadge key="o" value={u.estadoOcupacion} />],
    ["Matrícula", u.matriculaInmobiliaria ?? "—"],
    ["Catastral", u.numeroCatastral ?? "—"],
    ["Estrato", u.estrato ?? "—"],
    ["Habitaciones / baños", `${u.habitaciones ?? "—"} / ${u.banos ?? "—"}`],
    ["Medidores", [med.agua && `Agua ${med.agua}`, med.luz && `Luz ${med.luz}`, med.gas && `Gas ${med.gas}`].filter(Boolean).join(" · ") || "—"],
    ...(u.plataformaRentaCorta ? ([["Renta corta", `${u.plataformaRentaCorta} · RNT ${u.registroRnt ?? "—"}`]] as [string, React.ReactNode][]) : []),
  ];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/conjunto/unidades" className="text-sm text-muted-foreground">
            ← Unidades
          </Link>
          <h2 className="text-2xl font-bold">{u.codigo}</h2>
          {(u.tienePersonaMovilidadReducida || u.requiereAsistenciaEvacuacion) && <p className="text-sm text-warning">♿ Requiere atención prioritaria en emergencias</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {can(ctx, "cartera.ver_todos") && (
            <Button variant="outline" render={<Link href={`/cartera/unidades/${u.id}`} />}>
              Estado de cuenta
            </Button>
          )}
          {can(ctx, "residentes.ver_todos") && (
            <Button variant="outline" render={<Link href={`/mi-hogar/accesos?u=${u.id}`} />}>
              Accesos a la app
            </Button>
          )}
          {can(ctx, "informes.historial_unidad") && (
            <Button variant="outline" render={<Link href={`/informes/unidad/${u.id}`} />}>
              Historial
            </Button>
          )}
        </div>
      </div>

      <Section titulo="Ficha física">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
          {datos.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        {u.notasEstructura && <p className="mt-2 text-sm text-muted-foreground">{u.notasEstructura}</p>}
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section titulo={`Personas vinculadas (${u.vinculos.length})`}>
          <ul className="divide-y rounded-xl border bg-card">
            {u.vinculos.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sin personas registradas.</li>}
            {u.vinculos.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/residentes/${v.personaId}`} className="font-medium text-primary hover:underline">
                    {nombreCompleto(v.persona)}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {label(v.tipo)}
                    {v.principal && " · principal"}
                    {(v.derivadoDeId || v.capacidadesHogar.length > 0) && (v.accesoPausado ? " · acceso derivado en pausa" : " · acceso derivado")}
                    {edad(v.persona.fechaNacimiento) !== null && ` · ${edad(v.persona.fechaNacimiento)} años`}
                    {verTel && v.persona.telefono && ` · ${v.persona.telefono}`}
                    {verSalud && v.persona.movilidadReducida && " · ♿ movilidad reducida"}
                  </p>
                </div>
                <StatusBadge value={v.estado} />
              </li>
            ))}
          </ul>
        </Section>
        <Section titulo="Parqueaderos y bodegas">
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {[...u.parqueaderos.map((p) => `🅿️ ${p.codigo} · ${label(p.tipo)} · ${p.ubicacion ?? ""}`), ...u.bodegas.map((b) => `📦 Bodega ${b.codigo} · ${b.ubicacion ?? ""}`)].map((t) => (
              <li key={t} className="p-3">
                {t}
              </li>
            ))}
            {u.parqueaderos.length + u.bodegas.length === 0 && <li className="p-4 text-muted-foreground">Sin parqueaderos ni bodegas asignados.</li>}
          </ul>
        </Section>
        <Section titulo={`Vehículos (${u.vehiculos.length})`}>
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {u.vehiculos.map((v) => (
              <li key={v.id} className="flex justify-between p-3">
                <span className="font-mono font-semibold">{v.placa}</span>
                <span className="text-muted-foreground">
                  {label(v.tipo)} · {v.marca} {v.color} {v.soatVence && `· SOAT ${fecha(v.soatVence)}`}
                </span>
              </li>
            ))}
            {u.vehiculos.length === 0 && <li className="p-4 text-muted-foreground">Sin vehículos.</li>}
          </ul>
        </Section>
        <Section titulo={`Mascotas (${u.mascotas.length})`}>
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {u.mascotas.map((m) => (
              <li key={m.id} className="flex justify-between p-3">
                <span className="font-medium">{m.nombre}</span>
                <span className="text-muted-foreground">
                  {m.especie} {m.raza && `· ${m.raza}`} {m.potencialmentePeligrosa && "· ⚠️ potencialmente peligrosa"}
                </span>
              </li>
            ))}
            {u.mascotas.length === 0 && <li className="p-4 text-muted-foreground">Sin mascotas.</li>}
          </ul>
        </Section>
      </div>

      {u.historialCoef.length > 0 && (
        <Section titulo="Historial de coeficiente">
          <ul className="rounded-xl border bg-card text-sm">
            {u.historialCoef.map((h) => (
              <li key={h.id} className="border-b p-3 last:border-0">
                {fechaHora(h.createdAt)}: {num(h.anterior, 6)} % → <b>{num(h.nuevo, 6)} %</b> {h.motivo && `· ${h.motivo}`}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {can(ctx, "conjunto.editar") && (
        <details className="mb-6 rounded-xl border bg-card p-4">
          <summary className="cursor-pointer font-semibold">Editar unidad</summary>
          <div className="mt-4">
            <UnidadForm unidad={u} torres={await torreOptions(ctx)} puedeCoeficientes={can(ctx, "conjunto.coeficientes")} />
          </div>
        </details>
      )}
      {can(ctx, "conjunto.eliminar") && (
        <ActionButton action={eliminarUnidadAction} input={{ id: u.id }} variant="destructive" confirm={`¿Eliminar la unidad ${u.codigo}?`} successMessage="Unidad eliminada" redirectTo="/conjunto/unidades">
          Eliminar unidad
        </ActionButton>
      )}
    </>
  );
}
