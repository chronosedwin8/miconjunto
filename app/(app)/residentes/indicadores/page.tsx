import Link from "next/link";
import { Accessibility, Baby, Car, Home, PawPrint, UserRound, Users } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { can } from "@/lib/permisos";
import { num, pct } from "@/lib/format";
import { label } from "@/lib/labels";
import { indicadoresPoblacion } from "@/lib/residentes/service";
import { StatCard } from "@/components/app/stat-card";
import { Section } from "@/components/app/page-header";

export const metadata = { title: "Indicadores de población" };

function Barras({ items, vacio }: { items: { label: string; total: number; href?: string }[]; vacio: string }) {
  const max = Math.max(1, ...items.map((i) => i.total));
  if (!items.length) return <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">{vacio}</p>;
  return (
    <ul className="space-y-2 rounded-xl border bg-card p-4">
      {items.map((i) => (
        <li key={i.label} className="text-sm">
          <div className="mb-1 flex justify-between gap-2">
            {i.href ? (
              <Link href={i.href} className="text-primary hover:underline">
                {i.label}
              </Link>
            ) : (
              <span>{i.label}</span>
            )}
            <span className="font-semibold tabular-nums">{num(i.total, 0)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted" aria-hidden>
            <div className="h-2 rounded-full bg-primary" style={{ width: `${(i.total / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function IndicadoresPage() {
  const ctx = await requirePage("residentes.ver_todos");
  const ind = await indicadoresPoblacion(ctx);
  const verSalud = can(ctx, "campos.persona_salud");
  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Personas que habitan" value={num(ind.totalPersonas, 0)} icon={Users} href="/residentes" />
        <StatCard label="Menores de edad" value={num(ind.menores, 0)} hint={ind.totalPersonas ? pct((ind.menores / ind.totalPersonas) * 100) : undefined} icon={Baby} href="/residentes?grupo=MENORES" />
        <StatCard label="Adultos mayores (60+)" value={num(ind.adultosMayores, 0)} hint={ind.totalPersonas ? pct((ind.adultosMayores / ind.totalPersonas) * 100) : undefined} icon={UserRound} href="/residentes?grupo=MAYORES" />
        {verSalud && <StatCard label="Movilidad reducida" value={num(ind.movilidadReducida, 0)} tone={ind.movilidadReducida ? "warning" : "default"} icon={Accessibility} href="/residentes?grupo=MOVILIDAD" />}
        <StatCard label="Unidades arrendadas" value={num(ind.arrendadas, 0)} hint={ind.unidades ? pct((ind.arrendadas / ind.unidades) * 100) : undefined} icon={Home} />
        <StatCard label="Renta corta (Airbnb)" value={num(ind.rentaCorta, 0)} icon={Home} />
      </div>
      {ind.sinFechaNacimiento > 0 && (
        <p className="mb-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          {ind.sinFechaNacimiento} persona(s) no tienen fecha de nacimiento registrada; no se cuentan como menores ni adultos mayores.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {verSalud && (
          <Section titulo="Movilidad reducida por torre y piso" acciones={<Link href="/emergencias/evacuacion" className="text-sm text-primary hover:underline">Lista de evacuación</Link>}>
            <Barras items={ind.movilidadPorTorrePiso.map((m) => ({ label: m.piso ? `${m.torre} · piso ${m.piso}` : m.torre, total: m.personas }))} vacio="No hay personas con movilidad reducida registradas." />
          </Section>
        )}
        <Section titulo="Ocupación de unidades">
          <Barras items={ind.ocupacion.map((o) => ({ label: label(o.estado), total: o.total, href: `/conjunto/unidades?ocupacion=${o.estado}` }))} vacio="Sin unidades." />
        </Section>
        <Section titulo={<span className="inline-flex items-center gap-1.5"><PawPrint className="size-4" /> Mascotas por especie</span>}>
          <Barras items={ind.mascotasPorEspecie.map((m) => ({ label: m.especie, total: m.total, href: `/residentes/mascotas?especie=${encodeURIComponent(m.especie)}` }))} vacio="No hay mascotas registradas." />
        </Section>
        <Section titulo={<span className="inline-flex items-center gap-1.5"><Car className="size-4" /> Vehículos por tipo</span>}>
          <Barras items={ind.vehiculosPorTipo.map((v) => ({ label: label(v.tipo), total: v.total, href: `/residentes/vehiculos?tipo=${v.tipo}` }))} vacio="No hay vehículos registrados." />
        </Section>
      </div>
    </>
  );
}
