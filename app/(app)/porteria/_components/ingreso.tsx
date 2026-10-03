"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CloudOff, Delete, Loader2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileField, SearchSelect, type Option } from "@/components/form/fields";
import { cn } from "@/lib/utils";
import { conRespaldoOffline, encolar, nuevoClienteId } from "@/lib/porteria/offline";
import { interpretarLectura } from "@/lib/porteria/codigos";
import { ingresoCodigoAction } from "../actions";
import { QrScannerDialog } from "./qr-scanner";
import { bigBtn } from "./kiosk";

/** Paso 1: escribir el código de 6 dígitos (teclado numérico grande) o escanear el QR. */
export function CodigoEntrada() {
  const router = useRouter();
  const [codigo, setCodigo] = useState("");
  const [scan, setScan] = useState(false);
  const [online, setOnline] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    if (codigo.length === 6 && online) router.push(`/porteria/ingreso?codigo=${codigo}`);
  }, [codigo, online, router]);

  const tecla = (d: string) => setCodigo((c) => (c.length < 6 ? c + d : c));
  const registrarOffline = async () => {
    await encolar({ clienteId: nuevoClienteId(), tipo: "INGRESO_CODIGO", payload: { codigo }, descripcion: `Ingreso con código ${codigo}` });
    toast.warning("Sin conexión: el ingreso quedó guardado. El código se validará al sincronizar.");
    setCodigo("");
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <Button className={cn(bigBtn, "h-20 w-full text-xl")} onClick={() => setScan(true)}>
        <QrCode className="size-8" /> Escanear QR del visitante
      </Button>
      <div className="text-center text-base font-semibold text-muted-foreground">o escribe el código de 6 dígitos</div>
      <input
        ref={inputRef}
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Código de autorización"
        placeholder="••••••"
        className="h-20 w-full rounded-2xl border-4 border-foreground/30 bg-background text-center font-mono text-5xl font-black tracking-[0.3em] outline-none focus:border-primary"
      />
      <div className="grid grid-cols-3 gap-2">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button key={d} type="button" onClick={() => tecla(d)} className="h-16 rounded-xl border-2 bg-card text-3xl font-bold active:bg-muted">
            {d}
          </button>
        ))}
        <button type="button" onClick={() => setCodigo("")} className="h-16 rounded-xl border-2 bg-card text-base font-bold active:bg-muted">
          Borrar
        </button>
        <button type="button" onClick={() => tecla("0")} className="h-16 rounded-xl border-2 bg-card text-3xl font-bold active:bg-muted">
          0
        </button>
        <button type="button" onClick={() => setCodigo((c) => c.slice(0, -1))} aria-label="Borrar un dígito" className="grid h-16 place-items-center rounded-xl border-2 bg-card active:bg-muted">
          <Delete className="size-7" />
        </button>
      </div>
      {!online && codigo.length === 6 && (
        <Button className={cn(bigBtn, "w-full bg-amber-500 text-amber-950 hover:bg-amber-400")} onClick={registrarOffline}>
          <CloudOff /> Registrar sin conexión
        </Button>
      )}
      <QrScannerDialog
        open={scan}
        onOpenChange={setScan}
        onResult={(t) => {
          setScan(false);
          const l = interpretarLectura(t);
          if (!l) return toast.error("Ese QR no es una autorización de Conjunto360.");
          router.push(l.token ? `/porteria/ingreso?token=${l.token}` : `/porteria/ingreso?codigo=${l.codigo}`);
        }}
      />
    </div>
  );
}

/** Paso 2 y 3: confirmar (datos de la autorización) → foto opcional → registrado. */
export function ConfirmarIngreso({ codigo, token, nombre, parqueaderos, placa }: { codigo?: string; token?: string; nombre: string; parqueaderos: Option[]; placa: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [foto, setFoto] = useState<string | null>(null);
  const [parq, setParq] = useState("");
  const registrar = () =>
    start(async () => {
      const r = await conRespaldoOffline(
        { tipo: "INGRESO_CODIGO", payload: { codigo, token, fotoUrl: foto ?? undefined, parqueaderoId: parq || undefined }, descripcion: `Ingreso de ${nombre}` },
        (p) => ingresoCodigoAction(p as never),
      );
      if ("offline" in r && r.offline) {
        toast.warning("Sin conexión: el ingreso quedó guardado y se sincronizará solo.");
        router.push("/porteria");
        return;
      }
      if (r.ok) {
        toast.success(`✅ Ingreso de ${nombre} registrado. El residente fue notificado.`);
        router.push("/porteria");
        router.refresh();
      } else toast.error(r.error, { duration: 10000 });
    });
  return (
    <div className="space-y-4">
      {placa && parqueaderos.length > 0 && <SearchSelect name="parqueaderoId" label="Parqueadero de visitantes (opcional)" options={parqueaderos} onChange={setParq} placeholder="Sin parqueadero" />}
      <FileField name="fotoUrl" label="Foto del visitante (opcional)" folder="porteria" onUploaded={(u) => setFoto(u[0] ?? null)} />
      <Button className={cn(bigBtn, "h-20 w-full bg-green-700 text-xl text-white hover:bg-green-800")} disabled={pending} onClick={registrar}>
        {pending ? <Loader2 className="size-7 animate-spin" /> : <CheckCircle2 className="size-7" />} Registrar ingreso
      </Button>
    </div>
  );
}

/** Selector de unidad (sin autorización previa): abre la ficha de portería de la unidad. */
export function UnidadPicker({ unidades, destino = "/porteria/unidad/", label = "Buscar la unidad que visita" }: { unidades: Option[]; destino?: string; label?: string }) {
  const router = useRouter();
  return <SearchSelect name="unidad" label={label} options={unidades} required placeholder="Toca para buscar la unidad…" onChange={(v) => v && router.push(`${destino}${v}`)} />;
}
