import type { Blueprint, ProofMetric, SeriesKey, SimSnapshot, Solver } from "../types.ts";
import { sunPosition } from "../sky-math.ts";

/** Geometry + shadow bench — gnomon / sundial / similar triangles. */
export class OpticsSolver implements Solver {
  domain = "optics" as const;
  recommendedDt = 1;
  realPerWall = 1;
  bp!: Blueprint;
  t = 0;
  extra: Record<string, number> = {};

  reset(bp: Blueprint) {
    this.bp = bp;
    this.t = 0;
    this.compute();
  }

  step(dt: number) {
    this.t += dt;
    const sun = this.bp.nodes.find((n) => n.kind === "sun" || n.kind === "sky");
    if (sun && sun.params.spin) {
      sun.params.hour = ((sun.params.hour ?? 12) + dt * 0.15) % 24;
    }
    this.compute();
  }

  compute() {
    const gnomon = this.bp.nodes.find((n) => /gnomon|stick|rod|obelisk/i.test(n.kind + n.label));
    const sun = this.bp.nodes.find((n) => n.kind === "sun" || n.kind === "sky") || this.bp.nodes[0];
    const h = gnomon?.params.h ?? gnomon?.params.height ?? 1;
    const lat = sun?.params.lat ?? 33.45;
    const lon = sun?.params.lon ?? -112.07;
    const hour = sun?.params.hour ?? 12;
    const when = new Date();
    when.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    const pos = sunPosition(lat, lon, when);
    const alt = pos.altitudeDeg;
    const shadow = alt > 0.4 ? h / Math.tan((alt * Math.PI) / 180) : 99;
    this.extra = {
      alt,
      az: pos.azimuthDeg,
      shadow,
      h,
      hour,
      lat,
      lon,
      day: pos.up ? 1 : 0,
    };
  }

  snapshot(): SimSnapshot {
    return {
      time: this.t,
      nodeValues: { shadow: this.extra.shadow, alt: this.extra.alt },
      nodeHeat: {},
      edgeValues: {},
      extra: this.extra,
    };
  }

  proof(): ProofMetric[] {
    const e = this.extra;
    const day = e.day === 1;
    return [
      {
        id: "alt",
        label: "Sun altitude",
        value: e.alt,
        unit: "deg",
        status: day ? "pass" : "info",
        note: day ? "Sun above horizon" : "Night — no gnomon shadow",
      },
      {
        id: "az",
        label: "Sun azimuth",
        value: e.az,
        unit: "deg",
        status: "info",
        note: "0=N, 90=E, 180=S, 270=W",
      },
      {
        id: "shadow",
        label: "Shadow length",
        value: e.shadow,
        unit: "m",
        status: day && e.shadow < 40 ? "pass" : "warn",
        note: `gnomon ${e.h} m · similar triangles L = h / tan(alt)`,
      },
      {
        id: "hour",
        label: "Local hour",
        value: e.hour,
        unit: "h",
        status: "info",
        note: `${e.lat.toFixed(2)}°, ${e.lon.toFixed(2)}°`,
      },
    ];
  }

  series(): SeriesKey[] {
    return [
      { key: "alt", label: "altitude" },
      { key: "shadow", label: "shadow m" },
    ];
  }
}
