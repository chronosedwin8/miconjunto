import { backupConjunto } from "@/lib/backups/service";
import { conjuntosActivos } from "./definitions";
import { defineJob } from "./registry";

defineJob({
  name: "backup-tenants",
  cron: "0 3 * * *",
  descripcion: "Backup lógico diario por conjunto (JSON comprimido en el almacenamiento)",
  handler: async () => {
    const cs = await conjuntosActivos();
    let ok = 0;
    for (const c of cs) {
      try {
        await backupConjunto(c.id);
        ok++;
      } catch (e) {
        console.error(`[backup] ${c.nombre}:`, (e as Error).message);
      }
    }
    return `${ok}/${cs.length} conjuntos respaldados`;
  },
});
