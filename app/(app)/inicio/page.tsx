import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  CalendarCheck,
  ChevronRight,
  FileCheck2,
  LifeBuoy,
  Megaphone,
  Package,
  UserCheck,
  Vote,
  Wallet,
  Wrench,
  ShieldAlert,
  Hammer,
} from "lucide-react";
import { requireCtx, type Ctx } from "@/lib/auth/context";
import { can, isResidencial } from "@/lib/permisos";
import { cop, fecha, fechaHora, hora, pct, tiempoRelativo } from "@/lib/format";
import { label } from "@/lib/labels";
import { StatCard } from "@/components/app/stat-card";
import { Section } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import * as carteraInicio from "@/lib/cartera/inicio";
import { resumenPagoResidente } from "@/lib/pagos/inicio";
import * as porteriaInicio from "@/lib/porteria/inicio";
import * as reservasInicio from "@/lib/reservas/inicio";
import * as residentesInicio from "@/lib/residentes/inicio";
import { resumenModeracion, ultimasPublicaciones } from "@/lib/muro/inicio";
import { resumenMantenimientoAdmin, resumenMantenimientoTecnico } from "@/lib/mantenimiento/inicio";
import { resumenConvivenciaGestion, resumenConvivenciaResidente } from "@/lib/convivencia/inicio";
import * as gobiernoInicio from "@/lib/asambleas/inicio";
import { resumenTicketsAdmin, resumenTicketsMantenimiento, resumenTicketsResidente } from "@/lib/tickets/inicio";
import { resumenObrasGestion, resumenObrasResidente } from "@/lib/obras/inicio";
import { resumenObjetosGestion } from "@/lib/objetos-perdidos/service";

export const metadata = { title: "Inicio" };

/** Un widget que falla no debe tumbar el inicio. */
async function safe<T>(p: () => Promise<T>): Promise<T | null> {
  try {
    return await p();
  } catch (e) {
    console.error("[inicio] widget falló:", (e as Error).message);
    return null;
  }
}

export default async function InicioPage({ searchParams }: { searchParams: Promise<{ pendiente?: string }> }) {
  const ctx = await requireCtx();
  const sp = await searchParams;
  if (ctx.rolBase === "PORTERIA") redirect("/porteria");
  const saludo = `Hola, ${ctx.nombre.split(" ")[0]}`;
  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight">{saludo}</h1>
        <p className="text-sm text-muted-foreground">
          {ctx.conjunto.nombre} · {ctx.rolNombre}
        </p>
      </div>
      {sp.pendiente && (
        <p className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">Tu vínculo con la unidad está pendiente de aprobación por la administración. Te avisaremos cuando quede activo.</p>
      )}
      {isResidencial(ctx) ? (
        <InicioResidente ctx={ctx} />
      ) : ctx.rolBase === "MANTENIMIENTO" || ctx.rolBase === "PROVEEDOR" ? (
        <InicioTecnico ctx={ctx} />
      ) : ctx.rolBase === "CONSEJO" ? (
        <InicioConsejo ctx={ctx} />
      ) : (
        <InicioAdmin ctx={ctx} />
      )}
    </>
  );
}

function Acceso({ href, icon: Icon, texto }: { href: string; icon: React.ComponentType<{ className?: string }>; texto: string }) {
  return (
    <Link href={href} className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border bg-card p-2 text-center text-xs font-medium hover:bg-muted">
      <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      {texto}
    </Link>
  );
}

function Lista({ items, vacio }: { items: { key: string; titulo: React.ReactNode; detalle?: React.ReactNode; href?: string; derecha?: React.ReactNode }[]; vacio: string }) {
  if (!items.length) return <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{vacio}</p>;
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {items.map((i) => {
        const body = (
          <div className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{i.titulo}</p>
              {i.detalle && <p className="truncate text-xs text-muted-foreground">{i.detalle}</p>}
            </div>
            {i.derecha}
            {i.href && <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
          </div>
        );
        return <li key={i.key}>{i.href ? <Link href={i.href} className="block hover:bg-muted/50">{body}</Link> : body}</li>;
      })}
    </ul>
  );
}

// ───────────────────────── RESIDENTE / PROPIETARIO ─────────────────────────
async function InicioResidente({ ctx }: { ctx: Ctx }) {
  const verCuenta = can(ctx, "cartera.ver");
  const [pago, porteria, reservas, tickets, muro, gobierno, hogar, convivencia, obras] = await Promise.all([
    verCuenta ? safe(() => resumenPagoResidente(ctx)) : null,
    can(ctx, ["visitantes.autorizar", "paqueteria.ver"]) ? safe(() => porteriaInicio.resumenResidente(ctx)) : null,
    can(ctx, "reservas.ver") ? safe(() => reservasInicio.resumenResidente(ctx)) : null,
    can(ctx, "tickets.ver") ? safe(() => resumenTicketsResidente(ctx)) : null,
    can(ctx, "comunicaciones.ver") ? safe(() => ultimasPublicaciones(ctx, 3)) : null,
    can(ctx, ["votaciones.ver", "encuestas.ver", "asambleas.ver"]) ? safe(() => gobiernoInicio.resumenResidente(ctx)) : null,
    can(ctx, "residentes.ver") ? safe(() => residentesInicio.resumenResidente(ctx)) : null,
    can(ctx, "convivencia.ver") ? safe(() => resumenConvivenciaResidente(ctx)) : null,
    can(ctx, "obras.ver") ? safe(() => resumenObrasResidente(ctx)) : null,
  ]);
  const unidades = pago?.unidades ?? [];
  const totalSaldo = unidades.reduce((a, u) => a + u.saldo, 0);
  const vencido = unidades.reduce((a, u) => a + u.vencido, 0);
  const principal = unidades.find((u) => u.puedePagar && u.saldo > 0) ?? unidades[0];
  const proximo = unidades.map((u) => u.proximoVencimiento).find(Boolean);
  return (
    <div className="space-y-6">
      {verCuenta && unidades.length > 0 && (
        <section className={`rounded-2xl p-5 text-primary-foreground shadow-sm ${vencido > 0 ? "bg-red-700" : "bg-primary"}`}>
          <p className="text-sm opacity-90">{vencido > 0 ? "Tienes saldo vencido" : totalSaldo > 0 ? "Saldo por pagar" : "Estás al día 🎉"}</p>
          <p className="mt-1 text-4xl font-bold tracking-tight">{cop(totalSaldo)}</p>
          {proximo && (
            <p className="mt-1 text-sm opacity-90">
              Próximo vencimiento {fecha(proximo.fecha)}
              {proximo.descuento > 0 && proximo.fechaProntoPago && ` · paga ${cop(proximo.valorConDescuento)} hasta el ${fecha(proximo.fechaProntoPago)}`}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            {principal && totalSaldo > 0 && principal.puedePagar && (
              <Button size="lg" className="flex-1 bg-white text-black hover:bg-white/90" render={<Link href={principal.pagarHref} />}>
                <Wallet /> Pagar
              </Button>
            )}
            <Button size="lg" variant="outline" className="flex-1 border-white/40 bg-transparent text-white hover:bg-white/10" render={<Link href="/cuenta" />}>
              Ver mi cuenta
            </Button>
          </div>
        </section>
      )}

      <section className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {can(ctx, "visitantes.autorizar") && <Acceso href="/visitantes/nuevo" icon={UserCheck} texto="Autorizar visitante" />}
        {can(ctx, "tickets.crear") && <Acceso href="/tickets/nuevo" icon={Wrench} texto="Reportar daño" />}
        {can(ctx, "reservas.crear") && <Acceso href="/reservas" icon={CalendarCheck} texto="Reservar" />}
        {can(ctx, "tickets.crear") && <Acceso href="/tickets/nuevo?tipo=PETICION" icon={LifeBuoy} texto="PQRS" />}
        {can(ctx, "paz_y_salvo.solicitar") && <Acceso href="/cuenta#paz-y-salvo" icon={FileCheck2} texto="Paz y salvo" />}
        {can(ctx, "comunicaciones.ver") && <Acceso href="/muro" icon={Megaphone} texto="Muro" />}
      </section>

      {hogar && (hogar.politicaPendiente || hogar.pasosPendientes > 0 || hogar.soatPorVencer.length > 0 || hogar.vacunasPorVencer.length > 0) && (
        <section className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          <p className="mb-1 flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 text-warning" /> Pendientes de tu hogar
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
            {hogar.politicaPendiente && <li>Acepta la política de tratamiento de datos actualizada.</li>}
            {hogar.pasosPendientes > 0 && <li>Completa tu ficha del hogar ({hogar.porcentajePanel} % lista).</li>}
            {hogar.soatPorVencer.map((s) => (
              <li key={s.placa}>SOAT de {s.placa} vence el {fecha(s.vence)}.</li>
            ))}
            {hogar.vacunasPorVencer.map((v) => (
              <li key={v.nombre}>Vacuna antirrábica de {v.nombre} vence el {fecha(v.vence)}.</li>
            ))}
          </ul>
          <Link href="/mi-hogar" className="mt-2 inline-block font-medium text-primary">
            Ir a Mi hogar →
          </Link>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {porteria && (
          <Section titulo="Portería" acciones={<Link className="text-sm text-primary" href="/paquetes">Ver todo</Link>}>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <StatCard label="Paquetes en portería" value={porteria.paquetesEnPorteria} href="/paquetes" tone={porteria.paquetesEnPorteria > 0 ? "warning" : "default"} icon={Package} />
              <StatCard label="Visitantes hoy" value={porteria.visitantesHoy.length} hint={`${porteria.autorizacionesActivas} autorizaciones activas`} href="/visitantes" icon={UserCheck} />
            </div>
            <Lista
              vacio="Sin visitantes hoy."
              items={porteria.visitantesHoy.slice(0, 4).map((v) => ({ key: v.id, titulo: v.nombre, detalle: `Ingresó a las ${hora(v.hora)} · ${v.unidad}` }))}
            />
          </Section>
        )}
        {reservas && (
          <Section titulo="Próximas reservas" acciones={<Link className="text-sm text-primary" href="/reservas/mis">Mis reservas</Link>}>
            <Lista
              vacio="No tienes reservas próximas."
              items={reservas.proximas.map((r) => ({
                key: r.id,
                titulo: r.zona,
                detalle: `${fechaHora(r.inicio)} – ${hora(r.fin)}`,
                href: r.enlacePago ?? r.enlace,
                derecha: r.enlacePago ? <StatusBadge value="PENDIENTE" text="Pagar" /> : <StatusBadge value={r.estado} />,
              }))}
            />
          </Section>
        )}
        {gobierno && (gobierno.votacionesPendientes.length > 0 || gobierno.encuestasPendientes.length > 0 || gobierno.proximaAsamblea) && (
          <Section titulo="Tu voz cuenta">
            <Lista
              vacio=""
              items={[
                ...gobierno.votacionesPendientes.map((v) => ({ key: v.id, titulo: <span className="flex items-center gap-1.5"><Vote className="size-4 text-primary" /> {v.titulo}</span>, detalle: `Votación · cierra ${fechaHora(v.cierra)}`, href: v.href })),
                ...gobierno.encuestasPendientes.map((e) => ({ key: e.id, titulo: e.titulo, detalle: `Encuesta · cierra ${fecha(e.cierra)}`, href: e.href })),
                ...(gobierno.proximaAsamblea ? [{ key: "asamblea", titulo: gobierno.proximaAsamblea.titulo, detalle: `Asamblea ${label(gobierno.proximaAsamblea.tipo).toLowerCase()} · ${fechaHora(gobierno.proximaAsamblea.fecha)}`, href: gobierno.proximaAsamblea.href }] : []),
              ]}
            />
          </Section>
        )}
        {tickets && (
          <Section titulo="Mis PQRS" acciones={<Link className="text-sm text-primary" href={tickets.href}>Ver todas</Link>}>
            <Lista
              vacio="No tienes solicitudes abiertas."
              items={tickets.items.slice(0, 4).map((t) => ({ key: t.id, titulo: `${t.radicado} · ${t.titulo}`, detalle: label(t.estado), href: t.href }))}
            />
            {tickets.porCalificar > 0 && <p className="mt-2 text-sm text-muted-foreground">Tienes {tickets.porCalificar} solicitud(es) resuelta(s) por calificar.</p>}
          </Section>
        )}
        {convivencia && (convivencia.llamadosSinLeer > 0 || convivencia.multasEnDescargos.length > 0 || convivencia.multasPorPagar.length > 0) && (
          <Section titulo="Convivencia">
            <Lista
              vacio=""
              items={[
                ...(convivencia.llamadosSinLeer ? [{ key: "ll", titulo: `${convivencia.llamadosSinLeer} llamado(s) de atención sin leer`, href: convivencia.href }] : []),
                ...convivencia.multasEnDescargos.map((m) => ({ key: m.id, titulo: `Multa de ${cop(m.valor)} en descargos`, detalle: m.plazoDescargos ? `Plazo ${fecha(m.plazoDescargos)}` : undefined, href: m.href })),
                ...convivencia.multasPorPagar.map((m) => ({ key: `p${m.id}`, titulo: `Multa por pagar ${cop(m.valor)}`, href: m.href })),
              ]}
            />
          </Section>
        )}
        {obras && (obras.obrasActivas > 0 || obras.mudanzasProximas.length > 0) && (
          <Section titulo="Obras y mudanzas">
            <Lista
              vacio=""
              items={[
                ...(obras.obrasActivas ? [{ key: "ob", titulo: <span className="flex items-center gap-1.5"><Hammer className="size-4" /> {obras.obrasActivas} obra(s) activa(s)</span>, href: obras.href }] : []),
                ...obras.mudanzasProximas.map((m) => ({ key: m.id, titulo: `Mudanza de ${m.tipo === "INGRESO" ? "ingreso" : "salida"}`, detalle: `${fecha(m.fecha)} · ${label(m.estado)}`, href: m.href })),
              ]}
            />
          </Section>
        )}
      </div>

      {muro && (
        <Section titulo={`Muro${muro.sinLeer ? ` · ${muro.sinLeer} sin leer` : ""}`} acciones={<Link className="text-sm text-primary" href="/muro">Ver muro</Link>}>
          <Lista
            vacio="Aún no hay publicaciones."
            items={muro.publicaciones.map((p) => ({
              key: p.id,
              titulo: `${p.fijada ? "📌 " : ""}${p.titulo}`,
              detalle: `${label(p.categoria)} · ${tiempoRelativo(p.createdAt)}`,
              href: `/muro/${p.id}`,
              derecha: !p.leida ? <span className="size-2 rounded-full bg-primary" aria-label="Sin leer" /> : undefined,
            }))}
          />
        </Section>
      )}
    </div>
  );
}

// ───────────────────────── ADMINISTRACIÓN ─────────────────────────
async function InicioAdmin({ ctx }: { ctx: Ctx }) {
  const [cartera, tickets, reservas, porteria, mant, gobierno, residentes, muro, conv, obras, objetos] = await Promise.all([
    can(ctx, "cartera.ver_todos") ? safe(() => carteraInicio.resumenAdmin(ctx)) : null,
    can(ctx, "tickets.ver_todos") ? safe(() => resumenTicketsAdmin(ctx)) : null,
    can(ctx, "reservas.ver_todos") ? safe(() => reservasInicio.resumenAdmin(ctx)) : null,
    can(ctx, "porteria.bitacora") || can(ctx, "paqueteria.ver_todos") ? safe(() => porteriaInicio.resumenAdmin(ctx)) : null,
    can(ctx, "mantenimiento.ver") ? safe(() => resumenMantenimientoAdmin(ctx)) : null,
    can(ctx, "asambleas.ver") ? safe(() => gobiernoInicio.resumenAdmin(ctx)) : null,
    can(ctx, "residentes.ver_todos") ? safe(() => residentesInicio.resumenAdmin(ctx)) : null,
    can(ctx, "comunicaciones.moderar") ? safe(() => resumenModeracion(ctx)) : null,
    can(ctx, "convivencia.ver_todos") ? safe(() => resumenConvivenciaGestion(ctx)) : null,
    can(ctx, "obras.ver_todos") ? safe(() => resumenObrasGestion(ctx)) : null,
    can(ctx, "objetos.gestionar") ? safe(() => resumenObjetosGestion(ctx)) : null,
  ]);
  const alertas: { key: string; texto: string; href: string }[] = [];
  if (residentes?.pendientesAprobacion) alertas.push({ key: "vin", texto: `${residentes.pendientesAprobacion} vínculo(s) de arrendatarios por aprobar`, href: "/residentes?estado=PENDIENTE_APROBACION" });
  if (residentes?.soatVencidosOPorVencer) alertas.push({ key: "soat", texto: `${residentes.soatVencidosOPorVencer} SOAT vencidos o por vencer`, href: "/residentes?tab=vehiculos" });
  if (residentes?.vacunasVencidasOPorVencer) alertas.push({ key: "vac", texto: `${residentes.vacunasVencidasOPorVencer} vacunas de mascotas vencidas o por vencer`, href: "/residentes?tab=mascotas" });
  if (residentes?.mascotasPeligrosasSinPoliza) alertas.push({ key: "pp", texto: `${residentes.mascotasPeligrosasSinPoliza} mascota(s) potencialmente peligrosa(s) sin póliza`, href: "/residentes?tab=mascotas" });
  for (const v of mant?.vencimientos.slice(0, 5) ?? []) alertas.push({ key: `v${v.titulo}${v.fecha}`, texto: `${v.tipo}: ${v.titulo} — ${v.dias < 0 ? `vencido hace ${-v.dias} d` : `vence en ${v.dias} d`}`, href: v.enlace });
  if (reservas?.pendientesAprobacion) alertas.push({ key: "res", texto: `${reservas.pendientesAprobacion} reserva(s) por aprobar`, href: "/reservas/admin" });
  if (muro?.pendientesModeracion) alertas.push({ key: "mod", texto: `${muro.pendientesModeracion} publicación(es) por moderar`, href: "/clasificados/moderacion" });
  if (conv?.multasPorDecidir) alertas.push({ key: "mul", texto: `${conv.multasPorDecidir} multa(s) por decidir`, href: conv.href });
  if (obras?.obrasPorAprobar || obras?.mudanzasPorAprobar) alertas.push({ key: "obr", texto: `${obras.obrasPorAprobar} obra(s) y ${obras.mudanzasPorAprobar} mudanza(s) por aprobar`, href: obras.href });
  if (gobierno?.poderesPendientes) alertas.push({ key: "pod", texto: `${gobierno.poderesPendientes} poder(es) por revisar`, href: "/asambleas" });
  if (objetos?.reclamosPendientes) alertas.push({ key: "obj", texto: `${objetos.reclamosPendientes} reclamo(s) de objetos perdidos por verificar`, href: "/objetos-perdidos?vista=atender" });
  if (objetos?.vencidos) alertas.push({ key: "objv", texto: `${objetos.vencidos} objeto(s) en custodia superaron el plazo: donar o cerrar`, href: "/objetos-perdidos?vista=atender" });
  if (mant?.gastosPendientes) alertas.push({ key: "gas", texto: `${mant.gastosPendientes} gasto(s) por aprobar`, href: "/presupuesto" });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartera && (
          <>
            <StatCard label={`Recaudo del mes (${pct(cartera.pctRecaudo, 0)})`} value={cop(cartera.recaudoMes)} hint={`Esperado ${cop(cartera.esperadoMes)}`} href="/cartera" tone="primary" />
            <StatCard label="Unidades en mora" value={pct(cartera.pctUnidadesMora)} hint={`${cartera.unidadesEnMora} unidades · ${cop(cartera.carteraVencida)}`} href="/cartera" tone={cartera.pctUnidadesMora > 15 ? "danger" : "warning"} />
          </>
        )}
        {tickets && <StatCard label="PQRS abiertas" value={tickets.abiertos} hint={`${tickets.vencidos} con SLA vencido · ${tickets.sinAsignar} sin asignar`} href="/tickets" tone={tickets.vencidos ? "danger" : "default"} />}
        {porteria && <StatCard label="Paquetes sin reclamar" value={porteria.paquetesVencidos} hint={`más de ${porteria.maxDiasPaquete} días`} href="/porteria/paquetes" tone={porteria.paquetesVencidos ? "warning" : "default"} />}
        {mant && <StatCard label="Mantenimientos vencidos" value={mant.planesVencidos + mant.ordenesAtrasadas} hint={`${mant.ordenesAbiertas} órdenes abiertas`} href="/mantenimiento" tone={mant.planesVencidos + mant.ordenesAtrasadas ? "warning" : "default"} />}
        {porteria && <StatCard label="Novedades de portería hoy" value={porteria.novedadesHoy} hint={`${porteria.ingresosHoy} ingresos · ${porteria.adentro} adentro`} href="/porteria/bitacora" />}
        {reservas && <StatCard label="Ingresos por alquiler del mes" value={cop(reservas.ingresosMes.total)} hint={`${reservas.ingresosMes.reservas} reservas · IVA ${cop(reservas.ingresosMes.iva)}`} href="/facturacion" />}
      </div>

      {alertas.length > 0 && (
        <Section titulo="Alertas y pendientes">
          <ul className="divide-y rounded-xl border border-warning/40 bg-card">
            {alertas.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="flex items-center gap-3 p-3 text-sm hover:bg-muted/50">
                  <AlertTriangle className="size-4 shrink-0 text-warning" />
                  <span className="flex-1">{a.texto}</span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {cartera && cartera.topMorosos.length > 0 && (
          <Section titulo="Top morosos" acciones={<Link className="text-sm text-primary" href="/cartera">Cartera</Link>}>
            <Lista vacio="" items={cartera.topMorosos.slice(0, 6).map((m) => ({ key: m.unidadId, titulo: m.codigo, detalle: `${m.diasMora} días de mora`, href: `/cartera/unidades/${m.unidadId}`, derecha: <span className="text-sm font-semibold tabular-nums text-destructive">{cop(m.vencido)}</span> }))} />
          </Section>
        )}
        {tickets && (
          <Section titulo="PQRS con SLA vencido" acciones={<Link className="text-sm text-primary" href="/tickets">Mesa de ayuda</Link>}>
            <Lista vacio="Ninguna PQRS vencida. 👏" items={tickets.vencidosItems.slice(0, 6).map((t) => ({ key: t.id, titulo: `${t.radicado} · ${t.titulo}`, detalle: label(t.estado), href: t.href }))} />
          </Section>
        )}
        {reservas && (
          <Section titulo="Reservas de hoy" acciones={<Link className="text-sm text-primary" href="/reservas/admin">Ver todas</Link>}>
            <Lista vacio="No hay reservas hoy." items={reservas.hoy.map((r) => ({ key: r.id, titulo: `${r.zona} · ${r.unidad}`, detalle: `${hora(r.inicio)} – ${hora(r.fin)}`, href: r.enlace, derecha: <StatusBadge value={r.estado} /> }))} />
          </Section>
        )}
        {porteria && porteria.novedadesAltas.length > 0 && (
          <Section titulo="Novedades importantes de portería">
            <Lista vacio="" items={porteria.novedadesAltas.map((n) => ({ key: n.id, titulo: <span className="flex items-center gap-1.5"><ShieldAlert className="size-4 text-destructive" />{label(n.tipo)}</span>, detalle: `${n.descripcion} · ${tiempoRelativo(n.createdAt)}`, href: "/porteria/bitacora" }))} />
          </Section>
        )}
        {gobierno && (gobierno.asambleasActivas.length > 0 || gobierno.votacionesActivas.length > 0) && (
          <Section titulo="Asambleas y votaciones activas">
            <Lista
              vacio=""
              items={[
                ...gobierno.asambleasActivas.map((a) => ({ key: a.id, titulo: a.titulo, detalle: `${label(a.estado)} · ${fechaHora(a.fecha)}`, href: a.href })),
                ...gobierno.votacionesActivas.map((v) => ({ key: v.id, titulo: v.pregunta, detalle: `${v.votos} votos · cierra ${fechaHora(v.cierra)}`, href: v.href })),
              ]}
            />
          </Section>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── CONSEJO ─────────────────────────
async function InicioConsejo({ ctx }: { ctx: Ctx }) {
  const [cartera, tickets, conv, reservas, mant, gobierno] = await Promise.all([
    safe(() => carteraInicio.resumenAdmin(ctx)),
    safe(() => resumenTicketsAdmin(ctx)),
    safe(() => resumenConvivenciaGestion(ctx)),
    safe(() => reservasInicio.resumenAdmin(ctx)),
    safe(() => resumenMantenimientoAdmin(ctx)),
    safe(() => gobiernoInicio.resumenAdmin(ctx)),
  ]);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartera && <StatCard label="Recaudo del mes" value={pct(cartera.pctRecaudo, 0)} hint={cop(cartera.recaudoMes)} href="/cartera" tone="primary" />}
        {cartera && <StatCard label="Cartera vencida" value={cop(cartera.carteraVencida)} hint={`${pct(cartera.pctUnidadesMora)} de unidades en mora`} href="/cartera" tone="warning" />}
        {tickets && <StatCard label="PQRS críticas" value={tickets.urgentes + tickets.vencidos} hint={`${tickets.urgentes} urgentes · ${tickets.vencidos} vencidas`} href="/tickets" tone={tickets.urgentes + tickets.vencidos ? "danger" : "default"} />}
        {gobierno && <StatCard label="Votaciones activas" value={gobierno.votacionesActivas.length} href="/votaciones" />}
      </div>
      <Section titulo="Aprobaciones pendientes" acciones={<Link className="text-sm text-primary" href="/consejo">Consejo</Link>}>
        <Lista
          vacio="No hay aprobaciones pendientes."
          items={[
            ...(conv?.multasPorDecidir ? [{ key: "m", titulo: `${conv.multasPorDecidir} multa(s) por decidir`, href: conv.href }] : []),
            ...(reservas?.pendientesAprobacion ? [{ key: "r", titulo: `${reservas.pendientesAprobacion} reserva(s) por aprobar`, href: "/reservas/admin" }] : []),
            ...(mant?.gastosPendientes ? [{ key: "g", titulo: `${mant.gastosPendientes} gasto(s) por aprobar`, href: "/presupuesto" }] : []),
          ]}
        />
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        {tickets && (
          <Section titulo="PQRS vencidas">
            <Lista vacio="Ninguna vencida." items={tickets.vencidosItems.slice(0, 5).map((t) => ({ key: t.id, titulo: `${t.radicado} · ${t.titulo}`, detalle: label(t.estado), href: t.href }))} />
          </Section>
        )}
        {gobierno && (
          <Section titulo="Votaciones y asambleas">
            <Lista
              vacio="Sin actividad."
              items={[
                ...gobierno.votacionesActivas.map((v) => ({ key: v.id, titulo: v.pregunta, detalle: `${v.votos} votos · cierra ${fechaHora(v.cierra)}`, href: v.href })),
                ...(gobierno.proximaAsamblea ? [{ key: "a", titulo: gobierno.proximaAsamblea.titulo, detalle: fechaHora(gobierno.proximaAsamblea.fecha), href: gobierno.proximaAsamblea.href }] : []),
              ]}
            />
          </Section>
        )}
      </div>
    </div>
  );
}

// ───────────────────────── MANTENIMIENTO / PROVEEDOR ─────────────────────────
async function InicioTecnico({ ctx }: { ctx: Ctx }) {
  const [ordenes, tickets] = await Promise.all([safe(() => resumenMantenimientoTecnico(ctx)), can(ctx, "tickets.gestionar") ? safe(() => resumenTicketsMantenimiento(ctx)) : null]);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {ordenes && <StatCard label="Órdenes abiertas" value={ordenes.abiertas} hint={`${ordenes.atrasadas} atrasadas`} href="/mantenimiento" tone={ordenes.atrasadas ? "warning" : "primary"} />}
        {tickets && <StatCard label="Tickets asignados" value={tickets.asignados} hint={`${tickets.vencidos} vencidos`} href="/tickets" tone={tickets.vencidos ? "danger" : "default"} />}
      </div>
      {ordenes && (
        <Section titulo="Para hoy">
          <Lista
            vacio="No tienes órdenes para hoy."
            items={ordenes.hoy.map((o) => ({ key: o.id, titulo: `OT-${o.numero} · ${o.titulo}`, detalle: [o.activo, o.ubicacion, fecha(o.fechaProgramada)].filter(Boolean).join(" · "), href: `/mantenimiento/ordenes/${o.id}`, derecha: o.atrasada ? <StatusBadge value="VENCIDA" text="Atrasada" /> : <StatusBadge value={o.estado} /> }))}
          />
        </Section>
      )}
      {tickets && (
        <Section titulo="Tickets asignados">
          <Lista vacio="Sin tickets asignados." items={tickets.items.map((t) => ({ key: t.id, titulo: `${t.radicado} · ${t.titulo}`, detalle: label(t.estado), href: t.href }))} />
        </Section>
      )}
    </div>
  );
}
