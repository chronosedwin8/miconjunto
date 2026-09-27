"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, LogOut, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { conRespaldoOffline } from "@/lib/porteria/offline";
import { ingresoManualAction, salidaAction } from "../actions";
import { bigBtn } from "./kiosk";

export function PlacaBuscar({ inicial }: { inicial?: string }) {
  const router = useRouter();
  const [placa, setPlaca] = useState(inicial ?? "");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const p = placa.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (p.length >= 3) router.push(`/porteria/vehiculo?placa=${p}`);
      }}
    >
      <input
        value={placa}
        onChange={(e) => setPlaca(e.target.value.toUpperCase())}
        placeholder="ABC123"
        aria-label="Placa del vehículo"
        autoCapitalize="characters"
        autoFocus={!inicial}
        className="h-16 min-w-0 flex-1 rounded-xl border-4 border-foreground/30 bg-background px-4 text-center font-mono text-3xl font-black uppercase tracking-widest outline-none focus:border-primary"
      />
      <Button type="submit" className={cn(bigBtn, "h-16")}>
        <Search /> Buscar
      </Button>
    </form>
  );
}

/** Ingreso / salida de un vehículo de residente (queda en la bitácora, no en "adentro"). */
export function VehiculoResidente({ placa, unidadId, unidad }: { placa: string; unidadId: string; unidad: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (tipo: "INGRESO" | "SALIDA") =>
    start(async () => {
      const payload = { sujeto: "RESIDENTE", nombre: `Vehículo ${placa} (${unidad})`, unidadId, placa };
      const r =
        tipo === "INGRESO"
          ? await conRespaldoOffline({ tipo: "INGRESO_MANUAL", payload, descripcion: `Ingreso vehículo ${placa}` }, (p) => ingresoManualAction(p as never))
          : await conRespaldoOffline({ tipo: "SALIDA", payload, descripcion: `Salida vehículo ${placa}` }, (p) => salidaAction(p as never));
      if ("offline" in r && r.offline) return void toast.warning("Sin conexión: quedó guardado para sincronizar.");
      if (r.ok) {
        toast.success(`${tipo === "INGRESO" ? "Ingreso" : "Salida"} de ${placa} registrado`);
        router.push("/porteria");
      } else toast.error(r.error);
    });
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button className={cn(bigBtn, "bg-green-700 text-white hover:bg-green-800")} disabled={pending} onClick={() => run("INGRESO")}>
        {pending ? <Loader2 className="animate-spin" /> : <LogIn />} Entra
      </Button>
      <Button className={bigBtn} variant="outline" disabled={pending} onClick={() => run("SALIDA")}>
        <LogOut /> Sale
      </Button>
    </div>
  );
}
