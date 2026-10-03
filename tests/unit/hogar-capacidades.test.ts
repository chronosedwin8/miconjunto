import { describe, expect, it } from "vitest";
import { ALL_PERMS, defaultPermsFor } from "@/lib/permisos/catalog";
import {
  CAPACIDADES,
  CAPACIDAD_KEYS,
  PERMISOS_SIEMPRE,
  PRESETS,
  PRESET_KEYS,
  capacidadesOtorgables,
  esVinculoTitular,
  excedentes,
  normalizarCapacidades,
  nuncaDerivable,
  permisosDeCapacidades,
  presetPara,
  resolverAcceso,
  type VinculoCtx,
} from "@/lib/hogar/capacidades";

const rol = (r: string) => new Set<string>(defaultPermsFor(r));
const v = (over: Partial<VinculoCtx> = {}): VinculoCtx => ({
  unidadId: "u1",
  personaId: "p1",
  tipo: "FAMILIAR",
  derivadoDeId: "tit",
  capacidadesHogar: ["visitantes", "paquetes"],
  accesoPausado: false,
  derivadoDe: { estado: "ACTIVO", accesoPausado: false },
  ...over,
});

describe("capacidades del hogar: catálogo", () => {
  it("cada capacidad mapea a permisos existentes del catálogo", () => {
    for (const k of CAPACIDAD_KEYS) {
      for (const p of CAPACIDADES[k].permisos) expect(ALL_PERMS).toContain(p);
      for (const p of CAPACIDADES[k].requiere) expect(ALL_PERMS).toContain(p);
    }
  });

  it("ninguna capacidad otorga votar, invitar, administrar cartera ni ver todo", () => {
    const todos = permisosDeCapacidades(CAPACIDAD_KEYS);
    for (const p of todos) expect(nuncaDerivable(p), p).toBe(false);
    for (const prohibido of ["votaciones.votar", "residentes.invitar", "residentes.crear", "cartera.ver_todos", "cartera.generar", "asambleas.poderes", "configuracion.roles"]) {
      expect(todos.has(prohibido as never)).toBe(false);
      expect(nuncaDerivable(prohibido)).toBe(true);
    }
  });

  it("la capacidad cuenta da ver y pagar la cuenta; comunidad es solo lectura de votaciones", () => {
    expect(CAPACIDADES.cuenta.permisos).toEqual(expect.arrayContaining(["cartera.ver", "pagos.pagar", "paz_y_salvo.solicitar"]));
    expect(CAPACIDADES.comunidad.permisos).toContain("votaciones.ver");
    expect(CAPACIDADES.comunidad.permisos).not.toContain("votaciones.votar");
    expect(CAPACIDADES.visitantes.permisos).toEqual(["visitantes.autorizar"]);
  });

  it("normaliza: descarta desconocidas, quita duplicados y ordena", () => {
    expect(normalizarCapacidades(["paquetes", "x", "visitantes", "paquetes", 3])).toEqual(["visitantes", "paquetes"]);
    expect(normalizarCapacidades(null)).toEqual([]);
  });
});

describe("presets", () => {
  it("cada preset usa capacidades válidas y un tipo de vínculo derivable", () => {
    for (const k of PRESET_KEYS) {
      expect(normalizarCapacidades(PRESETS[k].capacidades)).toHaveLength(PRESETS[k].capacidades.length);
      expect(["FAMILIAR", "RESIDENTE", "EMPLEADO_DOMESTICO", "CUIDADOR", "ARRENDATARIO"]).toContain(PRESETS[k].tipoVinculo);
    }
  });

  it("la empleada solo tiene visitantes y paquetes; el menor no ve la cuenta; el familiar adulto tiene todo", () => {
    expect(PRESETS.EMPLEADA.capacidades).toEqual(["visitantes", "paquetes"]);
    expect(PRESETS.MENOR.capacidades).not.toContain("cuenta");
    expect(normalizarCapacidades(PRESETS.FAMILIAR_ADULTO.capacidades)).toEqual(CAPACIDAD_KEYS);
    expect(PRESETS.ARRENDATARIO.capacidades).not.toContain("cuenta");
  });

  it("sugiere el preset según el tipo y la edad", () => {
    expect(presetPara("FAMILIAR")).toBe("FAMILIAR_ADULTO");
    expect(presetPara("FAMILIAR", true)).toBe("MENOR");
    expect(presetPara("EMPLEADO_DOMESTICO")).toBe("EMPLEADA");
    expect(presetPara("CUIDADOR")).toBe("CUIDADOR");
    expect(presetPara("RESIDENTE")).toBe("OTRO");
  });
});

describe("techo del titular", () => {
  it("el propietario puede otorgar todo; el arrendatario sin cuenta autorizada no otorga la cuenta", () => {
    expect(capacidadesOtorgables({ permisos: rol("PROPIETARIO"), tieneCuenta: true })).toEqual(CAPACIDAD_KEYS);
    const arr = capacidadesOtorgables({ permisos: rol("RESIDENTE"), tieneCuenta: false });
    expect(arr).not.toContain("cuenta");
    expect(arr).toContain("visitantes");
  });

  it("un titular con acceso derivado no otorga más de lo que tiene", () => {
    const r = resolverAcceso({ rolResidencial: true, permisosRol: rol("RESIDENTE"), vinculos: [v({ tipo: "ARRENDATARIO", capacidadesHogar: ["comunidad", "visitantes"] })] });
    const techo = { permisos: r.permisos, tieneCuenta: false };
    expect(capacidadesOtorgables(techo)).toEqual(["comunidad", "visitantes"]);
    expect(excedentes(["visitantes", "reservas", "cuenta"], techo)).toEqual(["reservas", "cuenta"]);
  });
});

describe("resolverAcceso (núcleo de buildCtx)", () => {
  it("restringe los permisos de un miembro derivado a sus capacidades (+ emergencias)", () => {
    const r = resolverAcceso({ rolResidencial: true, permisosRol: rol("RESIDENTE"), vinculos: [v()] });
    expect(r.accesoDerivado).toBe(true);
    expect([...r.permisos].sort()).toEqual([...new Set(["visitantes.autorizar", "paqueteria.ver", ...PERMISOS_SIEMPRE])].sort());
    expect(r.unidadIds).toEqual(["u1"]);
  });

  it("la capacidad cuenta concede ver y pagar aunque el rol no lo tenga", () => {
    const r = resolverAcceso({ rolResidencial: true, permisosRol: rol("RESIDENTE"), vinculos: [v({ capacidadesHogar: ["cuenta"] })] });
    expect(r.permisos.has("cartera.ver")).toBe(true);
    expect(r.permisos.has("pagos.pagar")).toBe(true);
    expect(r.permisos.has("votaciones.votar")).toBe(false);
  });

  it("un acceso pausado (o con titular inactivo) no cuenta como unidad ni da permisos", () => {
    const pausado = resolverAcceso({ rolResidencial: true, permisosRol: rol("RESIDENTE"), vinculos: [v({ accesoPausado: true })] });
    expect(pausado.unidadIds).toEqual([]);
    expect(pausado.permisos.size).toBe(0);
    const titularFuera = resolverAcceso({ rolResidencial: true, permisosRol: rol("RESIDENTE"), vinculos: [v({ derivadoDe: { estado: "INACTIVO", accesoPausado: false } })] });
    expect(titularFuera.unidadIds).toEqual([]);
  });

  it("si tiene un vínculo propio no derivado conserva los permisos de su rol", () => {
    const permisosRol = rol("PROPIETARIO");
    const r = resolverAcceso({ rolResidencial: true, permisosRol, vinculos: [v({ unidadId: "u2" }), v({ unidadId: "u1", tipo: "PROPIETARIO", derivadoDeId: null, capacidadesHogar: [], derivadoDe: null })] });
    expect(r.accesoDerivado).toBe(false);
    expect(r.permisos).toBe(permisosRol);
    expect(r.unidadesPropias).toEqual(["u1"]);
  });

  it("los roles de gestión no se restringen", () => {
    const permisosRol = rol("ADMINISTRADOR");
    const r = resolverAcceso({ rolResidencial: false, permisosRol, vinculos: [v()] });
    expect(r.permisos).toBe(permisosRol);
  });
});

describe("titular", () => {
  const base = { principal: false, estado: "ACTIVO", accesoPausado: false, derivadoDeId: null };
  it("propietario, copropietario y arrendatario son titulares; el familiar solo si es principal y no derivado", () => {
    expect(esVinculoTitular({ ...base, tipo: "PROPIETARIO" })).toBe(true);
    expect(esVinculoTitular({ ...base, tipo: "ARRENDATARIO", derivadoDeId: "x" })).toBe(true);
    expect(esVinculoTitular({ ...base, tipo: "FAMILIAR" })).toBe(false);
    expect(esVinculoTitular({ ...base, tipo: "RESIDENTE", principal: true })).toBe(true);
    expect(esVinculoTitular({ ...base, tipo: "FAMILIAR", principal: true, derivadoDeId: "x" })).toBe(false);
    expect(esVinculoTitular({ ...base, tipo: "PROPIETARIO", estado: "INACTIVO" })).toBe(false);
  });
});
