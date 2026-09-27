import { systemCtx } from "@/lib/auth/system-ctx";
import { conjuntoConfig } from "@/lib/conjunto/config";
import { notify, usuariosConPermiso, usuariosConRol, usuariosDeUnidad } from "@/lib/notificaciones";
import { expirarAutorizaciones } from "@/lib/porteria/autorizaciones";
import { expirarSolicitudes } from "@/lib/porteria/solicitudes";
import { adentroAhora } from "@/lib/porteria/service";
import { diasEnPorteria, textoPermanencia } from "@/lib/porteria/reglas";
import { conjuntosActivos } from "./definitions";
import { defineJob } from "./registry";

/** Jobs de portería: paquetes sin reclamar, vencimiento de autorizaciones/solicitudes y permanencia excesiva. */

defineJob({
  name: "porteria-paquetes-sin-reclamar",
  cron: "0 18 * * *",
  descripcion: "Alertas de paquetes sin reclamar (a la unidad y a portería/administración)",
  handler: async () => {
    let unidades = 0;
    for (const c of await conjuntosActivos()) {
      const ctx = await systemCtx(c.id);
      const cfg = conjuntoConfig(ctx);
      const paquetes = await ctx.db.paquete.findMany({ where: { estado: "EN_PORTERIA" }, include: { unidad: { select: { id: true, codigo: true } } } });
      const porUnidad = new Map<string, { codigo: string; n: number; maxDias: number }>();
      for (const p of paquetes) {
        const d = diasEnPorteria(p.llegadaEn);
        const u = porUnidad.get(p.unidadId) ?? { codigo: p.unidad.codigo, n: 0, maxDias: 0 };
        u.n++;
        u.maxDias = Math.max(u.maxDias, d);
        porUnidad.set(p.unidadId, u);
      }
      const vencidas: string[] = [];
      for (const [unidadId, u] of porUnidad) {
        await notify({
          conjuntoId: c.id,
          usuarioIds: await usuariosDeUnidad(c.id, unidadId),
          titulo: u.n > 1 ? `Tienes ${u.n} paquetes en portería` : "Tienes un paquete en portería",
          cuerpo: u.maxDias >= cfg.porteria.maxDiasPaquete ? `Lleva ${u.maxDias} días sin reclamar. Pásate por portería.` : "Recuérdalo al llegar a casa.",
          enlace: "/paquetes",
          tipo: "PAQUETE",
          canales: u.maxDias >= cfg.porteria.maxDiasPaquete ? ["push", "email", "whatsapp"] : ["push"],
        });
        unidades++;
        if (u.maxDias >= cfg.porteria.maxDiasPaquete) vencidas.push(`${u.codigo} (${u.maxDias} d)`);
      }
      if (vencidas.length) {
        const gestores = new Set([...(await usuariosConRol(c.id, ["ADMINISTRADOR"])), ...(await usuariosConPermiso(c.id, ["paqueteria.ver_todos"]))]);
        await notify({
          conjuntoId: c.id,
          usuarioIds: [...gestores],
          titulo: `${vencidas.length} unidad(es) con paquetes de más de ${cfg.porteria.maxDiasPaquete} días`,
          cuerpo: vencidas.slice(0, 15).join(", "),
          enlace: "/porteria/paquetes?vencidos=1",
          tipo: "PAQUETE",
        });
      }
    }
    return `${unidades} unidades notificadas`;
  },
});

defineJob({
  name: "porteria-expirar",
  cron: "*/15 * * * *",
  descripcion: "Vence autorizaciones de ingreso y expira solicitudes sin respuesta",
  handler: async () => {
    let a = 0;
    let s = 0;
    for (const c of await conjuntosActivos()) {
      a += await expirarAutorizaciones(c.id);
      s += await expirarSolicitudes(c.id);
    }
    return `${a} autorizaciones vencidas, ${s} solicitudes expiradas`;
  },
});

defineJob({
  name: "porteria-permanencia",
  cron: "0 * * * *",
  descripcion: "Alerta de visitantes con permanencia mayor a la configurada",
  handler: async () => {
    let n = 0;
    for (const c of await conjuntosActivos()) {
      const ctx = await systemCtx(c.id);
      const cfg = conjuntoConfig(ctx);
      const adentro = (await adentroAhora(ctx)).filter((x) => x.alerta);
      // Solo avisar una vez: los que cruzaron el umbral en la última hora.
      const nuevos = adentro.filter((x) => x.minutos - cfg.porteria.alertaHorasPermanencia * 60 < 60);
      if (!nuevos.length) continue;
      const porteros = await usuariosConPermiso(c.id, ["porteria.registrar"]);
      await notify({
        conjuntoId: c.id,
        usuarioIds: porteros,
        titulo: `${nuevos.length} visitante(s) con más de ${cfg.porteria.alertaHorasPermanencia} h adentro`,
        cuerpo: nuevos.slice(0, 8).map((x) => `${x.nombre} → ${x.unidad ?? "—"} (${textoPermanencia(x.minutos)})`).join("; "),
        enlace: "/porteria",
        tipo: "PORTERIA",
      });
      n += nuevos.length;
    }
    return `${n} alertas de permanencia`;
  },
});
