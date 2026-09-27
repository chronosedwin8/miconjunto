import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <SearchX className="size-12 text-muted-foreground" />
      <h1 className="text-xl font-bold">Página no encontrada</h1>
      <p className="max-w-sm text-sm text-muted-foreground">La dirección no existe o fue movida.</p>
      <Link href="/inicio" className="rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground">
        Ir al inicio
      </Link>
    </main>
  );
}
