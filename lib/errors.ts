/** Error de negocio con mensaje apto para el usuario final. */
export class AppError extends Error {
  status: number;
  fieldErrors?: Record<string, string>;
  constructor(message: string, status = 400, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export function notFound(what = "El registro"): never {
  throw new AppError(`${what} no existe o no tienes acceso.`, 404);
}
