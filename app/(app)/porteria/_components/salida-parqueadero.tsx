"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SalidaDialog, type AdentroVista } from "./panel";

export function SalidaParqueadero({ item }: { item: AdentroVista }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="mt-1 h-12 text-base font-bold" onClick={() => setOpen(true)}>
        <LogOut /> Salida
      </Button>
      <SalidaDialog item={open ? item : null} onClose={() => setOpen(false)} />
    </>
  );
}
