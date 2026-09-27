import { describe, expect, it } from "vitest";
import { can, DEFAULT_ROLE_PERMS, ALL_PERMS, seesAll } from "@/lib/permisos";

const user = (rol: keyof typeof DEFAULT_ROLE_PERMS, unidadIds: string[] = []) => ({
  esSuperAdmin: false,
  permisos: new Set<string>(DEFAULT_ROLE_PERMS[rol]),
  unidadIds,
  userId: `u-${rol}`,
  rolBase: rol,
});

describe("permisos por rol", () => {
  it("el administrador tiene todos los permisos del catálogo", () => {
    expect(DEFAULT_ROLE_PERMS.ADMINISTRADOR.length).toBe(ALL_PERMS.length);
  });

  it("el residente no ve información financiera ni cartera ajena", () => {
    const r = user("RESIDENTE");
    expect(can(r, "cartera.ver")).toBe(false);
    expect(can(r, "cartera.ver_todos")).toBe(false);
    expect(can(r, "pagos.pagar")).toBe(false);
    expect(can(r, "votaciones.votar")).toBe(false);
    expect(can(r, "tickets.crear")).toBe(true);
    expect(can(r, "reservas.crear")).toBe(true);
  });

  it("el propietario paga, pide paz y salvo y vota", () => {
    const p = user("PROPIETARIO");
    expect(can(p, "pagos.pagar")).toBe(true);
    expect(can(p, "paz_y_salvo.solicitar")).toBe(true);
    expect(can(p, "votaciones.votar")).toBe(true);
    expect(can(p, "configuracion.ver")).toBe(false);
  });

  it("portería no ve teléfonos personales ni anula bitácora por defecto", () => {
    const p = user("PORTERIA");
    expect(can(p, "porteria.registrar")).toBe(true);
    expect(can(p, "campos.persona_telefono")).toBe(false);
    expect(can(p, "porteria.anular")).toBe(false);
    expect(can(p, "cartera.ver_todos")).toBe(false);
  });

  it("revisor fiscal es de solo lectura sobre cartera", () => {
    const r = user("REVISOR_FISCAL");
    expect(can(r, "cartera.ver_todos")).toBe(true);
    expect(can(r, "cartera.crear")).toBe(false);
    expect(can(r, "pagos.registrar")).toBe(false);
  });

  it("el consejo aprueba multas pero no configura el sistema", () => {
    const c = user("CONSEJO");
    expect(can(c, "convivencia.decidir")).toBe(true);
    expect(can(c, "configuracion.editar")).toBe(false);
    expect(can(c, "porteria.ver")).toBe(false);
  });

  it("un recurso ajeno se niega a quien no tiene ver_todos", () => {
    const p = user("PROPIETARIO", ["unidad-A"]);
    expect(can(p, "tickets.ver", { unidadId: "unidad-A" })).toBe(true);
    expect(can(p, "tickets.ver", { unidadId: "unidad-B" })).toBe(false);
    expect(seesAll(p, "tickets")).toBe(false);
    const admin = user("ADMINISTRADOR");
    expect(can(admin, "tickets.ver", { unidadId: "unidad-B" })).toBe(true);
  });

  it("superadmin puede todo", () => {
    expect(can({ esSuperAdmin: true, permisos: new Set(), unidadIds: [], userId: "s", rolBase: "ADMINISTRADOR" }, "configuracion.roles")).toBe(true);
  });
});
