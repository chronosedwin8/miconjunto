# Facturación electrónica (Factus / Alanube)

**Regla DIAN (spec §5.13, §15):** solo se factura el alquiler **gravado** de zonas comunes (zona con tarifa > 0 y
`generaFactura`) y el parqueadero de visitantes (`PARQUEADERO`). Cuotas de administración, extraordinarias,
intereses y multas **nunca** se facturan (`debeFacturar` en `lib/facturacion/payload.ts`). El depósito de una
reserva es una garantía y tampoco se factura.

## Flujo

1. `pago.aprobado` confirma la reserva y llama `encolarFacturaReserva` → `FacturaElectronica` **PENDIENTE**
   (`referenceCode = RES-<reservaId>`, único) con una instantánea de los datos (cliente, ítem, medio de pago).
   El pago nunca espera a la DIAN.
2. Se intenta emitir en segundo plano y el job `facturacion-pendiente` (cada 5 min) procesa lo que quede:
   claim atómico `PENDIENTE|ERROR → EN_PROCESO`, reintentos con backoff exponencial (2^intentos min, máx. 6),
   filas atascadas en `EN_PROCESO` > 10 min se recuperan.
3. `VALIDADA`: guarda `numero`, `cufe`, `validadaEn`, `urlPublica`, `qr`, advertencias DIAN; descarga PDF y XML
   (base64), los guarda con `saveFile` (carpeta `facturas`), los adjunta al **Pago** y a la factura (`Adjunto`) y
   los envía por correo al residente. Emite `factura.validada`.
4. `ERROR`: guarda `errores { mensaje, detalle, reintentable }`; si no es reintentable (p. ej. 422 de validación)
   notifica a quienes tienen `facturacion.emitir`.
5. **Nota crédito** (`emitirNotaCredito`, `NC-<referenceCode>`, concepto 2 = anulación): al cancelar una reserva
   pagada con reembolso o manualmente desde el panel. Al validarse, la factura original queda `ANULADA`.

## Proveedores (`ElectronicInvoiceProvider`)

```ts
emitirFactura(datos) · notaCredito(datos) · descargarPdf(numero) · descargarXml(numero) · eliminarPendiente(referenceCode)
```

| Proveedor | Cuándo | Archivo |
|---|---|---|
| `SIMULADO` | Por defecto (demo) o si el proveedor elegido no tiene credenciales completas | `lib/facturacion/simulado.ts` — número `SETP-990000xxx`, CUFE SHA-384 simulado, PDF propio marcado **"SIMULACIÓN — sin validez fiscal"** (si se generó fuera de Next, el PDF se crea al descargarlo) |
| `FACTUS` | `config.facturacion.proveedor = "FACTUS"` + credenciales | `lib/facturacion/factus.ts` (completo) |
| `ALANUBE` | `config.facturacion.proveedor = "ALANUBE"` + credenciales | `lib/facturacion/alanube.ts` (estructura REST v1.0-COL preparada) |

### Configurar Factus real

1. Solicita a Factus las credenciales de API (sandbox: `https://api-sandbox.factus.com.co`, producción: `https://api.factus.com.co`).
2. En **Configuración → Integraciones → FACTUS** registra: URL base, Client ID, Client secret, usuario (correo), contraseña e ID del rango de numeración. Se guardan cifradas (AES-256-GCM) y tienen prioridad sobre `.env` (`FACTUS_*`).
3. En **Configuración → Parámetros** (JSON `Conjunto.config.facturacion`): `{ "proveedor": "FACTUS", "numberingRangeId": <id> }`. Opcional: `numberingRangeNotaCreditoId` para el rango de notas crédito (si hay varios rangos activos).
4. Verifica que el conjunto tenga NIT y municipio DIVIPOLA (`Conjunto.municipioCodigo`); se usa como `municipality_code` del cliente.
5. Marca en cada zona con cobro: **grava IVA** (tarifa, por defecto 19 %) y **genera factura electrónica**.

Detalles de la integración (API v2, ver `docs/integraciones/factus-skill.md`, descargada de la documentación oficial):

- Token: `POST {baseUrl}/oauth/token` form-data (`grant_type=password`, `client_id`, `client_secret`, `username`, `password`) → `access_token` (1 h) + `refresh_token`; cacheado por conjunto y renovado con `grant_type=refresh_token`; un 401 fuerza renovación.
- Factura: `POST /v2/bills/validate` con `construirPayloadFactus` (función pura, probada): `reference_code`, `document "01"`, `numbering_range_id`, `operation_type "10"`, `payment_details [{ payment_form "1", payment_method_code, amount }]`, `cash_rounding_amount` si el IVA al peso de cartera difiere del de Factus, `customer` (`identification_document_code` CC→13, CE→22, TI→12, RC→11, PA→41, NIT→31, PEP→47, PPT→48; `legal_organization_code` "2" persona natural / "1" con NIT; `tribute_code "ZZ"`, `responsibilities ["R-99-PN"]`, `municipality_code`), `items [{ code_reference, name = nombre de la zona, quantity "1.00", price = base sin IVA, unit_measure_code "94", standard_code "999", taxes [{ code "01", rate "19.00" }] }]`.
- Métodos de pago: PSE/Nequi/Bancolombia QR/transferencia → 47, tarjeta crédito 48, débito 49, consignación 42, efectivo 10.
- **Nota:** la tarea original mencionaba `municipality_id`, `standard_code_id` e `is_excluded 0` (API v1). Se implementó la **v2 vigente** según la skill oficial: `municipality_code`, `standard_code` y `taxes[].is_excluded` (booleano, solo en ítems excluidos).
- Nota crédito: `POST /v2/credit-notes/validate` (`correction_concept_code "2"`, `customization_id "20"`, `bill_number`).
- Descargas: `GET /v2/bills/{number}/download-pdf|download-xml` (respaldo `/v2/bills/download-pdf/{number}`), contenido en base64.
- Errores: reintentos con backoff para red/429/5xx; **409** (documento pendiente por enviar a la DIAN) → `DELETE /v2/bills/destroy/reference/{reference_code}` y se reintenta.

### Configurar Alanube

Configuración → Integraciones → ALANUBE: `baseUrl` (p. ej. `https://sandbox.alanube.co/col/v1`) y `token` (Bearer); `config.facturacion.proveedor = "ALANUBE"`. El adaptador usa `POST /invoices`, `POST /credit-notes`, `GET /invoices/{id}/pdf|xml`, `DELETE /invoices/reference/{ref}` con el payload de `construirPayloadAlanube`. **Pendiente**: validar nombres exactos de rutas/campos contra el sandbox (documentación `https://developer.alanube.co/v1.0-COL/`); el MCP de Alanube no se usa desde la app.

## Tablas de referencia

`lib/facturacion/referencia.ts` carga en `TablaReferencia` (fuente `FACTUS`): métodos y formas de pago, unidades de medida, tributos, impuestos, estándar de producto, organizaciones, responsabilidades, documentos de identidad, conceptos de nota crédito y municipios (Barranquilla 08001, Bogotá 11001, Medellín 05001, Cali 76001, Cartagena, Bucaramanga, Soledad, Puerto Colombia). Se sincroniza en el seed (`sincronizarTablasReferencia`).

## Panel

- `/facturacion` — indicadores (validadas, pendientes, con error, IVA del mes), filtros por estado/tipo, búsqueda, exportación (`/api/export/facturas`). Residentes: solo facturas de sus unidades.
- `/facturacion/[id]` — detalle con payload enviado, respuesta y errores DIAN; reintentar, reenviar correo, PDF/XML, nota crédito.
- `/facturacion/reporte?mes=AAAA-MM` — ingresos por alquiler con **base gravable e IVA** por zona y movimiento (notas crédito restan); Excel para el contador (`/api/export/ingresos-alquiler?mes=`).
- Descargas: `/api/facturacion/:id/pdf` y `/api/facturacion/:id/xml`.

Permisos: `facturacion.ver`, `facturacion.emitir` (reintentar/reenviar), `facturacion.anular` (nota crédito), `facturacion.exportar` (reporte).
