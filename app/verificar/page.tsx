import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";

export const metadata = { title: "Verificar documento" };

/** /verificar?codigo=… → /verificar/<codigo>. Sin código, formulario para escribirlo. */
export default async function VerificarIndex({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const { codigo } = await searchParams;
  const c = codigo?.trim();
  if (c) redirect(`/verificar/${encodeURIComponent(c.slice(0, 80))}`);
  return (
    <main className="flex min-h-dvh flex-col bg-gradient-to-b from-primary/10 via-background to-background">
      <div className="mx-auto w-full max-w-md flex-1 px-4 py-10">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground">
            <Building2 className="size-7" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold leading-tight">Verificar documento</h1>
            <p className="text-sm text-muted-foreground">Paz y salvos, actas y documentos oficiales</p>
          </div>
        </div>
        <form method="get" className="flex gap-2">
          <input name="codigo" required placeholder="Código, p. ej. PYS-ABCD-1234" aria-label="Código de verificación" className="h-11 flex-1 rounded-lg border bg-background px-3 uppercase" />
          <button type="submit" className="h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
            Verificar
          </button>
        </form>
      </div>
    </main>
  );
}
