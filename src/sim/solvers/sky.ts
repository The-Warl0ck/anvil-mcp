import type { Blueprint, ProofMetric, SeriesKey, SimSnapshot, Solver } from "../types.ts";
import { sunPosition, stellariumSun } from "../sky-math.ts";

/** Live-sky bench — computed sun, optional Stellarium Remote Control on :8090. */
export class SkySolver implements Solver {
  domain = "sky" as const;
  recommendedDt = 1;
  realPerWall = 1;
  bp!: Blueprint;
  t = 0;
  extra: Record<string, number> = {};
  live = false;

  reset(bp: Blueprint) {
    this.bp = bp;
    this.t = 0;
    this.compute(null);
    void this.pullLive();
  }

  step(dt: number) {
    this.t += dt;
    this.compute(null);
  }

  async pullLive() {
    const live = await stellariumSun();
    if (live) {
      this.live = true;
      this.compute(live);
    }
  }

  compute(live: { altitudeDeg: number; azimuthDeg: number; up: boolean } | null) {
    const n = this.bp.nodes.find((x) => x.kind === "sky" || x.kind === "sun") || this.bp.nodes[0];
    const lat = n?.params.lat ?? 33.45;
    const lon = n?.params.lon ?? -112.07;
    const hour = n?.params.hour ?? new Date().getHours() + new Date().getMinutes() / 60;
    const when = new Date();
    when.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
    const pos = live || sunPosition(lat, lon, when);
    this.extra = {
      alt: pos.altitudeDeg,
      az: pos.azimuthDeg,
      day: pos.up ? 1 : 0,
      lat,
      lon,
      hour,
      stellarium: this.live ? 1 : 0,
    };
  }

  snapshot(): SimSnapshot {
    return {
      time: this.t,
      nodeValues: { alt: this.extra.alt, az: this.extra.az },
      nodeHeat: {},
      edgeValues: {},
      extra: this.extra,
    };
  }

  proof(): ProofMetric[] {
    const e = this.extra;
    return [
      {
        id: "src",
        label: "Sky source",
        value: e.stellarium,
        unit: "",
        status: e.stellarium ? "pass" : "info",
        note: e.stellarium ? "Stellarium Remote Control :8090" : "Computed ephemeris (NOAA-style)",
      },
      {
        id: "alt",
        label: "Sun altitude",
        value: e.alt,
        unit: "deg",
        status: e.day ? "pass" : "info",
        note: e.day ? "Daylight" : "Below horizon",
      },
      {
        id: "az",
        label: "Sun azimuth",
        value: e.az,
        unit: "deg",
        status: "info",
        note: `${e.lat.toFixed(2)}°, ${e.lon.toFixed(2)}° · hour ${e.hour.toFixed(2)}`,
      },
    ];
  }

  series(): SeriesKey[] {
    return [{ key: "alt", label: "altitude" }];
  }
}
