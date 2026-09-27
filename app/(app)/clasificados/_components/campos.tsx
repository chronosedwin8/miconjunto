import { CheckboxField, ChoiceCards, FileField, FormGrid, MoneyField, TextAreaField, TextField } from "@/components/form/fields";
import { Label } from "@/components/ui/label";
import { label } from "@/lib/labels";
import { SUBCATEGORIAS_CLASIFICADO } from "@/lib/muro/contenido";

export type ClasificadoInicial = { titulo: string; subcategoria: string | null; descripcion: string; precio: number | null; contacto: string | null; imagenes: string[]; permiteComentarios: boolean };

export function CamposClasificado({ inicial }: { inicial?: ClasificadoInicial }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>¿Qué ofreces?</Label>
        <ChoiceCards
          name="subcategoria"
          defaultValue={inicial?.subcategoria ?? "VENTA"}
          options={SUBCATEGORIAS_CLASIFICADO.map((s) => ({ value: s, label: s === "OTRO" ? "Otro" : label(s) }))}
        />
      </div>
      <TextField name="titulo" label="Título" required maxLength={120} defaultValue={inicial?.titulo} placeholder="Ej.: Bicicleta rin 20 en buen estado" />
      <TextAreaField name="descripcion" label="Descripción" required maxLength={3000} defaultValue={inicial?.descripcion} placeholder="Estado, horarios, condiciones…" />
      <FormGrid>
        <MoneyField name="precio" label="Precio (opcional)" defaultValue={inicial?.precio} />
        <TextField name="contacto" label="Contacto (opcional)" maxLength={120} defaultValue={inicial?.contacto ?? ""} placeholder="WhatsApp o “escríbeme por aquí”" />
      </FormGrid>
      <FileField name="imagenes" label="Fotos (hasta 6)" multiple folder="clasificados" defaultValue={inicial?.imagenes} />
      <CheckboxField name="permiteComentarios" label="Permitir preguntas en comentarios" defaultChecked={inicial?.permiteComentarios ?? true} />
      <p className="text-xs text-muted-foreground">La administración revisa cada clasificado antes de publicarlo. Estará visible 60 días.</p>
    </>
  );
}

export function CamposObjeto() {
  return (
    <>
      <ChoiceCards
        name="tipo"
        defaultValue="PERDIDO"
        options={[
          { value: "PERDIDO", label: "Perdí algo", description: "Pide ayuda a los vecinos" },
          { value: "ENCONTRADO", label: "Encontré algo", description: "Ayuda a devolverlo" },
        ]}
      />
      <TextAreaField name="descripcion" label="¿Qué es?" required maxLength={500} placeholder="Ej.: Llaves con llavero rojo, gato gris con collar azul…" rows={2} />
      <FormGrid>
        <TextField name="lugar" label="Lugar" maxLength={120} placeholder="Parque infantil, sótano 1…" />
        <TextField name="fecha" label="Fecha" type="date" />
      </FormGrid>
      <FileField name="fotoUrl" label="Foto (opcional)" folder="perdidos" />
      <TextField name="contacto" label="Contacto (opcional)" maxLength={120} placeholder="Portería, WhatsApp…" />
    </>
  );
}

