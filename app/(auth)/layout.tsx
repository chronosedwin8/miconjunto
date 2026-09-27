import { Building2 } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-gradient-to-b from-primary/10 via-background to-background">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Building2 className="size-7" aria-hidden="true" />
          </div>
          <div>
            <p className="text-xl font-bold leading-tight">MiConjunto</p>
            <p className="text-sm text-muted-foreground">Tu conjunto, en tu bolsillo</p>
          </div>
        </div>
        {children}
      </div>
      <footer className="pb-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} MiConjunto · <a className="underline" href="/politica-datos">Política de datos</a>
      </footer>
    </main>
  );
}
