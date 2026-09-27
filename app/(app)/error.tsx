"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const noExiste = /no existe|no tienes acceso/i.test(error.message);
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <AlertTriangle className="mb-3 size-12 text-warning" />
      <h1 className="text-xl font-bold">{noExiste ? "No encontramos lo que buscas" : "Algo salió mal"}</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {noExiste ? "El registro no existe o no tienes acceso a él." : "Ocurrió un error inesperado. Intenta de nuevo; si persiste, contacta a soporte."}
        {error.digest && <span className="mt-1 block text-xs">Código: {error.digest}</span>}
      </p>
      <div className="mt-6 flex gap-2">
        {!noExiste && <Button onClick={reset}>Reintentar</Button>}
        <Button variant="outline" render={<Link href="/inicio" />}>
          Ir al inicio
        </Button>
      </div>
    </div>
  );
}
