"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Barras, Lineas, fmt, type Formato } from "@/components/charts/charts";

type Kpi = { key: string; label: string; formato?: Formato; mejor?: "sube" | "baja" };

function Kpis({ kpis, anterior, def }: { kpis: Record<string, number>; anterior: Record<string, number> | null; def: Kpi[] }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
      {def.map((k) => {
        const v = kpis[k.key] ?? 0;
        const a = anterior?.[k.key];
        const delta = a !== undefined && a !== null && a !== 0 ? ((v - a) / Math.abs(a)) * 100 : null;
        const bueno = delta === null || !k.mejor ? null : k.mejor === "sube" ? delta >= 0 : delta <= 0;
        const Icon = delta === null || Math.abs(delta) < 0.5 ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
        return (
          <div key={k.key} className="rounded-xl border bg-card p-3">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p className="mt-0.5 text-xl font-bold">{fmt(v, k.formato)}</p>
            {delta !== null && (
              <p className={`mt-0.5 flex items-center gap-1 text-xs ${bueno === null ? "text-muted-foreground" : bueno ? "text-success" : "text-destructive"}`}>
                <Icon className="size-3.5" aria-hidden="true" />
                {Math.abs(delta).toFixed(0)} % vs. periodo anterior
                <span className="sr-only">{bueno ? "(mejora)" : "(empeora)"}</span>
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

const grid = "grid gap-4 lg:grid-cols-2";

export function Tablero({ tab, datos }: { tab: string; datos: { actual: any; anterior: Record<string, number> | null } }) {
  const d = datos.actual;
  const ant = datos.anterior;
  switch (tab) {
    case "cartera":
      return (
        <>
          <Kpis
            kpis={d.kpis}
            anterior={ant}
            def={[
              { key: "recaudado", label: "Recaudado", formato: "cop", mejor: "sube" },
              { key: "efectividad", label: "Efectividad de recaudo", formato: "pct", mejor: "sube" },
              { key: "vencido", label: "Cartera vencida", formato: "cop", mejor: "baja" },
              { key: "pctMoraUnidades", label: "Unidades en mora", formato: "pct", mejor: "baja" },
              { key: "prontoPago", label: "Descuento pronto pago", formato: "cop" },
              { key: "interesesGenerados", label: "Intereses de mora", formato: "cop" },
              { key: "saldoTotal", label: "Cartera total", formato: "cop", mejor: "baja" },
              { key: "proyeccion", label: "Proyección de recaudo próximo mes", formato: "cop" },
            ]}
          />
          <div className={grid}>
            <Barras titulo="Facturado vs. recaudado por mes" data={d.serie} xKey="mes" series={[{ key: "facturado", label: "Facturado" }, { key: "recaudado", label: "Recaudado" }]} formato="cop" className="lg:col-span-2" />
            <Barras titulo="Edad de la cartera" descripcion="Saldo pendiente por días de mora" data={d.aging} xKey="rango" series={[{ key: "saldo", label: "Saldo" }]} formato="cop" />
            <Barras titulo="Recaudo por medio de pago" data={d.porMedio} xKey="medio" series={[{ key: "valor", label: "Recaudo" }]} formato="cop" horizontal />
            {d.topMorosos.length > 0 && <Barras titulo="Top morosos" descripcion="Saldo vencido por unidad" data={d.topMorosos} xKey="unidad" series={[{ key: "saldo", label: "Saldo vencido" }]} formato="cop" horizontal />}
            {d.campanas.length > 0 && <Barras titulo="Efectividad de campañas de cobro" data={d.campanas} xKey="campana" series={[{ key: "aperturas", label: "% aperturas" }, { key: "clics", label: "% clics al pago" }]} formato="pct" />}
          </div>
        </>
      );
    case "reservas":
      return (
        <>
          <Kpis
            kpis={d.kpis}
            anterior={ant}
            def={[
              { key: "total", label: "Reservas", mejor: "sube" },
              { key: "ingresos", label: "Ingresos por alquiler (base)", formato: "cop", mejor: "sube" },
              { key: "iva", label: "IVA generado", formato: "cop" },
              { key: "calificacion", label: "Calificación promedio (1–5)", mejor: "sube" },
              { key: "cancelaciones", label: "Cancelaciones", mejor: "baja" },
              { key: "noShows", label: "No se presentaron", mejor: "baja" },
            ]}
          />
          <div className={grid}>
            <Barras titulo="Ocupación por zona" descripcion="% de horas reservadas sobre horas de operación" data={d.ocupacion} xKey="zona" series={[{ key: "ocupacion", label: "Ocupación" }]} formato="pct" horizontal />
            <Barras titulo="Horas pico" descripcion="Reservas por hora de inicio" data={d.horasPico} xKey="hora" series={[{ key: "reservas", label: "Reservas" }]} />
          </div>
        </>
      );
    case "porteria":
      return (
        <>
          <Kpis
            kpis={{ ...d.kpis, paquetes: d.paquetes.total, horasPaquete: d.paquetes.horasPromedio, sinReclamar: d.paquetes.sinReclamar }}
            anterior={ant}
            def={[
              { key: "ingresos", label: "Ingresos registrados" },
              { key: "permanenciaMin", label: "Permanencia promedio (min)" },
              { key: "respuestaSeg", label: "Respuesta a autorizaciones (s)", mejor: "baja" },
              { key: "domicilios", label: "Domicilios" },
              { key: "vehiculosVisitantes", label: "Vehículos de visitantes" },
              { key: "paquetes", label: "Paquetes recibidos" },
              { key: "horasPaquete", label: "Horas promedio en portería", formato: "horas", mejor: "baja" },
              { key: "sinReclamar", label: "Paquetes sin reclamar hoy", mejor: "baja" },
            ]}
          />
          <div className={grid}>
            <Lineas titulo="Ingresos y salidas por día" data={d.porDia} xKey="dia" series={[{ key: "ingresos", label: "Ingresos" }, { key: "salidas", label: "Salidas" }]} className="lg:col-span-2" />
            <Barras titulo="Ingresos por hora del día" data={d.porHora} xKey="hora" series={[{ key: "ingresos", label: "Ingresos" }]} />
            <Barras titulo="Visitantes por tipo" data={d.porTipo} xKey="tipo" series={[{ key: "ingresos", label: "Ingresos" }]} horizontal />
            <Barras titulo="Novedades por tipo" data={d.novedades} xKey="tipo" series={[{ key: "total", label: "Novedades" }]} horizontal />
            <Barras titulo="Paquetes por transportadora" data={d.paquetes.porTransportadora} xKey="transportadora" series={[{ key: "paquetes", label: "Paquetes" }]} horizontal />
            <Lineas titulo="Paquetes por día" data={d.paquetes.porDia} xKey="dia" series={[{ key: "paquetes", label: "Paquetes" }]} className="lg:col-span-2" />
          </div>
        </>
      );
    case "pqrs":
      return (
        <>
          <Kpis
            kpis={d.kpis}
            anterior={ant}
            def={[
              { key: "total", label: "Tickets recibidos" },
              { key: "horasResolucion", label: "Tiempo de resolución", formato: "horas", mejor: "baja" },
              { key: "cumplimientoSla", label: "Cumplimiento de SLA", formato: "pct", mejor: "sube" },
              { key: "satisfaccion", label: "Satisfacción (1–5)", mejor: "sube" },
              { key: "vencidos", label: "Abiertos con SLA vencido", mejor: "baja" },
              { key: "reabiertos", label: "Reabiertos", mejor: "baja" },
            ]}
          />
          <div className={grid}>
            <Barras titulo="Tickets por tipo" data={d.porTipo} xKey="tipo" series={[{ key: "total", label: "Tickets" }]} horizontal />
            <Barras titulo="Tickets por estado" data={d.porEstado} xKey="estado" series={[{ key: "total", label: "Tickets" }]} horizontal />
            <Barras titulo="Zonas y activos que más fallan" data={d.masFallan} xKey="lugar" series={[{ key: "total", label: "Reportes" }]} horizontal />
          </div>
        </>
      );
    case "comunidad":
      return (
        <>
          <Kpis
            kpis={d.kpis}
            anterior={null}
            def={[
              { key: "personas", label: "Personas" },
              { key: "menores", label: "Menores de edad" },
              { key: "adultosMayores", label: "Adultos mayores (60+)" },
              { key: "movilidad", label: "Movilidad reducida" },
              { key: "mascotas", label: "Mascotas" },
              { key: "vehiculos", label: "Vehículos" },
              { key: "aperturaCorreos", label: "Apertura de correos", formato: "pct" },
              { key: "lecturasPorPublicacion", label: "Lecturas por publicación" },
            ]}
          />
          <div className={grid}>
            <Barras titulo="Personas por rango de edad" data={d.edades} xKey="rango" series={[{ key: "personas", label: "Personas" }]} />
            <Barras titulo="Unidades por ocupación" data={d.ocupacion} xKey="estado" series={[{ key: "unidades", label: "Unidades" }]} horizontal />
            <Barras titulo="Mascotas por especie" data={d.mascotas} xKey="especie" series={[{ key: "total", label: "Mascotas" }]} horizontal />
            <Barras titulo="Vehículos por tipo" data={d.vehiculos} xKey="tipo" series={[{ key: "total", label: "Vehículos" }]} horizontal />
            {d.movilidadPorTorre.length > 0 && <Barras titulo="Movilidad reducida por torre" data={d.movilidadPorTorre} xKey="torre" series={[{ key: "personas", label: "Personas" }]} horizontal />}
            {d.participacion.length > 0 && <Barras titulo="Participación en encuestas y votaciones" descripcion="% de unidades / % de coeficiente" data={d.participacion} xKey="actividad" series={[{ key: "participacion", label: "Participación" }]} formato="pct" horizontal />}
          </div>
        </>
      );
    case "mantenimiento":
      return (
        <>
          <Kpis
            kpis={d.kpis}
            anterior={ant}
            def={[
              { key: "ordenes", label: "Órdenes de trabajo" },
              { key: "cumplimientoPlan", label: "Cumplimiento del plan", formato: "pct", mejor: "sube" },
              { key: "costo", label: "Costo de mantenimiento", formato: "cop", mejor: "baja" },
              { key: "vencidas", label: "Órdenes vencidas", mejor: "baja" },
            ]}
          />
          <div className={grid}>
            <Barras titulo="Costo por activo" data={d.costoPorActivo} xKey="activo" series={[{ key: "costo", label: "Costo" }]} formato="cop" horizontal />
            <Barras titulo="MTBF aproximado" descripcion="Días promedio entre fallas (menos = falla más)" data={d.mtbf} xKey="activo" series={[{ key: "dias", label: "Días entre fallas" }]} formato="dias" horizontal />
            <Barras titulo="Desempeño de proveedores" descripcion="% de órdenes completadas" data={d.proveedores} xKey="proveedor" series={[{ key: "cumplimiento", label: "Cumplimiento" }]} formato="pct" horizontal />
          </div>
        </>
      );
    case "convivencia":
      return (
        <>
          <Kpis
            kpis={d.kpis}
            anterior={ant}
            def={[
              { key: "llamados", label: "Llamados de atención", mejor: "baja" },
              { key: "multas", label: "Multas propuestas", mejor: "baja" },
              { key: "ratificadas", label: "Multas ratificadas" },
              { key: "recaudoMultas", label: "Recaudo de multas", formato: "cop" },
              { key: "reincidentes", label: "Unidades reincidentes", mejor: "baja" },
            ]}
          />
          <div className={grid}>
            <Barras titulo="Llamados por motivo" data={d.llamadosPorMotivo} xKey="motivo" series={[{ key: "total", label: "Llamados" }]} horizontal />
            <Barras titulo="Multas por infracción" data={d.multasPorTipo} xKey="tipo" series={[{ key: "total", label: "Multas" }]} horizontal />
          </div>
        </>
      );
    case "asambleas":
      return (
        <div className={grid}>
          <Barras titulo="Quórum histórico" descripcion="% de coeficientes presentes y representados" data={d.quorum} xKey="asamblea" series={[{ key: "quorum", label: "Quórum" }]} formato="pct" />
          <Barras titulo="Participación por torre (última asamblea)" data={d.participacionTorre} xKey="torre" series={[{ key: "participacion", label: "Participación" }]} formato="pct" horizontal />
        </div>
      );
    case "personal":
      return (
        <>
          <Kpis
            kpis={d.kpis}
            anterior={ant}
            def={[
              { key: "pagado", label: "Pagos realizados", formato: "cop" },
              { key: "alquileres", label: "Gasto en alquileres", formato: "cop" },
              { key: "visitas", label: "Visitantes recibidos" },
              { key: "paquetes", label: "Paquetes recibidos" },
              { key: "tickets", label: "Tickets creados" },
              { key: "horasRespuesta", label: "Tiempo de respuesta", formato: "horas", mejor: "baja" },
            ]}
          />
          <Barras titulo="Mis pagos por mes" data={d.pagosPorMes} xKey="mes" series={[{ key: "valor", label: "Pagado" }]} formato="cop" />
        </>
      );
    default:
      return null;
  }
}
