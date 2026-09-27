"use client";

import { useEffect, useRef } from "react";
import { Bold, Italic, Link2, List, ListOrdered, Underline } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROSE } from "./prose";

/**
 * Editor de texto enriquecido liviano (negrita, cursiva, subrayado, listas, enlaces).
 * Solo produce HTML básico; el servidor lo sanitiza siempre con sanitize-html.
 */
export function EditorTexto({
  value,
  onChange,
  placeholder = "Escribe aquí…",
  variables,
  minHeight = 120,
  ariaLabel = "Texto",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Botones para insertar variables tipo {{nombre}}. */
  variables?: { clave: string; descripcion: string }[];
  minHeight?: number;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inicial = useRef(value);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== inicial.current) ref.current.innerHTML = inicial.current;
  }, []);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current?.innerHTML ?? "");
  };

  const btn = "grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <div className="rounded-lg border border-input bg-background focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <div className="flex flex-wrap items-center gap-0.5 border-b px-1 py-1" role="toolbar" aria-label="Formato">
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("bold")} aria-label="Negrita" title="Negrita">
          <Bold className="size-4" />
        </button>
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("italic")} aria-label="Cursiva" title="Cursiva">
          <Italic className="size-4" />
        </button>
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("underline")} aria-label="Subrayado" title="Subrayado">
          <Underline className="size-4" />
        </button>
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertUnorderedList")} aria-label="Lista con viñetas" title="Lista">
          <List className="size-4" />
        </button>
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec("insertOrderedList")} aria-label="Lista numerada" title="Lista numerada">
          <ListOrdered className="size-4" />
        </button>
        <button
          type="button"
          className={btn}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const url = window.prompt("Dirección del enlace (https://…)");
            if (url && /^(https?:\/\/|mailto:|tel:)/i.test(url.trim())) exec("createLink", url.trim());
          }}
          aria-label="Insertar enlace"
          title="Enlace"
        >
          <Link2 className="size-4" />
        </button>
        {variables?.length ? (
          <div className="ml-auto flex flex-wrap gap-1 pr-1">
            {variables.map((v) => (
              <button
                key={v.clave}
                type="button"
                title={v.descripcion}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => exec("insertText", `{{${v.clave}}}`)}
                className="h-8 rounded-full border px-2.5 font-mono text-xs hover:bg-muted"
              >
                {`{{${v.clave}}}`}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
        onBlur={() => onChange(ref.current?.innerHTML ?? "")}
        onPaste={(e) => {
          // Pegar como texto plano evita estilos ajenos (Word, correos).
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        className={cn(
          PROSE,
          "max-w-none px-3 py-2 text-base outline-none md:text-sm",
          "empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]",
        )}
        style={{ minHeight }}
      />
    </div>
  );
}
