import Link from "next/link";
import { AlertTriangle, CalendarPlus, HandCoins, Percent, TrendingUp, Wallet } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { spGet, type SP } from "@/lib/pagination";
import { cop, fecha, mesNombre, pct } from "@/lib/format";
import { torreOptions } from "@/lib/conjunto/options";
import { resumenCartera, carteraPorUnidad } from "@/lib/cartera/tablero";
import { estadoTasaMora, textoTasa } from "@/lib/cartera/mora";
import { RANGO_LABEL, RANGOS_MORA } from "@/lib/cartera/calculos";
import { StatCard } from "@/components/app/stat-card";
import { Section } from "@/components/app/page-header";
import { DataList } from "@/components/app/data-list";
import { ListToolbar } from "@/components/app/list-toolbar";
import { StatusBadge } from "@/components/app/status-badge";
import { EmptyState } from "@/components/app/empty-state";
import { ActionButton } from "@/components/form/action-form";
import { Barras, Medidor } from "@/components/charts/charts";
import { Button } from "@/components/ui/button";
import { liquidarMoraAction } from "./actions";

export const metadata = { title: "Cartera" };

export default async function CarteraPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("cartera.ver_todos");
  const sp = await searchParams;
  const torre = spGet(sp, "torre");
  const rango = spGet(sp, "rango");
  const q = spGet(sp, "q")?.toLowerCase();
  const [r, tasa, torres, filasTodas] = await Promise.all([resumenCartera(ctx, { torreId: torre }), estadoTasaMora(ctx), torreOptions(ctx), carteraPorUnidad(ctx, { torreId: torre })]);
  const verMorosos = can(ctx, "secciones.lista_morosos");
  const filas = filasTodas
    .filter((f) => f.total > 0 || f.saldoAFavor > 0)
    .filter((f) => (rango ? f.rango === rango : true))
    .filter((f) => (q ? f.codigo.toLowerCase().includes(q) || (verMorosos && f.propietario?.toLowerCase().includes(q)) : true))
    .sort((a, b) => b.vencido - a.vencido || b.total - a.total);
  const serie = r.serie.map((s) => ({ mes: mesNombre(s.periodo).split(" ")[0].slice(0, 3), Facturado: s.facturado, Recaudado: s.recaudado }));
  const aging = RANGOS_MORA.filter((k) => k !== "AL_DIA").map((k) => ({ rango: RANGO_LABEL[k], Saldo: r.aging[k] }));
  return (
    <>
      {(!tasa.actualizadaEsteMes || tasa.cambioReciente || tasa.excedeMaximo) && (
        <Link
          href="/cartera/tasa-mora"
          className={`mb-4 flex items-start gap-3 rounded-xl border p-3 text-sm ${tasa.excedeMaximo || !tasa.actualizadaEsteMes ? "border-warning/40 bg-warning/10" : "border-primary/30 bg-primary/5"}`}
        >
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          <span>
            {tasa.excedeMaximo
              ? "La tasa de mora vigente supera el máximo legal (1,5 × IBC). Corrígela."
              : !tasa.actualizadaEsteMes
                ? `Actualiza la tasa de mora de ${mesNombre(r.periodo)}. Vigente: ${textoTasa(tasa.vigente)}${tasa.vigente.vigenteDesde ? ` desde el ${fecha(tasa.vigente.vigenteDesde)}` : ""}.`
                : `La tasa de mora cambió: ahora ${textoTasa(tasa.vigente)} (antes ${pct(tasa.anterior?.tasaEA ?? 0, 2)} E.A.).`}
          </span>
        </Link>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Recaudo de ${mesNombre(r.periodo).split(" ")[0]}`} value={cop(r.recaudoMes)} hint={`de ${cop(r.esperadoMes)} facturado`} icon={Wallet} tone="primary" href="/cartera/pagos" />
        <StatCard label="Cartera vencida" value={cop(r.carteraVencida)} hint={`Total por cobrar ${cop(r.carteraTotal)}`} icon={HandCoins} tone={r.carteraVencida > 0 ? "danger" : "success"} href="/cartera/cuotas?estado=VENCIDA" />
        <StatCard label="Unidades en mora" value={pct(r.pctUnidadesMora, 1)} hint={`${r.unidadesEnMora} de ${r.unidades} unidades`} icon={Percent} tone={r.pctUnidadesMora > 15 ? "warning" : "default"} />
        <StatCard label="Proyección 30 días" value={cop(r.proyeccion.total)} hint={`${pct(r.proyeccion.tasaRecaudo * 100, 0)} de recaudo histórico`} icon={TrendingUp} />
      </div>

      <div className="mb-4 rounded-xl border bg-card p-4">
        <Medidor label={`Recaudo del mes frente a lo facturado (${mesNombre(r.periodo)})`} valor={r.pctRecaudo} meta={90} tono={r.pctRecaudo >= 90 ? "good" : "primary"} />
        <div className="mt-3 flex flex-wrap gap-2">
          {can(ctx, "pagos.registrar") && (
            <Button size="sm" render={<Link href="/cartera/pagos?registrar=1" />}>
              <HandCoins /> Registrar pago
            </Button>
          )}
          {can(ctx, "cartera.generar") && (
            <>
              <Button size="sm" variant="outline" render={<Link href="/cartera/generar" />}>
                <CalendarPlus /> Generar cuotas del mes
              </Button>
              <ActionButton size="sm" variant="outline" action={liquidarMoraAction} confirm="¿Liquidar ahora los intereses de mora causados hasta hoy? (El sistema lo hace automáticamente cada día a la 1:00 a. m.)" successMessage="Intereses liquidados">
                Liquidar mora hoy
              </ActionButton>
            </>
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Barras titulo="Facturado vs. recaudado" descripcion="Últimos 6 meses (sin intereses)" data={serie} xKey="mes" series={[{ key: "Facturado", label: "Facturado" }, { key: "Recaudado", label: "Recaudado" }]} formato="cop" />
        <Barras titulo="Edad de la cartera" descripcion="Saldo vencido por días de mora" data={aging} xKey="rango" series={[{ key: "Saldo", label: "Saldo" }]} formato="cop" horizontal />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <Section titulo="Top morosos" className="lg:col-span-2">
          {!verMorosos ? (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">Tu rol no tiene permiso para ver la lista de morosos.</p>
          ) : r.topMorosos.length === 0 ? (
            <EmptyState titulo="Sin unidades en mora" descripcion="Todas las unidades están al día. ¡Excelente gestión!" />
          ) : (
            <ol className="divide-y rounded-xl border bg-card">
              {r.topMorosos.map((m, i) => (
                <li key={m.unidadId}>
                  <Link href={`/cartera/unidades/${m.unidadId}`} className="flex min-h-14 items-center gap-3 px-3 py-2 hover:bg-muted/50">
                    <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{m.codigo}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {m.propietario ?? "Sin propietario registrado"}
                        {m.enAcuerdo ? " · en acuerdo de pago" : ""}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold tabular-nums text-destructive">{cop(m.vencido)}</span>
                      <span className="text-xs text-muted-foreground">{m.diasMora} días</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Section>
        <Section titulo="Proyección de recaudo (30 días)">
          <dl className="space-y-2 rounded-xl border bg-card p-4 text-sm">
            <Fila k={`Cuotas por vencer (${cop(r.proyeccion.porVencer)}) × ${pct(r.proyeccion.tasaRecaudo * 100, 0)}`} v={cop(r.proyeccion.esperadoPorVencer)} />
            <Fila k="Recuperación de cartera vencida (10 %)" v={cop(r.proyeccion.recuperacionVencida)} />
            <Fila k={`Cuotas de acuerdos de pago (${r.acuerdosVigentes} vigentes)`} v={cop(r.proyeccion.acuerdos)} />
            <div className="border-t pt-2">
              <Fila k="Total estimado" v={<b>{cop(r.proyeccion.total)}</b>} />
            </div>
            <p className="text-xs text-muted-foreground">La tasa de recaudo es lo recaudado frente a lo facturado en los 3 meses anteriores.</p>
          </dl>
        </Section>
      </div>

      <Section titulo={`Cartera por unidad (${filas.length})`}>
        <ListToolbar
          placeholder={verMorosos ? "Buscar unidad o propietario…" : "Buscar unidad…"}
          exportRecurso="cartera"
          filters={[
            { name: "torre", label: "Torre", options: [...torres, { value: "casas", label: "Casas" }] },
            { name: "rango", label: "Edad", options: RANGOS_MORA.map((k) => ({ value: k, label: RANGO_LABEL[k] })) },
          ]}
        />
        <DataList
          rows={filas.slice(0, 50)}
          rowKey={(f) => f.unidadId}
          rowHref={(f) => `/cartera/unidades/${f.unidadId}`}
          empty={<EmptyState titulo="No hay saldos con estos filtros" />}
          columns={[
            { key: "u", header: "Unidad", primary: true, cell: (f) => f.codigo },
            ...(verMorosos ? [{ key: "p", header: "Propietario", cell: (f: (typeof filas)[number]) => f.propietario ?? "—" }] : []),
            { key: "t", header: "Saldo", align: "right", cell: (f) => cop(f.total) },
            { key: "v", header: "Vencido", align: "right", cell: (f) => <span className={f.vencido > 0 ? "font-medium text-destructive" : ""}>{cop(f.vencido)}</span> },
            { key: "f", header: "A favor", align: "right", hideOnMobile: true, cell: (f) => (f.saldoAFavor ? cop(f.saldoAFavor) : "—") },
            { key: "d", header: "Edad", cell: (f) => (f.rango === "AL_DIA" ? <StatusBadge value="AL_DIA" text="Al día" /> : <StatusBadge value={f.diasMora > 90 ? "VENCIDA" : "PENDIENTE"} text={RANGO_LABEL[f.rango]} />) },
            { key: "a", header: "Acuerdo", hideOnMobile: true, cell: (f) => (f.enAcuerdo ? <StatusBadge value="EN_ACUERDO" text="Vigente" /> : "—") },
          ]}
        />
        {filas.length > 50 && <p className="mt-2 text-xs text-muted-foreground">Mostrando 50 de {filas.length}. Usa los filtros o exporta a Excel.</p>}
      </Section>
    </>
  );
}

function Fila({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="shrink-0 tabular-nums">{v}</dd>
    </div>
  );
}
