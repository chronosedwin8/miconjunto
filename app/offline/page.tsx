import { WifiOff } from "lucide-react";

export const metadata = { title: "Sin conexión" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <WifiOff className="size-12 text-muted-foreground" />
      <h1 className="text-xl font-bold">Sin conexión a internet</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Esta página no está disponible sin conexión. Si eres de portería, la pantalla de portería sigue funcionando y sincroniza los registros cuando vuelva la señal.
      </p>
      <a href="/porteria" className="rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground">
        Ir a portería
      </a>
    </main>
  );
}
