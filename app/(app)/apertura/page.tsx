import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { requirePage } from "@/lib/auth/guard";
import { spGet, type SP } from "@/lib/pagination";
import { resumenEstructura } from "@/lib/conjunto/service";
import { TIPOS_IMPORTACION } from "@/lib/importacion/service";
import { PageHeader } from "@/components/app/page-header";
import { Importer } from "@/components/app/importer";
import { ActionButton } from "@/components/form/action-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { aplicarImportacionAction } from "../conjunto/importar/actions";
import { activarConjuntoAction } from "./actions";

export const metadata = { title: "Asistente de apertura" };

export default async function AperturaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePage("configuracion.editar");
  const paso = Number(spGet(await searchParams, "paso") ?? 1);
  const db = ctx.db;
  const [res, vinculos, saldos, zonas, parq, usuarios, conjunto] = await Promise.all([
    resumenEstructura(ctx),
    db.vinculoUnidad.count(),
    db.cuota.count({ where: { origen: "APERTURA" } }),
    db.zonaComun.count(),
    db.parqueadero.count(),
    db.membresiaConjunto.count(),
    db.conjunto.findUniqueOrThrow({ where: { id: ctx.conjuntoId } }),
  ]);
  const tipo = (k: keyof typeof TIPOS_IMPORTACION) => [{ value: k, label: TIPOS_IMPORTACION[k].titulo, plantilla: TIPOS_IMPORTACION[k].plantilla }];
  const pasos = [
    { n: 1, titulo: "Datos del conjunto", ok: !!conjunto.nit && !!conjunto.direccion, contenido: <p className="text-sm">Revisa NIT, dirección, logo y color en <Link className="text-primary" href="/configuracion">Configuración → Datos del conjunto</Link>.</p> },
    {
      n: 2,
      titulo: "Torres y unidades",
      ok: res.unidades > 0 && res.coeficientes.ok,
      contenido: (
        <>
          <p className="mb-3 text-sm">
            Carga las unidades con su coeficiente. Actualmente: {res.torres} torres, {res.unidades} unidades, coeficientes suman {res.coeficientes.suma} %.
          </p>
          <Importer tipos={tipo("UNIDADES")} fijo="UNIDADES" aplicar={aplicarImportacionAction} />
        </>
      ),
    },
    {
      n: 3,
      titulo: "Propietarios, residentes y vehículos",
      ok: vinculos > 0,
      contenido: (
        <div className="space-y-4">
          <p className="text-sm">{vinculos} vínculos registrados. Marca “invitar = SI” para enviarles el acceso.</p>
          <Importer tipos={tipo("PROPIETARIOS")} fijo="PROPIETARIOS" aplicar={aplicarImportacionAction} />
          <p className="text-sm">Después de las unidades (y de los parqueaderos, si los asignas), carga los vehículos de los residentes.</p>
          <Importer tipos={tipo("VEHICULOS")} fijo="VEHICULOS" aplicar={aplicarImportacionAction} />
        </div>
      ),
    },
    {
      n: 4,
      titulo: "Cuotas vigentes y saldos iniciales",
      ok: saldos > 0,
      contenido: (
        <>
          <p className="mb-3 text-sm">
            Las cuotas se calculan por coeficiente o valor fijo (<Link className="text-primary" href="/conjunto">recalcular cuotas</Link>). Carga aquí la cartera a la fecha de inicio ({saldos} saldos cargados).
          </p>
          <Importer tipos={tipo("SALDOS")} fijo="SALDOS" aplicar={aplicarImportacionAction} />
        </>
      ),
    },
    { n: 5, titulo: "Zonas comunes", ok: zonas > 0, contenido: <><p className="mb-3 text-sm">{zonas} zonas. También puedes crearlas una a una en <Link className="text-primary" href="/conjunto/zonas">Zonas comunes</Link>.</p><Importer tipos={tipo("ZONAS")} fijo="ZONAS" aplicar={aplicarImportacionAction} /></> },
    {
      n: 6,
      titulo: "Parqueaderos y bodegas",
      ok: parq > 0,
      contenido: (
        <div className="space-y-4">
          <Importer tipos={tipo("PARQUEADEROS")} fijo="PARQUEADEROS" aplicar={aplicarImportacionAction} />
          <Importer tipos={tipo("BODEGAS")} fijo="BODEGAS" aplicar={aplicarImportacionAction} />
        </div>
      ),
    },
    { n: 7, titulo: "Parámetros financieros", ok: true, contenido: <p className="text-sm">Define días de vencimiento, pronto pago, orden de aplicación y bloqueos en <Link className="text-primary" href="/configuracion/parametros">Parámetros</Link>, y la tasa de mora en <Link className="text-primary" href="/cartera/tasa-mora">Cartera → Tasa de mora</Link>.</p> },
    { n: 8, titulo: "Usuarios iniciales e invitaciones", ok: usuarios > 1, contenido: <><p className="mb-3 text-sm">{usuarios} usuarios con acceso. Invita portería, consejo, contador… en bloque.</p><Importer tipos={tipo("USUARIOS")} fijo="USUARIOS" aplicar={aplicarImportacionAction} /></> },
  ];
  const actual = pasos.find((p) => p.n === paso) ?? pasos[0];
  return (
    <>
      <PageHeader titulo="Asistente de apertura" descripcion={`${conjunto.nombre} · estado: ${conjunto.estado.replace("_", " ").toLowerCase()}`} />
      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <ol className="flex gap-2 overflow-x-auto no-scrollbar lg:flex-col">
          {pasos.map((p) => (
            <li key={p.n} className="shrink-0">
              <Link href={`/apertura?paso=${p.n}`} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", p.n === actual.n ? "border-primary bg-primary/10 font-semibold" : "bg-card")}>
                {p.ok ? <CheckCircle2 className="size-4 text-success" /> : <Circle className="size-4 text-muted-foreground" />}
                {p.n}. {p.titulo}
              </Link>
            </li>
          ))}
        </ol>
        <section>
          <h2 className="mb-3 text-lg font-semibold">
            Paso {actual.n}: {actual.titulo}
          </h2>
          {actual.contenido}
          <div className="mt-6 flex justify-between">
            {actual.n > 1 ? (
              <Button variant="outline" render={<Link href={`/apertura?paso=${actual.n - 1}`} />}>
                Anterior
              </Button>
            ) : (
              <span />
            )}
            {actual.n < pasos.length ? (
              <Button render={<Link href={`/apertura?paso=${actual.n + 1}`} />}>Siguiente</Button>
            ) : (
              conjunto.estado !== "ACTIVO" && (
                <ActionButton action={activarConjuntoAction} confirm="¿Activar el conjunto? Los residentes podrán empezar a usar la app." successMessage="¡Conjunto activo!" redirectTo="/inicio">
                  Activar conjunto
                </ActionButton>
              )
            )}
          </div>
        </section>
      </div>
    </>
  );
}
