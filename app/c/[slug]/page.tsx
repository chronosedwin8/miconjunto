import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Building2, Clock, Mail, MapPin, Phone, Trees } from "lucide-react";
import { prisma } from "@/lib/db";
import { parseConfig } from "@/lib/conjunto/config";
import { label } from "@/lib/labels";
import { PqrsPublicaForm } from "./pqrs-form";

/**
 * Página pública del conjunto (opcional por tenant, `Conjunto.paginaPublica`): información general,
 * contacto de administración, horario de portería, zonas comunes con fotos públicas y formulario PQRS
 * para no residentes. No requiere sesión y no expone datos de residentes.
 */
export const dynamic = "force-dynamic";

async function cargar(slug: string) {
  return prisma.conjunto.findFirst({
    where: { slug, paginaPublica: true, deletedAt: null, estado: "ACTIVO" },
    select: {
      id: true,
      nombre: true,
      slug: true,
      direccion: true,
      ciudad: true,
      departamento: true,
      telefono: true,
      email: true,
      logoUrl: true,
      colorPrimario: true,
      descripcionPublica: true,
      config: true,
      zonas: { where: { deletedAt: null, estado: { not: "INACTIVA" } }, select: { id: true, nombre: true, categoria: true, capacidad: true, fotos: true }, orderBy: { nombre: "asc" } },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await cargar((await params).slug);
  return { title: c?.nombre ?? "Conjunto", description: c?.descripcionPublica ?? undefined };
}

/** Solo se muestran fotos de la carpeta pública del conjunto (sin sesión). */
const esPublica = (url: string, conjuntoId: string) => url.startsWith(`/api/files/${conjuntoId}/publico/`) || url.startsWith("/api/files/global/");

export default async function PaginaPublicaConjunto({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await cargar(slug);
  if (!c) notFound();
  const cfg = parseConfig(c.config);
  const color = c.colorPrimario || "#0f766e";
  const logo = c.logoUrl && esPublica(c.logoUrl, c.id) ? c.logoUrl : null;
  return (
    <div className="min-h-dvh bg-background" style={{ ["--brand" as string]: color }}>
      <header className="bg-gradient-to-b from-primary/15 to-background">
        <div className="mx-auto max-w-3xl px-4 pb-6 pt-8">
          <div className="flex items-center gap-3">
            {logo ? (
              <img src={logo} alt="" className="size-14 rounded-2xl border bg-background object-contain" />
            ) : (
              <span className="grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
                <Building2 className="size-8" aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight">{c.nombre}</h1>
              {c.ciudad && (
                <p className="text-sm text-muted-foreground">
                  {c.ciudad}
                  {c.departamento ? `, ${c.departamento}` : ""}
                </p>
              )}
            </div>
          </div>
          {c.descripcionPublica && <p className="mt-4 text-[15px] leading-relaxed">{c.descripcionPublica}</p>}
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-8 px-4 pb-16">
        <section aria-labelledby="contacto" className="grid gap-3 sm:grid-cols-2">
          <h2 id="contacto" className="sr-only">
            Contacto
          </h2>
          {c.direccion && (
            <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
              <MapPin className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Dirección</p>
                <p className="font-medium">{c.direccion}</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
            <Clock className="mt-0.5 size-5 shrink-0 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">Portería</p>
              <p className="font-medium">{cfg.porteria.horario}</p>
            </div>
          </div>
          {c.telefono && (
            <a href={`tel:${c.telefono}`} className="flex items-start gap-3 rounded-xl border bg-card p-4 hover:bg-muted/50">
              <Phone className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Administración</p>
                <p className="font-medium">{c.telefono}</p>
              </div>
            </a>
          )}
          {c.email && (
            <a href={`mailto:${c.email}`} className="flex min-w-0 items-start gap-3 rounded-xl border bg-card p-4 hover:bg-muted/50">
              <Mail className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Correo</p>
                <p className="truncate font-medium">{c.email}</p>
              </div>
            </a>
          )}
        </section>

        {c.zonas.length > 0 && (
          <section aria-labelledby="zonas">
            <h2 id="zonas" className="mb-3 text-lg font-semibold">
              Zonas comunes
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {c.zonas.map((z) => {
                const foto = z.fotos.find((f) => esPublica(f, c.id));
                return (
                  <li key={z.id} className="overflow-hidden rounded-xl border bg-card">
                    {foto ? (
                      <img src={foto} alt={z.nombre} className="h-28 w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="grid h-20 place-items-center bg-primary/10 text-primary">
                        <Trees className="size-7" aria-hidden />
                      </div>
                    )}
                    <div className="p-3">
                      <p className="text-sm font-medium">{z.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {label(z.categoria)}
                        {z.capacidad ? ` · ${z.capacidad} personas` : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section aria-labelledby="pqrs">
          <h2 id="pqrs" className="text-lg font-semibold">
            Peticiones, quejas, reclamos y sugerencias
          </h2>
          <p className="mb-3 mt-1 text-sm text-muted-foreground">
            ¿No vives en el conjunto? Escríbele a la administración. Recibirás un número de radicado y la respuesta en tu correo. Si eres residente, ingresa a la app.
          </p>
          <PqrsPublicaForm slug={c.slug} renderizadoEn={Date.now()} politicaUrl="/politica-datos" />
        </section>
      </main>
      <footer className="border-t py-6 text-center text-xs text-muted-foreground">
        {c.nombre} · Con la tecnología de <span className="font-semibold">MiConjunto</span>
      </footer>
    </div>
  );
}
