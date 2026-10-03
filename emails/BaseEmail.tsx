import * as React from "react";
import { Body, Button, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import { render } from "@react-email/render";

export type BaseEmailProps = {
  titulo: string;
  conjuntoNombre?: string;
  color?: string;
  parrafos: string[];
  boton?: { texto: string; url: string };
  pie?: string;
};

export function BaseEmail({ titulo, conjuntoNombre = "Conjunto360", color = "#0f766e", parrafos, boton, pie }: BaseEmailProps) {
  return (
    <Html lang="es">
      <Head />
      <Preview>{titulo}</Preview>
      <Body style={{ backgroundColor: "#f4f4f5", fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, maxWidth: 560, margin: "0 auto", overflow: "hidden" }}>
          <Section style={{ backgroundColor: color, padding: "18px 24px" }}>
            <Text style={{ color: "#ffffff", fontSize: 18, fontWeight: 700, margin: 0 }}>{conjuntoNombre}</Text>
          </Section>
          <Section style={{ padding: "8px 24px 24px" }}>
            <Text style={{ fontSize: 20, fontWeight: 700, color: "#18181b" }}>{titulo}</Text>
            {parrafos.map((p, i) => (
              <Text key={i} style={{ fontSize: 15, lineHeight: "22px", color: "#3f3f46", whiteSpace: "pre-line" }}>
                {p}
              </Text>
            ))}
            {boton ? (
              <Button
                href={boton.url}
                style={{ backgroundColor: color, color: "#fff", padding: "12px 20px", borderRadius: 8, fontWeight: 700, fontSize: 15 }}
              >
                {boton.texto}
              </Button>
            ) : null}
            <Hr style={{ margin: "24px 0 12px", borderColor: "#e4e4e7" }} />
            <Text style={{ fontSize: 12, color: "#71717a" }}>
              {pie ?? "Este mensaje fue enviado por Conjunto360 en nombre de la administración de tu copropiedad."}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export async function renderBaseEmail(props: BaseEmailProps) {
  return render(<BaseEmail {...props} />);
}
