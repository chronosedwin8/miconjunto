"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActionForm, type AnyAction } from "@/components/form/action-form";

/** Botón que abre un formulario en diálogo (hoja inferior en el teléfono). Se cierra al guardar. */
export function FormDialog({
  titulo,
  descripcion,
  action,
  children,
  trigger,
  triggerLabel = "Nuevo",
  triggerVariant = "default",
  triggerSize,
  submitLabel = "Guardar",
  successMessage = "Guardado",
  extra,
  redirectTo,
  wide,
  confirm,
}: {
  titulo: string;
  descripcion?: string;
  action: AnyAction;
  children: React.ReactNode;
  trigger?: React.ReactNode;
  triggerLabel?: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  submitLabel?: string;
  successMessage?: string;
  extra?: Record<string, unknown>;
  redirectTo?: string;
  wide?: boolean;
  confirm?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {trigger ? (
        <span onClick={() => setOpen(true)} className="contents">
          {trigger}
        </span>
      ) : (
        <Button variant={triggerVariant} size={triggerSize} onClick={() => setOpen(true)}>
          {triggerVariant === "default" && <Plus />} {triggerLabel}
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={`max-h-[92dvh] overflow-y-auto max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}
        >
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            {descripcion && <DialogDescription>{descripcion}</DialogDescription>}
          </DialogHeader>
          <ActionForm
            action={action}
            extra={extra}
            submitLabel={submitLabel}
            successMessage={successMessage}
            redirectTo={redirectTo}
            confirm={confirm}
            submitClassName="w-full"
            onDone={() => setOpen(false)}
          >
            {children}
          </ActionForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
