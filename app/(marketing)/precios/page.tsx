import type { Metadata } from "next";
import { Cotizador } from "@/components/marketing/cotizador";
import { Faq, faqJsonLd } from "@/components/marketing/faq";
import { JsonLd } from "@/components/marketing/json-ld";
import { NOTA_PRECIOS, Planes } from "@/components/marketing/planes";
import { PREGUNTAS, urlSitio } from "@/components/marketing/contenido";
import { cop, cotizar, PRECIO_MULTI_POR_CONJUNTO, PRECIO_UNICO } from "@/lib/comercial/precios";

const TITULO = "Precios del software para conjuntos residenciales";
const DESCRIPCION = `Plan Conjunto único por ${cop(PRECIO_UNICO)} al año con todo incluido, o Multiconjunto por ${cop(PRECIO_MULTI_POR_CONJUNTO)} al año por conjunto con 10 % de descuento desde 4 conjuntos. Cotiza en línea.`;

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRIPCION,
  alternates: { canonical: "/precios" },
  openGraph: { type: "website", locale: "es_CO", url: "/precios", siteName: "Conjunto360", title: `${TITULO} · Conjunto360`, description: DESCRIPCION },
  twitter: { card: "summary_large_image", title: `${TITULO} · Conjunto360`, description: DESCRIPCION },
};

const EJEMPLOS = [1, 2, 3, 4, 5, 10];
const PREGUNTAS_PRECIO = PREGUNTAS.filter((q) => /cuesta|pagan|descuento|Excel/i.test(q.p));

export default function PreciosPage() {
  return (
    <>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Product",
            name: "Conjunto360",
            description: DESCRIPCION,
            brand: { "@type": "Brand", name: "Conjunto360" },
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: "COP",
              lowPrice: PRECIO_MULTI_POR_CONJUNTO * 0.9,
              highPrice: PRECIO_UNICO,
              offerCount: 2,
              url: urlSitio("/precios"),
            },
          },
          faqJsonLd(PREGUNTAS_PRECIO),
        ]}
      />
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_65%)]" aria-hidden />
        <div className="mx-auto max-w-5xl px-4 pb-12 pt-12 text-center lg:px-8 lg:pt-20">
          <h1 className="text-balance text-4xl font-extrabold tracking-tight sm:text-5xl">Precios claros para tu conjunto residencial</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">Todo incluido, usuarios ilimitados y sin cobros por módulo. {NOTA_PRECIOS}</p>
        </div>
        <div className="mx-auto max-w-5xl px-4 pb-16 lg:px-8">
          <h2 className="sr-only">Planes</h2>
          <Planes conCotizador={false} />
        </div>
      </section>

      <section id="cotizador" className="scroll-mt-20 border-y bg-muted/30 py-16 lg:py-20" aria-labelledby="t-cotizador">
        <div className="mx-auto max-w-6xl px-4 lg:px-8">
          <div className="mb-10 max-w-2xl">
            <h2 id="t-cotizador" className="text-3xl font-bold tracking-tight sm:text-4xl">Cotizador multiconjunto</h2>
            <p className="mt-3 text-lg text-muted-foreground">
              Elige cuántos conjuntos quieres administrar y mira el valor al instante. Si necesitas una cotización formal, te la enviamos en PDF a tu correo.
            </p>
          </div>
          <Cotizador />
        </div>
      </section>

      <section className="py-16 lg:py-20" aria-labelledby="t-tabla">
        <div className="mx-auto max-w-4xl px-4 lg:px-8">
          <h2 id="t-tabla" className="text-2xl font-bold tracking-tight sm:text-3xl">Ejemplos de valor anual</h2>
          <div className="mt-6 overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full min-w-[520px] text-sm">
              <caption className="sr-only">Valor anual según la cantidad de conjuntos</caption>
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Conjuntos</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Plan</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Subtotal</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Descuento</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Total anual</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {EJEMPLOS.map((n) => {
                  const c = cotizar(n);
                  return (
                    <tr key={n}>
                      <th scope="row" className="px-4 py-3 text-left font-semibold tabular-nums">{n}</th>
                      <td className="px-4 py-3">{c.plan === "UNICO" ? "Conjunto único" : "Multiconjunto"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{cop(c.subtotal)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-primary">{c.descuento ? `− ${cop(c.descuento)}` : "—"}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{cop(c.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-t bg-muted/30 py-16 lg:py-20" aria-labelledby="t-faq-precios">
        <div className="mx-auto max-w-3xl px-4 lg:px-8">
          <h2 id="t-faq-precios" className="text-center text-2xl font-bold tracking-tight sm:text-3xl">Preguntas sobre precios</h2>
          <div className="mt-8">
            <Faq preguntas={PREGUNTAS_PRECIO} />
          </div>
        </div>
      </section>
    </>
  );
}
