import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, CloudOff, FileSpreadsheet, LogIn, Rocket, Scale, ShieldCheck, Smartphone } from "lucide-react";
import { JsonLd } from "@/components/marketing/json-ld";
import { MarcoCelular, MarcoNavegador } from "@/components/marketing/marcos";
import { NOTA_PRECIOS, Planes } from "@/components/marketing/planes";
import { Faq, faqJsonLd } from "@/components/marketing/faq";
import { PREGUNTAS, ROLES, SITIO, UTILIDADES, urlSitio } from "@/components/marketing/contenido";
import { PRECIO_MULTI_POR_CONJUNTO, PRECIO_UNICO } from "@/lib/comercial/precios";
import { cn } from "@/lib/utils";

const TITULO = "Conjunto360 · Software para administrar conjuntos residenciales en Colombia";

export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: SITIO.descripcion,
  keywords: [
    "software propiedad horizontal",
    "app conjunto residencial",
    "administración de conjuntos residenciales",
    "software administración edificios Colombia",
    "pago administración en línea",
    "portería digital",
    "asambleas virtuales propiedad horizontal",
    "Ley 675 de 2001",
  ],
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "es_CO", url: "/", siteName: "Conjunto360", title: TITULO, description: SITIO.descripcion },
  twitter: { card: "summary_large_image", title: TITULO, description: SITIO.descripcion },
};

const DESTACADOS = [
  {
    id: "cartera",
    eyebrow: "Cartera y pagos",
    titulo: "Recauda más y persigue menos",
    texto: "Las cuotas se generan por coeficiente cada mes, los intereses de mora se liquidan solos y cada residente paga desde su celular con PSE, tarjeta o Nequi. El pago se aplica a la cuota correcta y el paz y salvo sale con QR verificable.",
    puntos: ["Descuento por pronto pago automático", "Acuerdos de pago y gestión de cobro según la Ley 2300", "Conciliación bancaria y exportación contable"],
    celular: { src: "/marketing/app-pagos.webp", alt: "Pantalla de cuenta y pagos de un residente en Conjunto360" },
    panel: { src: "/marketing/panel-cartera.webp", alt: "Tablero de cartera y recaudo del administrador en Conjunto360" },
  },
  {
    id: "porteria",
    eyebrow: "Portería",
    titulo: "Una portería que no se detiene",
    texto: "Botones grandes para la tablet de la portería, visitantes que entran con código o QR, paquetes que se entregan con firma y una bitácora que nadie puede alterar. Si se cae el internet, se sigue registrando y luego se sincroniza.",
    puntos: ["Autorizaciones del residente en tiempo real", "Control de vehículos y parqueadero de visitantes", "Novedades y entrega de turno"],
    celular: { src: "/marketing/app-porteria.webp", alt: "Kiosco de portería de Conjunto360 con botones de ingreso, salida y paquetes" },
  },
  {
    id: "asambleas",
    eyebrow: "Gobierno del conjunto",
    titulo: "Asambleas y votaciones sin enredos",
    texto: "El quórum y las mayorías se calculan por coeficiente, tal como exige la Ley 675. Registra asistencia con QR, gestiona poderes, vota en vivo desde el celular y obtén el acta en PDF al terminar.",
    puntos: ["Quórum en vivo y proyección en la sala", "Voto secreto con comprobante", "Encuestas rápidas para la comunidad"],
    celular: { src: "/marketing/app-votaciones.webp", alt: "Votaciones del conjunto en la app de Conjunto360" },
    panel: { src: "/marketing/panel-asambleas.webp", alt: "Gestión de asambleas en el panel de Conjunto360" },
  },
];

const PASOS = [
  { icono: FileSpreadsheet, titulo: "Cotiza y agenda", texto: "Calcula tu plan en línea y agenda una demostración con un asesor." },
  { icono: Rocket, titulo: "Importamos tus datos", texto: "Unidades, coeficientes, residentes y saldos desde tus archivos de Excel." },
  { icono: Smartphone, titulo: "Tu comunidad en la app", texto: "Invitamos a residentes, portería y consejo. Cada uno entra con su cuenta." },
];

export default function Home() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Conjunto360",
      url: urlSitio("/"),
      logo: urlSitio("/icons/icon-512.png"),
      areaServed: "CO",
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Conjunto360",
      url: urlSitio("/"),
      inLanguage: "es-CO",
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Conjunto360",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, Android, iOS",
      description: SITIO.descripcion,
      url: urlSitio("/"),
      offers: [
        { "@type": "Offer", name: "Conjunto único", price: PRECIO_UNICO, priceCurrency: "COP", url: urlSitio("/precios"), description: "Un conjunto residencial, todo incluido, pago anual" },
        { "@type": "Offer", name: "Multiconjunto", price: PRECIO_MULTI_POR_CONJUNTO, priceCurrency: "COP", url: urlSitio("/precios"), description: "Por cada conjunto registrado, pago anual; 10 % de descuento con más de 3 conjuntos" },
      ],
    },
    faqJsonLd(PREGUNTAS),
  ];

  return (
    <>
      <JsonLd data={jsonLd} />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,color-mix(in_oklab,var(--primary)_18%,transparent),transparent_60%)]" aria-hidden />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 lg:grid-cols-[1.1fr_1fr] lg:px-8 lg:pb-24 lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-semibold text-primary">
              <Scale className="size-3.5" aria-hidden /> Software para propiedad horizontal en Colombia
            </p>
            <h1 className="mt-5 text-balance text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              La administración de tu conjunto residencial, <span className="text-primary">en una sola app</span>
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-lg text-muted-foreground">
              Cartera y pagos en línea, portería digital, reservas, PQRS, asambleas con quórum por coeficiente y mucho más. Para administración, consejo, portería y cada residente.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/precios#cotizador" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-colors hover:bg-primary/90">
                Cotizar mi conjunto <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/login" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border bg-background px-6 font-semibold transition-colors hover:bg-muted">
                <LogIn className="size-4" aria-hidden /> Ingresar a la app
              </Link>
            </div>
            <ul className="mt-8 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {["Ley 675 de 2001 (propiedad horizontal)", "Ley 1581 de 2012 (habeas data)", "Facturación electrónica DIAN", "Funciona en celular, tablet y computador"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-primary" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-md sm:max-w-none sm:pb-14 sm:pl-20">
            <MarcoNavegador src="/marketing/panel-cartera.webp" alt="Panel de administración de Conjunto360 con indicadores de recaudo y cartera" priority className="hidden sm:block" />
            <MarcoCelular src="/marketing/app-inicio.webp" alt="Inicio de un residente en la app de Conjunto360 con saldo y accesos rápidos" priority className="mx-auto w-64 sm:absolute sm:bottom-0 sm:left-0 sm:w-36 lg:w-40" />
          </div>
        </div>
      </section>

      {/* Utilidades */}
      <section id="utilidades" className="scroll-mt-20 border-y bg-muted/30 py-16 lg:py-24" aria-labelledby="t-utilidades">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="t-utilidades" className="text-3xl font-bold tracking-tight sm:text-4xl">Todo lo que tu conjunto necesita</h2>
            <p className="mt-3 text-lg text-muted-foreground">Un solo sistema en vez de hojas de cálculo, cuadernos en portería y grupos de WhatsApp.</p>
          </div>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {UTILIDADES.map((u) => (
              <li key={u.titulo} className={cn("rounded-2xl border bg-card p-5 transition-shadow hover:shadow-md", u.destacado && "border-primary/30")}>
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <u.icono className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold">{u.titulo}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{u.texto}</p>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-center">
            <Link href="/funcionalidades" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              Ver todas las funcionalidades <ArrowRight className="size-4" aria-hidden />
            </Link>
          </p>
        </div>
      </section>

      {/* Destacados con capturas reales */}
      {DESTACADOS.map((d, i) => (
        <section key={d.id} id={d.id} className="scroll-mt-20 py-16 lg:py-24" aria-labelledby={`t-${d.id}`}>
          <div className={cn("mx-auto grid max-w-6xl items-center gap-12 px-4 lg:grid-cols-2 lg:px-8", i % 2 === 1 && "lg:[&>*:first-child]:order-2")}>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary">{d.eyebrow}</p>
              <h2 id={`t-${d.id}`} className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{d.titulo}</h2>
              <p className="mt-4 text-lg text-muted-foreground">{d.texto}</p>
              <ul className="mt-6 space-y-3">
                {d.puntos.map((p) => (
                  <li key={p} className="flex gap-3">
                    <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <Check className="size-3.5" aria-hidden />
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className={cn("relative mx-auto w-full max-w-lg", d.panel && "sm:pb-14 sm:pr-16")}>
              {d.panel ? (
                <>
                  <MarcoNavegador src={d.panel.src} alt={d.panel.alt} className="hidden sm:block" />
                  <MarcoCelular src={d.celular.src} alt={d.celular.alt} className="mx-auto w-60 sm:absolute sm:bottom-0 sm:right-0 sm:w-32 lg:w-36" />
                </>
              ) : (
                <MarcoCelular src={d.celular.src} alt={d.celular.alt} className="mx-auto w-64 sm:w-72" />
              )}
            </div>
          </div>
        </section>
      ))}

      {/* Sin internet */}
      <section className="bg-primary text-primary-foreground" aria-labelledby="t-offline">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-12 sm:flex-row sm:items-center lg:px-8">
          <CloudOff className="size-12 shrink-0 opacity-90" aria-hidden />
          <div className="flex-1">
            <h2 id="t-offline" className="text-2xl font-bold">Se cayó el internet en la portería. No pasa nada.</h2>
            <p className="mt-1 opacity-90">Los ingresos, salidas y paquetes se siguen registrando y se sincronizan solos cuando vuelve la conexión.</p>
          </div>
          <ShieldCheck className="hidden size-12 shrink-0 opacity-90 lg:block" aria-hidden />
        </div>
      </section>

      {/* Roles */}
      <section id="roles" className="scroll-mt-20 py-16 lg:py-24" aria-labelledby="t-roles">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="t-roles" className="text-3xl font-bold tracking-tight sm:text-4xl">Una experiencia para cada persona del conjunto</h2>
            <p className="mt-3 text-lg text-muted-foreground">Cada quien ve solo lo que necesita, con permisos por rol y datos protegidos.</p>
          </div>
          <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((r) => (
              <li key={r.titulo} className="rounded-2xl border bg-card p-6">
                <r.icono className="size-7 text-primary" aria-hidden />
                <h3 className="mt-4 text-lg font-semibold">{r.titulo}</h3>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {r.puntos.map((p) => (
                    <li key={p} className="flex gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {p}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Cómo empezar */}
      <section className="border-y bg-muted/30 py-16 lg:py-20" aria-labelledby="t-pasos">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <h2 id="t-pasos" className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Empezar es sencillo</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {PASOS.map((p, i) => (
              <li key={p.titulo} className="relative rounded-2xl border bg-card p-6">
                <span className="absolute -top-4 left-6 grid size-8 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{i + 1}</span>
                <p.icono className="size-7 text-primary" aria-hidden />
                <h3 className="mt-3 font-semibold">{p.titulo}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Precios */}
      <section id="precios" className="scroll-mt-20 py-16 lg:py-24" aria-labelledby="t-precios">
        <div className="mx-auto max-w-5xl px-4 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="t-precios" className="text-3xl font-bold tracking-tight sm:text-4xl">Precios claros, todo incluido</h2>
            <p className="mt-3 text-lg text-muted-foreground">Sin cobros por usuario ni por módulo. {NOTA_PRECIOS}</p>
          </div>
          <div className="mt-12">
            <Planes />
          </div>
        </div>
      </section>

      {/* Preguntas */}
      <section id="preguntas" className="scroll-mt-20 border-t bg-muted/30 py-16 lg:py-24" aria-labelledby="t-preguntas">
        <div className="mx-auto max-w-3xl px-4 lg:px-8">
          <h2 id="t-preguntas" className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Preguntas frecuentes</h2>
          <div className="mt-10">
            <Faq preguntas={PREGUNTAS} />
          </div>
        </div>
      </section>

      {/* Llamado final */}
      <section className="py-16 lg:py-24">
        <div className="mx-auto max-w-4xl px-4 lg:px-8">
          <div className="rounded-3xl bg-gradient-to-br from-primary to-emerald-700 px-6 py-12 text-center text-primary-foreground shadow-xl sm:px-12">
            <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">Lleva tu conjunto a la palma de la mano</h2>
            <p className="mx-auto mt-3 max-w-xl text-lg opacity-90">Cotiza en un minuto. Si ya eres cliente, entra a la app con tu correo.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/precios#cotizador" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 font-semibold text-primary hover:bg-white/90">
                Cotizar ahora <ArrowRight className="size-4" aria-hidden />
              </Link>
              <Link href="/login" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/40 px-6 font-semibold hover:bg-white/10">
                <LogIn className="size-4" aria-hidden /> Ingresar a la app
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
