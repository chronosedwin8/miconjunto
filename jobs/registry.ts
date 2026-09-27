/**
 * Registro de jobs programados (sección 10 de la especificación). Cada módulo agrega aquí su job:
 * nombre, cron (zona America/Bogota) y handler. El handler recorre los conjuntos activos cuando aplica.
 */
export type JobDef = {
  name: string;
  cron: string;
  descripcion: string;
  handler: () => Promise<string | void>;
};

const jobs: JobDef[] = [];

export function defineJob(def: JobDef) {
  if (!jobs.some((j) => j.name === def.name)) jobs.push(def);
}

export function allJobs() {
  return jobs;
}
