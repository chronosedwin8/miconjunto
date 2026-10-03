"use client";

import { useState } from "react";
import { HandHelping, Lock, SearchX } from "lucide-react";
import type { CategoriaObjeto } from "@prisma/client";
import { ActionForm, useFieldError } from "@/components/form/action-form";
import { CheckboxField, ChoiceCards, FileField, FormGrid, SelectField, TextAreaField, TextField, type Option } from "@/components/form/fields";
import { CATEGORIAS_OBJETO, CATEGORIA_INFO, LUGARES_CUSTODIA } from "@/lib/objetos-perdidos/reglas";
import { cn } from "@/lib/utils";
import { reportarObjetoAction } from "../actions";
import { ICONO_CATEGORIA } from "../_components/iconos";

const COLORES = ["Negro", "Blanco", "Gris", "Plateado", "Azul", "Rojo", "Verde", "Amarillo", "Naranja", "Café", "Rosado", "Morado", "Dorado", "Beige", "Multicolor"];

function SelectorCategoria({ value, onChange }: { value: CategoriaObjeto; onChange: (c: CategoriaObjeto) => void }) {
  const error = useFieldError("categoria");
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1.5 text-sm font-medium">Categoría</legend>
      <div className="grid grid-cols-4 gap-2" role="radiogroup">
        {CATEGORIAS_OBJETO.map((c) => {
          const I = ICONO_CATEGORIA[c];
          return (
            <label
              key={c}
              className={cn(
                "flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border p-1.5 text-center text-[11px] leading-tight",
                value === c ? "border-primary bg-primary/10 font-semibold text-primary ring-2 ring-primary/30" : "hover:bg-muted",
              )}
            >
              <input type="radio" name="categoria" value={c} checked={value === c} onChange={() => onChange(c)} className="sr-only" />
              <I className="size-5" aria-hidden="true" />
              {CATEGORIA_INFO[c].label}
            </label>
          );
        })}
      </div>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </fieldset>
  );
}

export function ReporteForm({
  tipoInicial,
  zonas,
  telefono,
  gestor,
  custodiaInicial,
  hoy,
}: {
  tipoInicial: "PERDIDO" | "ENCONTRADO";
  zonas: Option[];
  telefono: string | null;
  gestor: boolean;
  custodiaInicial: string | null;
  hoy: string;
}) {
  const [tipo, setTipo] = useState(tipoInicial);
  const [categoria, setCategoria] = useState<CategoriaObjeto>("OTRO");
  const [mostrarContacto, setMostrarContacto] = useState(false);
  const perdido = tipo === "PERDIDO";

  return (
    <ActionForm action={reportarObjetoAction} submitLabel="Publicar reporte" successMessage="Reporte publicado" redirectTo="/objetos-perdidos/{id}" submitClassName="w-full h-12 text-base">
      <ChoiceCards
        name="tipo"
        defaultValue={tipoInicial}
        onChange={(v) => setTipo(v as "PERDIDO" | "ENCONTRADO")}
        options={[
          { value: "PERDIDO", label: "Perdí algo", description: "Pide ayuda a vecinos y portería", icon: <SearchX className="size-4 text-destructive" /> },
          { value: "ENCONTRADO", label: "Encontré algo", description: "Ayuda a devolverlo", icon: <HandHelping className="size-4 text-success" /> },
        ]}
      />

      <SelectorCategoria value={categoria} onChange={setCategoria} />

      <TextField name="titulo" label="¿Qué es?" required maxLength={80} placeholder={`Ej.: ${CATEGORIA_INFO[categoria].ejemplo}`} />
      <TextAreaField
        name="descripcion"
        label="Descripción"
        required
        maxLength={600}
        rows={3}
        placeholder={perdido ? "Cómo es, qué tenía, cuándo lo viste por última vez…" : "Cómo es y en qué estado lo encontraste…"}
      />

      <FormGrid>
        <TextField name="color" label="Color" maxLength={40} list="op-colores" placeholder="Ej.: Negro" />
        <TextField name="marca" label="Marca" maxLength={60} placeholder="Ej.: Apple, GW, Totto" />
      </FormGrid>
      <datalist id="op-colores">
        {COLORES.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <FormGrid>
        {zonas.length > 0 && <SelectField name="zonaId" label={perdido ? "¿Dónde crees que se perdió?" : "¿Dónde lo encontraste?"} options={zonas} placeholder="Zona (opcional)" />}
        <TextField name="lugar" label="Lugar exacto" maxLength={120} placeholder="Ej.: banca junto al parque infantil" />
      </FormGrid>
      <TextField name="fecha" label={perdido ? "¿Cuándo?" : "¿Cuándo lo encontraste?"} type="date" defaultValue={hoy} max={hoy} />

      <FileField name="fotos" label={perdido ? "Fotos (si tienes una del objeto)" : "Fotos del objeto"} multiple capture={false} folder="objetos-perdidos" hint="Hasta 6 fotos. Puedes tomarlas con la cámara o elegirlas de la galería." />

      <div className="space-y-1.5 rounded-xl border border-dashed bg-muted/30 p-3">
        <TextAreaField
          name="rasgosPrivados"
          label={
            <span className="inline-flex items-center gap-1.5">
              <Lock className="size-3.5" /> {perdido ? "Detalles que solo tú conoces" : "Detalles para verificar al dueño"}
            </span>
          }
          maxLength={600}
          rows={2}
          placeholder={perdido ? "Ej.: el forro tiene una foto de mi hija; la llave del carro es Mazda." : "Ej.: qué tiene adentro, nombre en el documento, fondo de pantalla."}
          hint="No se publica. Solo lo ven portería y administración para confirmar quién es el dueño."
        />
      </div>

      {perdido && <TextField name="recompensa" label="Recompensa (opcional)" maxLength={120} placeholder="Ej.: $50.000 o un detalle" />}

      <CheckboxField
        name="mostrarContacto"
        label="Mostrar un dato de contacto a los vecinos"
        hint="Si no lo marcas, te contactarán a través de la app, portería o administración."
        onChange={(e) => setMostrarContacto(e.currentTarget.checked)}
      />
      {mostrarContacto && <TextField name="contacto" label="Contacto visible" maxLength={120} defaultValue={telefono ?? ""} placeholder="WhatsApp, apartamento…" />}

      {gestor && !perdido && (
        <>
          <TextField
            name="custodia"
            label="Queda guardado en"
            list="op-custodia"
            maxLength={120}
            defaultValue={custodiaInicial ?? ""}
            placeholder="Portería principal"
            hint="Déjalo vacío si el objeto sigue en manos de quien lo encontró."
          />
          <datalist id="op-custodia">
            {LUGARES_CUSTODIA.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </>
      )}
    </ActionForm>
  );
}
