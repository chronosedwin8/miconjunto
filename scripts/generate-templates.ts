/** Genera las plantillas Excel de importación en public/plantillas/. */
import ExcelJS from "exceljs";
import fs from "node:fs";
import { TIPOS_IMPORTACION } from "../lib/importacion/service";

async function main() {
  fs.mkdirSync("public/plantillas", { recursive: true });
  for (const [tipo, def] of Object.entries(TIPOS_IMPORTACION)) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Conjunto360";
    const ws = wb.addWorksheet("Datos");
    ws.columns = def.columnas.map((c) => ({ header: c, key: c, width: Math.max(14, c.length + 4) }));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    for (const row of def.ejemplo) ws.addRow([...row]);
    ws.views = [{ state: "frozen", ySplit: 1 }];
    const inst = wb.addWorksheet("Instrucciones");
    inst.getColumn(1).width = 110;
    [
      `Plantilla de importación: ${def.titulo}`,
      "",
      "1. Diligencie una fila por registro en la hoja 'Datos'. No cambie los nombres de las columnas.",
      `2. Columnas obligatorias: ${def.requeridas.join(", ")}.`,
      "3. Fechas en formato AAAA-MM-DD. Valores en pesos sin puntos ni signos (ej. 390000).",
      "4. Para columnas SI/NO escriba SI o NO.",
      "5. Borre las filas de ejemplo antes de cargar el archivo.",
      "6. Al cargar, el sistema valida fila por fila y le permite descargar el reporte de errores.",
    ].forEach((t, i) => {
      inst.getCell(`A${i + 1}`).value = t;
      if (i === 0) inst.getCell("A1").font = { bold: true, size: 14 };
    });
    await wb.xlsx.writeFile(`public/plantillas/${def.plantilla}`);
    console.log("✔", tipo, def.plantilla);
  }
}
main();
