import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { MarcoCelular, MarcoNavegador } from "@/components/marketing/marcos";
import { UTILIDADES } from "@/components/marketing/contenido";

const TITULO = "Funcionalidades del software para propiedad horizontal";
const DESCRIPCION =
  "Cartera, pagos en línea, portería, paquetería, reservas con factura electrónica, PQRS, convivencia, asambleas, votaciones, mantenimiento, objetos perdidos, estadísticas e IA para conjuntos residenciales en Colombia.";

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRIPCION,
  alternates: { canonical: "/funcionalidades" },
  openGraph: { type: "website", locale: "es_CO", url: "/funcionalidades", siteName: "Conjunto360", title: `${TITULO} · Conjunto360`, description: DESCRIPCION },
  twitter: { card: "summary_large_image", title: `${TITULO} · Conjunto360`, description: DESCRIPCION },
};

type Grupo = { id: string; titulo: string; intro: string; items: string[]; captura?: { tipo: "celular" | "panel"; src: string; alt: string } };

const GRUPOS: Grupo[] = [
  {
    id: "finanzas",
    titulo: "Cartera, pagos y facturación",
    intro: "El dinero del conjunto, claro y al día para la administración, el consejo y cada propietario.",
    items: [
      "Generación mensual de cuotas por coeficiente o valor fijo",
      "Intereses de mora diarios sobre capital, con historial de la tasa",
      "Descuento por pronto pago y cuotas extraordinarias",
      "Pagos en línea con Wompi y Mercado Pago (PSE, tarjeta, Nequi)",
      "Recibos, estado de cuenta en PDF y paz y salvo con QR verificable",
      "Acuerdos de pago, cartas y gestión de cobro según la Ley 2300",
      "Campañas de cobro con seguimiento de aperturas y clics",
      "Conciliación bancaria y exportación contable",
      "Facturación electrónica DIAN para alquileres de zonas gravadas",
      "Presupuesto anual con ejecución por rubro",
    ],
    captura: { tipo: "panel", src: "/marketing/panel-cartera.webp", alt: "Tablero de cartera de Conjunto360" },
  },
  {
    id: "porteria",
    titulo: "Portería, visitantes y paquetes",
    intro: "Seguridad sin cuadernos: todo queda registrado y el residente se entera al instante.",
    items: [
      "Autorizaciones de visitantes con código de 6 dígitos o QR",
      "Visitantes frecuentes con horarios permitidos",
      "Solicitud de ingreso al residente en tiempo real",
      "Bitácora inalterable de ingresos y salidas",
      "Vehículos, parqueadero de visitantes y cobro por horas",
      "Recepción y entrega de paquetes con firma",
      "Novedades del turno y botón de emergencia",
      "Funciona sin internet y sincroniza después",
    ],
    captura: { tipo: "celular", src: "/marketing/app-porteria.webp", alt: "Kiosco de portería de Conjunto360" },
  },
  {
    id: "comunidad",
    titulo: "Comunidad y servicios",
    intro: "Lo que la gente usa todos los días, en la palma de la mano.",
    items: [
      "Reservas de zonas comunes con reglas, bloqueos y depósitos",
      "PQRS con radicado, tiempos en días hábiles y Kanban",
      "Muro, calendario, documentos y directorio de proveedores",
      "Correo masivo segmentado, push y WhatsApp",
      "Clasificados entre vecinos y objetos perdidos con coincidencias automáticas",
      "Obras y mudanzas con aprobación y paz y salvo",
      "Accesos para todo el hogar con permisos que define el titular",
      "Página pública del conjunto para PQRS de no residentes",
    ],
    captura: { tipo: "celular", src: "/marketing/app-reservas.webp", alt: "Reservas de zonas comunes en la app de Conjunto360" },
  },
  {
    id: "gobierno",
    titulo: "Gobierno y convivencia",
    intro: "Decisiones válidas y procesos justos, de acuerdo con la Ley 675 de 2001.",
    items: [
      "Asambleas presenciales, virtuales o mixtas con quórum por coeficiente",
      "Poderes, asistencia con QR y proyección del quórum en vivo",
      "Votaciones con mayoría simple o calificada y voto secreto",
      "Acta redactada sola al terminar, firmada en pantalla y publicada en PDF",
      "Consejo de administración con aprobaciones pendientes",
      "Llamados de atención y multas con debido proceso (art. 59)",
      "Encuestas rápidas a toda la comunidad o por segmento",
    ],
    captura: { tipo: "panel", src: "/marketing/panel-asambleas.webp", alt: "Gestión de asambleas en Conjunto360" },
  },
  {
    id: "operacion",
    titulo: "Operación, mantenimiento e informes",
    intro: "Lo que no se ve, pero hace que el conjunto funcione.",
    items: [
      "Activos con hoja de vida y código QR",
      "Mantenimientos preventivos con alertas y órdenes de trabajo",
      "Proveedores, contratos y pólizas con vencimientos",
      "Empleados con documentos de ARL y EPS",
      "Estadísticas por módulo con comparación de periodos",
      "Historial por unidad e informe de empalme de administración",
      "Asistente con IA para redactar respuestas y resumir actas",
      "API REST documentada, auditoría y copias de seguridad diarias",
    ],
    captura: { tipo: "panel", src: "/marketing/panel-estadisticas.webp", alt: "Estadísticas del conjunto en Conjunto360" },
  },
];

export default function FuncionalidadesPage() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-4 pb-10 pt-12 text-center lg:px-8 lg:pt-20">
        <h1 className="text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">Funcionalidades para administrar tu conjunto de principio a fin</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">Más de {UTILIDADES.length} módulos integrados en una sola app, todos incluidos en tu plan.</p>
        <nav aria-label="Secciones" className="mt-8 flex flex-wrap justify-center gap-2">
          {GRUPOS.map((g) => (
            <a key={g.id} href={`#${g.id}`} className="inline-flex h-10 items-center rounded-full border bg-background px-4 text-sm font-medium hover:bg-muted">
              {g.titulo}
            </a>
          ))}
        </nav>
      </section>

      {GRUPOS.map((g, i) => (
        <section key={g.id} id={g.id} className={i % 2 === 0 ? "scroll-mt-20 border-t bg-muted/30 py-16" : "scroll-mt-20 border-t py-16"} aria-labelledby={`t-${g.id}`}>
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 lg:grid-cols-[1.2fr_1fr] lg:px-8">
            <div>
              <h2 id={`t-${g.id}`} className="text-3xl font-bold tracking-tight">{g.titulo}</h2>
              <p className="mt-3 text-lg text-muted-foreground">{g.intro}</p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {g.items.map((it) => (
                  <li key={it} className="flex gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {it}
                  </li>
                ))}
              </ul>
            </div>
            {g.captura &&
              (g.captura.tipo === "celular" ? (
                <MarcoCelular src={g.captura.src} alt={g.captura.alt} className="mx-auto w-60" />
              ) : (
                <MarcoNavegador src={g.captura.src} alt={g.captura.alt} />
              ))}
          </div>
        </section>
      ))}

      <section className="border-t py-16">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 text-center lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight">Todo esto está incluido en tu plan</h2>
          <p className="text-lg text-muted-foreground">Sin cobros por módulo ni por usuario.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/precios#cotizador" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground hover:bg-primary/90">
              Ver precios y cotizar <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-xl border px-6 font-semibold hover:bg-muted">
              Ingresar a la app
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
