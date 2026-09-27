import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileDown, FileText, Mail, Phone } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { cop, fecha, fechaHora, num, toNumber } from "@/lib/format";
import { label } from "@/lib/labels";
import { estadoCuenta } from "@/lib/cartera/estado-cuenta";
import { puedeContactar } from "@/lib/cartera/cobranza";
import { RANGO_LABEL, RANGOS_MORA } from "@/lib/cartera/calculos";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { Section } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { StatusBadge } from "@/components/app/status-badge";
import { DataList } from "@/components/app/data-list";
import { FormDialog } from "@/components/app/form-dialog";
import { ActionButton } from "@/components/form/action-form";
import { FileField, FormGrid, SelectField, TextAreaField, TextField } from "@/components/form/fields";
import { Button } from "@/components/ui/button";
import { AnularCuotaDialog, AnularPagoDialog, CrearCargoDialog, GestionDialog, RegistrarPagoDialog, type EstadoCanal } from "../../componentes";
import { crearAcuerdoAction, emitirPazYSalvoAction, enviarEstadoCuentaAction, solicitarPazYSalvoAction } from "../../actions";

export const metadata = { title: "Estado de cuenta" };

export default async function EstadoCuentaUnidadPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePage("cartera.ver_todos");
  const { id } = await params;
  const e = await estadoCuenta(ctx, id);
  const s = e.saldo;
  const cfg = conjuntoConfig(ctx);
  const [pagos, gestiones, certificados, acuerdos, conceptos, estados] = await Promise.all([
    ctx.db.pago.findMany({ where: { unidadId: id }, orderBy: { fecha: "desc" }, take: 15 }),
    ctx.db.gestionCobro.findMany({ where: { unidadId: id }, orderBy: { fecha: "desc" }, take: 10 }),
    ctx.db.certificadoPazYSalvo.findMany({ where: { unidadId: id }, orderBy: { fecha: "desc" }, take: 5 }),
    ctx.db.acuerdoPago.findMany({ where: { unidadId: id }, orderBy: { createdAt: "desc" }, take: 5 }),
    ctx.db.conceptoCobro.findMany({ where: { activo: true, tipo: { notIn: ["INTERES_MORA"] } }, orderBy: { nombre: "asc" } }),
    Promise.all((["LLAMADA", "CORREO", "VISITA", "WHATSAPP", "CARTA", "SMS"] as const).map(async (c): Promise<EstadoCanal> => ({ canal: c, ...(await puedeContactar(id, c)) }))),
  ]);
  const vencidoNeto = Math.max(0, s.vencido - s.saldoAFavor);
  const alDia = vencidoNeto <= cfg.bloqueoMora.montoMinimo;
  const verTel = can(ctx, "campos.persona_telefono");
  const cuotasSel = s.cuotas.map((c) => ({ id: c.id, descripcion: c.descripcion, saldo: c.saldo, fechaVencimiento: c.fechaVencimiento, diasMora: c.diasMora }));
  const correoBloqueado = !alDia && !estados.find((x) => x.canal === "CORREO")?.ok;

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href="/cartera" className="text-sm text-muted-foreground">
            ← Cartera
          </Link>
          <h2 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
            {e.unidad.codigo}
            {alDia ? <StatusBadge value="AL_DIA" text="Al día" /> : <StatusBadge value="MORA" text={`En mora · ${s.diasMoraMax} días`} />}
            {e.acuerdoVigente && <StatusBadge value="EN_ACUERDO" text="Acuerdo vigente" />}
          </h2>
          <p className="text-sm text-muted-foreground">
            {[e.unidad.torre, `Coeficiente ${num(e.unidad.coeficiente, 6)} %`, `Cuota ${cop(e.unidad.cuotaAdministracion)}`].filter(Boolean).join(" · ")}
          </p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {e.titulares.length === 0 && <li className="text-muted-foreground">Sin propietario registrado</li>}
            {e.titulares.map((t) => (
              <li key={t.personaId} className="flex flex-wrap items-center gap-x-3">
                <span className="font-medium">{t.nombre}</span>
                {t.email && (
                  <a href={`mailto:${t.email}`} className="inline-flex items-center gap-1 text-muted-foreground">
                    <Mail className="size-3.5" /> {t.email}
                  </a>
                )}
                {verTel && t.telefono && (
                  <a href={`tel:${t.telefono}`} className="inline-flex items-center gap-1 text-muted-foreground">
                    <Phone className="size-3.5" /> {t.telefono}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total a pagar" value={cop(Math.max(0, s.neto))} tone="primary" />
        <StatCard label="Vencido" value={cop(s.vencido)} tone={s.vencido > 0 ? "danger" : "success"} hint={s.diasMoraMax ? `${s.diasMoraMax} días de mora` : "Sin mora"} />
        <StatCard label="Por vencer" value={cop(s.porVencer)} />
        <StatCard label="Saldo a favor" value={cop(s.saldoAFavor)} tone={s.saldoAFavor > 0 ? "success" : "default"} />
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        {can(ctx, "pagos.registrar") && <RegistrarPagoDialog unidadId={id} cuotas={cuotasSel} sugerido={Math.max(0, s.neto)} />}
        <Button variant="outline" render={<a href={`/api/cartera/estado-cuenta/${id}`} target="_blank" rel="noopener" />}>
          <FileDown /> Estado de cuenta PDF
        </Button>
        {can(ctx, "cartera.gestionar_cobro") && (
          <FormDialog
            titulo="Enviar estado de cuenta por correo"
            descripcion={`Se enviará el PDF a: ${e.titulares.map((t) => t.email).filter(Boolean).join(", ") || "sin correos registrados"}.${!alDia ? " La unidad está en mora: cuenta como gestión de cobro por correo (Ley 2300)." : ""}`}
            action={enviarEstadoCuentaAction}
            extra={{ unidadId: id }}
            triggerLabel="Enviar por correo"
            triggerVariant="outline"
            submitLabel="Enviar"
            successMessage="Estado de cuenta enviado"
          >
            {correoBloqueado && <p className="rounded-lg bg-warning/10 p-3 text-sm">{estados.find((x) => x.canal === "CORREO")?.motivo}</p>}
            <TextAreaField name="mensaje" label="Mensaje adicional (opcional)" />
          </FormDialog>
        )}
        {can(ctx, "cartera.gestionar_cobro") && <GestionDialog unidadId={id} estados={estados} />}
        {can(ctx, "cartera.acuerdos") && vencidoNeto > 0 && !e.acuerdoVigente && (
          <FormDialog
            titulo="Acuerdo de pago"
            descripcion={`Se trasladará el saldo vencido (${cop(s.vencido)}) a cuotas mensuales del acuerdo. Las cuotas originales quedan "en acuerdo de pago".`}
            action={crearAcuerdoAction}
            extra={{ unidadId: id }}
            triggerLabel="Acuerdo de pago"
            triggerVariant="outline"
            submitLabel="Crear acuerdo"
            successMessage="Acuerdo creado"
            confirm="¿Crear el acuerdo de pago? Las cuotas vencidas se trasladarán al plan."
          >
            <FormGrid>
              <SelectField name="numeroCuotas" label="Número de cuotas" options={[2, 3, 4, 6, 8, 10, 12, 18, 24].map((n) => ({ value: String(n), label: `${n} cuotas de ${cop(Math.ceil(s.vencido / n))}` }))} defaultValue="6" placeholder={false} required />
              <TextField name="diaPago" label="Día de pago de cada mes" type="number" min={1} max={28} defaultValue={cfg.cartera.diaVencimiento} required />
            </FormGrid>
            <FileField name="documentoUrl" label="Documento firmado (opcional)" accept="image/*,application/pdf" folder="acuerdos" />
            <TextAreaField name="observaciones" label="Observaciones" />
          </FormDialog>
        )}
        {can(ctx, "paz_y_salvo.emitir") &&
          (alDia ? (
            <ActionButton variant="outline" action={solicitarPazYSalvoAction} input={{ unidadId: id }} successMessage="Paz y salvo emitido">
              <CheckCircle2 /> Emitir paz y salvo
            </ActionButton>
          ) : (
            <FormDialog
              titulo="Paz y salvo manual"
              descripcion="La unidad tiene saldo vencido. Solo emite el certificado si hay una justificación (p. ej. acuerdo de pago al día, pago en tránsito). Quedará auditado."
              action={emitirPazYSalvoAction}
              extra={{ unidadId: id }}
              triggerLabel="Paz y salvo manual"
              triggerVariant="outline"
              submitLabel="Emitir"
              successMessage="Paz y salvo emitido"
              confirm="¿Emitir paz y salvo con saldo vencido?"
            >
              <TextAreaField name="observaciones" label="Observaciones (obligatorio)" required />
              <TextField name="personaNombre" label="A nombre de" defaultValue={e.titulares[0]?.nombre} />
            </FormDialog>
          ))}
        {can(ctx, "cartera.crear") && <CrearCargoDialog unidadId={id} conceptos={conceptos.map((c) => ({ value: c.id, label: c.nombre }))} />}
        {can(ctx, "cartera.gestionar_cobro") && vencidoNeto > 0 && (
          <Button variant="ghost" render={<a href={`/api/cartera/carta/${id}`} target="_blank" rel="noopener" />}>
            <FileText /> Carta de cobro
          </Button>
        )}
      </div>

      {e.referenciaPago && (
        <p className="mb-4 text-sm text-muted-foreground">
          Referencia de pago para consignaciones y convenio bancario: <b className="font-mono text-foreground">{e.referenciaPago}</b>
        </p>
      )}

      <Section titulo="Edad de la mora">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {RANGOS_MORA.map((r) => (
            <div key={r} className={`rounded-lg border p-2 ${s.aging[r] > 0 && r !== "AL_DIA" ? "border-destructive/30 bg-destructive/5" : ""}`}>
              <p className="text-[11px] text-muted-foreground">{RANGO_LABEL[r]}</p>
              <p className="text-sm font-semibold tabular-nums">{cop(s.aging[r])}</p>
            </div>
          ))}
        </div>
        {s.porConcepto.length > 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            Por concepto:{" "}
            {s.porConcepto.map((p, i) => (
              <span key={p.tipo}>
                {i > 0 && " · "}
                {p.nombre} <b className="text-foreground">{cop(p.saldo)}</b>
              </span>
            ))}
          </p>
        )}
      </Section>

      <Section titulo={`Cuotas pendientes (${s.cuotas.length})`}>
        <DataList
          rows={s.cuotas}
          rowKey={(c) => c.id}
          empty={<p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No hay cuotas pendientes.</p>}
          columns={[
            { key: "d", header: "Concepto", primary: true, cell: (c) => c.descripcion },
            { key: "v", header: "Vence", cell: (c) => fecha(c.fechaVencimiento) },
            { key: "m", header: "Mora", cell: (c) => (c.diasMora > 0 ? <span className="text-destructive">{c.diasMora} días</span> : "—") },
            { key: "r", header: "Referencia", hideOnMobile: true, cell: (c) => <span className="font-mono text-xs">{c.referenciaPago}</span> },
            { key: "e", header: "Estado", cell: (c) => <StatusBadge value={c.estado} /> },
            { key: "s", header: "Saldo", align: "right", cell: (c) => <b>{cop(c.saldo)}</b> },
            ...(can(ctx, "cartera.anular") ? [{ key: "x", header: "", cell: (c: (typeof s.cuotas)[number]) => (c.saldo === c.valorTotal ? <AnularCuotaDialog id={c.id} descripcion={c.descripcion} /> : null) }] : []),
          ]}
        />
      </Section>

      <Section titulo="Movimientos (últimos 6 meses)">
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Fecha</th>
                <th className="px-3 py-2 font-medium">Descripción</th>
                <th className="px-3 py-2 text-right font-medium">Débito</th>
                <th className="px-3 py-2 text-right font-medium">Crédito</th>
                <th className="px-3 py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t text-muted-foreground">
                <td className="px-3 py-2">{fecha(e.desde)}</td>
                <td className="px-3 py-2">Saldo anterior</td>
                <td />
                <td />
                <td className="px-3 py-2 text-right tabular-nums">{cop(e.saldoInicial)}</td>
              </tr>
              {[...e.movimientos].reverse().map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="whitespace-nowrap px-3 py-2">{fecha(m.fecha)}</td>
                  <td className="px-3 py-2">{m.descripcion}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.debito ? cop(m.debito) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-success">{m.credito ? cop(m.credito) : ""}</td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">{cop(m.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section titulo="Pagos">
          <ul className="divide-y rounded-xl border bg-card">
            {pagos.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sin pagos registrados.</li>}
            {pagos.map((p) => (
              <li key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {cop(p.valor)} <span className="font-normal text-muted-foreground">· {label(p.medio)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fechaHora(p.fecha)} {p.numeroRecibo ? `· Recibo N.º ${p.numeroRecibo}` : ""} {p.conciliado ? "· conciliado" : ""}
                  </p>
                </div>
                {p.estado !== "APROBADO" && <StatusBadge value={p.estado} />}
                {p.numeroRecibo && (
                  <Button size="sm" variant="ghost" render={<a href={`/api/cartera/recibo/${p.id}`} target="_blank" rel="noopener" />}>
                    Recibo
                  </Button>
                )}
                {p.estado === "APROBADO" && can(ctx, "pagos.anular") && <AnularPagoDialog id={p.id} numeroRecibo={p.numeroRecibo} valor={toNumber(p.valor)} />}
              </li>
            ))}
          </ul>
        </Section>

        <Section titulo="Gestiones de cobro" acciones={<Link href={`/cartera/gestiones?unidad=${id}`} className="text-sm text-primary">Ver todas</Link>}>
          <ul className="divide-y rounded-xl border bg-card">
            {gestiones.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sin gestiones registradas.</li>}
            {gestiones.map((g) => (
              <li key={g.id} className="px-3 py-2 text-sm">
                <p>
                  <b>{label(g.canal)}</b> · {fechaHora(g.fecha)}
                </p>
                {(g.resultado || g.notas) && <p className="text-muted-foreground">{[g.resultado, g.notas].filter(Boolean).join(" — ")}</p>}
              </li>
            ))}
          </ul>
        </Section>

        <Section titulo="Acuerdos de pago">
          <ul className="divide-y rounded-xl border bg-card">
            {acuerdos.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sin acuerdos.</li>}
            {acuerdos.map((a) => (
              <li key={a.id}>
                <Link href={`/cartera/acuerdos/${a.id}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/50">
                  <span>
                    {cop(a.saldoInicial)} en {a.numeroCuotas} cuotas
                    <span className="block text-xs text-muted-foreground">Desde {fecha(a.fechaInicio)}</span>
                  </span>
                  <StatusBadge value={a.estado} />
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section titulo="Paz y salvos">
          <ul className="divide-y rounded-xl border bg-card">
            {certificados.length === 0 && <li className="p-4 text-sm text-muted-foreground">Sin certificados emitidos.</li>}
            {certificados.map((c) => (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-mono">{c.codigo}</span>
                  <span className="block text-xs text-muted-foreground">
                    {fecha(c.fecha)} · vence {fecha(c.vigenteHasta)} {c.automatico ? "· automático" : "· manual"}
                  </span>
                </span>
                <StatusBadge value={c.estado === "VIGENTE" && c.vigenteHasta < new Date() ? "VENCIDO" : c.estado} />
                <Button size="sm" variant="ghost" render={<a href={`/api/cartera/paz-y-salvo/${c.id}`} target="_blank" rel="noopener" />}>
                  PDF
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      {!alDia && (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="size-4" /> Los intereses de mora se liquidan cada día a la tasa legal vigente, solo sobre el capital (sin intereses sobre intereses).
        </p>
      )}
    </>
  );
}
