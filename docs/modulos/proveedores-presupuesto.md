# Proveedores, contratos, presupuesto, gastos y empleados (Fase 10)

## Proveedores y contratos (`/proveedores`)

- **Proveedores**: NIT (único por conjunto, formato `900123456-7`), razón social, categoría (sugeridas: ascensores, aseo, vigilancia, plomería, electricidad, jardinería…), contacto, tarifas publicadas, **directorio comunitario** + beneficio para residentes, usuario de acceso (rol Proveedor) y estado. La calificación promedio la alimenta el módulo de directorio (`CalificacionProveedor`); aquí se muestra con las opiniones.
- **Documentos** con vencimiento (RUT, cámara de comercio, póliza, seguridad social, certificación): semáforo vencido / por vencer (30 días) / vigente. Pestaña *Documentos* con los que vencen en 60 días.
- **Contratos**: objeto, valor, inicio/fin, renovación automática, días de alerta, documento. Estado calculado: `VENCIDO` (fin pasado), `POR_VENCER` (faltan ≤ días de alerta), `VIGENTE`; `TERMINADO` es manual. El job diario de vencimientos persiste el estado y **renueva** los automáticos por el mismo periodo (auditado y notificado).
- **Desempeño** (12 meses): órdenes asignadas/cerradas, % a tiempo (cierre ≤ programada + 3 días), costo, calificación.
- Exportaciones: `proveedores`, `contratos`.

## Presupuesto y gastos (`/presupuesto`)

- **Presupuesto anual** (`Presupuesto` único por año): se crea vacío o copiando los rubros de otro año con un % de incremento. Estados BORRADOR → APROBADO (permiso `presupuesto.aprobar_gastos`, con nota de acta) → CERRADO.
- **Rubros** de ingreso y gasto con cuenta contable (PUC) y valor anual.
- **Ejecución**: gastos APROBADOS o PAGADOS por mes y rubro; ingresos = **pagos aplicados** (`AplicacionPago` de pagos APROBADOS, por fecha del pago) agrupados por el concepto de la cuota y relacionados al rubro por **cuenta contable** (fallback por nombre). Solo lectura sobre cartera. Muestra % anual, % a la fecha (presupuesto × meses transcurridos / 12), alertas (gasto > 110 % a la fecha, ingreso < 90 %), resultado del año y gráficos por mes y por rubro.
- **Gastos**: registro manual (queda `PENDIENTE_APROBACION` y se avisa a quien tenga `presupuesto.aprobar_gastos`) o automático al cerrar una orden de trabajo con costo. Flujo: PENDIENTE_APROBACION → APROBADO / RECHAZADO → PAGADO (con comprobante). Todo cambio queda en auditoría y emite `gasto.aprobado|rechazado|pagado`. Solo se editan/eliminan pendientes o rechazados.
- Exportaciones genéricas: `gastos`, `presupuesto` (ejecución por rubro).

### Exportación contable (`/presupuesto/exportacion`, permiso `presupuesto.exportar`)

Descarga: `GET /presupuesto/exportacion/descargar?software=SIIGO|WORLD_OFFICE|ALEGRA|HELISA&formato=csv|xlsx&desde=AAAA-MM-DD&hasta=…&estado=APROBADO|PAGADO&cuentaBancos&cuentaPorPagar&centroCosto&comprobanteEgreso&comprobanteCausacion`.

Cada gasto genera dos líneas cuadradas:

| Gasto | Débito | Crédito | Comprobante |
|---|---|---|---|
| APROBADO (causación) | cuenta del gasto (o del rubro, o 519595) | cuentas por pagar `233595` | `NC` |
| PAGADO (egreso) | cuenta del gasto | bancos `111005` | `CE` |

Tercero: NIT del proveedor (sin DV; Helisa trae columna DV) o el NIT del conjunto. Sin retenciones (el contador las ajusta).

| Software | Separador | Fecha | Columnas principales |
|---|---|---|---|
| Siigo Nube | `;` | DD/MM/AAAA | Tipo de comprobante, Consecutivo comprobante, Fecha de elaboración, Código cuenta contable, Identificación tercero, Sucursal, Descripción, Código centro/subcentro de costos, Débito, Crédito, Observaciones |
| World Office | `;` | DD/MM/AAAA | Encab: Empresa/Tipo Documento/Prefijo/Documento Número/Fecha/Tercero Interno/Tercero Externo/Nota, Doc Contable: Cuenta Contable/Nota/Tercero/Centro costos/Débito/Crédito |
| Alegra | `,` | AAAA-MM-DD | Fecha, Número de comprobante, Tipo de comprobante, Código cuenta contable, Identificación tercero, Nombre tercero, Descripción, Centro de costo, Débito, Crédito |
| Helisa | `;` | AAAAMMDD | Tipo comprobante, Número comprobante, Fecha, Cuenta, NIT, DV, Detalle, Centro de costo, Débito, Crédito, Base |

CSV en UTF-8 con BOM y CRLF; también Excel. Además: **presupuesto mensualizado** (cuenta, rubro, 12 meses, total) con `tipo=presupuesto&anio=`.

## Empleados (`/empleados`)

Personal del conjunto sin nómina: nombre, documento, cargo, turno, teléfono, foto (para portería), EPS y ARL con vencimiento, fecha de ingreso, documentos, activo/retirado. Semáforo de seguridad social; alertas en el job diario de vencimientos (`empleados.editar`). Portería tiene `empleados.ver` por defecto; `empleadosParaPorteria(ctx)` en `lib/empleados/service.ts` da la lista con foto. Exportación `empleados`.

## API REST

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| GET | `/api/v1/proveedores` | `proveedores.ver` | `q, categoria, directorio=si\|no, estado=inactivos\|todos, take, skip` |
| POST | `/api/v1/proveedores` | `proveedores.crear` | `{ nit, razonSocial, categoria, contactoNombre?, telefono?, email?, direccion?, tarifas?, directorioComunitario?, beneficioComunidad?, activo? }` |
| GET | `/api/v1/proveedores/:id` | `proveedores.ver` | ficha con documentos, contratos, calificaciones, órdenes y desempeño |
