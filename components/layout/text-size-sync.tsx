"use client";

import { useEffect } from "react";

/** Aplica el modo "texto grande" (accesibilidad para adultos mayores) al elemento <html>. */
export function TextSizeSync({ large }: { large: boolean }) {
  useEffect(() => {
    document.documentElement.classList.toggle("texto-grande", large);
  }, [large]);
  return null;
}
