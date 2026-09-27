import { Building2 } from "lucide-react";

/** Layout público de la ficha de activo (al escanear la etiqueta QR). */
export default function ActivoPublicoLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-gradient-to-b from-primary/10 via-background to-background">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Building2 className="size-6" aria-hidden="true" />
          </div>
          <p className="text-lg font-bold leading-tight">MiConjunto</p>
        </div>
        {children}
      </div>
      <footer className="pb-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} MiConjunto · <a className="underline" href="/politica-datos">Política de datos</a>
      </footer>
    </main>
  );
}
