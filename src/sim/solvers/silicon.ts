import { clamp } from "../../lib/utils.ts";
import type { Blueprint, ProofMetric, SeriesKey, SimSnapshot, Solver } from "../types.ts";

const TAMB = 300;
const EA_EM = 0.9 * 1.602e-19;
const K_B = 1.381e-23;

export class SiliconSolver implements Solver {
  domain = "silicon" as const;
  recommendedDt = 2e-14;
  realPerWall = 1.6e-10;
  bp!: Blueprint;
  t = 0;
  V = new Map<string, number>();
  T = new Map<string, number>();
  Iedge = new Map<string, number>();
  crossings = 0;
  lastAbove = false;
  lastCross = 0;
  freq = 0;
  eCycle = 0;
  power = 0;

  reset(bp: Blueprint) {
    this.bp = bp;
    this.t = 0;
    this.V.clear();
    this.T.clear();
    this.Iedge.clear();
    this.crossings = 0;
    this.freq = 0;
    this.lastCross = 0;
    this.power = 0;
    this.eCycle = 0;
    for (const n of bp.nodes) {
      const v0 = n.kind === "inverter" ? (n.x < 50 ? 0.75 : 0) : (n.params.v ?? 0);
      this.V.set(n.id, v0);
      this.T.set(n.id, TAMB);
    }
  }

  private inputOf(id: string): string | null {
    const incoming = this.bp.edges.filter((e) => e.to === id && e.kind !== "rail");
    if (incoming.length) return incoming[0].from;
    const any = this.bp.edges.find((e) => e.to === id || e.from === id);
    if (!any) return null;
    return any.from === id ? any.to : any.from;
  }

  step(dt: number) {
    const I = new Map<string, number>();
    let pJoule = 0;
    for (const e of this.bp.edges) {
      if (e.kind === "rail") continue;
      const R = Math.max(e.params.R ?? 50, 1e-4);
      const Va = this.V.get(e.from) ?? 0;
      const Vb = this.V.get(e.to) ?? 0;
      const i = (Va - Vb) / R;
      this.Iedge.set(e.id, i);
      I.set(e.from, (I.get(e.from) ?? 0) - i);
      I.set(e.to, (I.get(e.to) ?? 0) + i);
      pJoule += i * i * R;
    }

    const vdd =
      this.bp.nodes.find((n) => n.params.fixed === 1 && (n.params.v ?? 0) > 0.2)?.params.v ?? 0.75;

    const next = new Map(this.V);
    for (const n of this.bp.nodes) {
      if (n.params.fixed === 1) {
        next.set(n.id, n.params.v ?? 0);
        continue;
      }
      if (n.kind === "tap" && n.params.Iload) {
        I.set(n.id, (I.get(n.id) ?? 0) - n.params.Iload);
      }
      if (n.kind === "inverter") {
        const src = this.inputOf(n.id);
        const vin = src ? (this.V.get(src) ?? 0) : 0;
        const gain = n.params.gain ?? 12;
        const target = vdd / (1 + Math.exp(gain * (vin / Math.max(vdd, 1e-6) - 0.5)));
        const tau = Math.max((n.params.rout ?? 200) * (n.params.C ?? 2e-15), 1e-14);
        const v = this.V.get(n.id) ?? 0;
        next.set(n.id, clamp(v + (target - v) * (1 - Math.exp(-dt / tau)), -0.2, 1.3));
        continue;
      }
      const C = Math.max(n.params.C ?? 5e-16, 1e-17);
      const v = this.V.get(n.id) ?? 0;
      const dv = ((I.get(n.id) ?? 0) / C) * dt;
      next.set(n.id, clamp(v + dv, -0.3, 1.4));
    }
    this.V = next;

    this.power = 0.8 * this.power + 0.2 * pJoule;
    for (const n of this.bp.nodes) {
      const Cth = n.params.Cth ?? 5e-12;
      const gth = 2e-5;
      const share = pJoule / Math.max(this.bp.nodes.length, 1);
      const T = this.T.get(n.id) ?? TAMB;
      const dT = ((share - gth * (T - TAMB)) / Cth) * dt * 8e8;
      this.T.set(n.id, clamp(T + dT, TAMB - 5, 500));
    }

    const probe = this.bp.nodes.find((n) => n.kind === "inverter") ?? this.bp.nodes[0];
    if (probe) {
      const v = this.V.get(probe.id) ?? 0;
      const above = v > vdd * 0.5;
      if (above && !this.lastAbove) {
        if (this.lastCross > 0) {
          const period = this.t - this.lastCross;
          if (period > 1e-14) this.freq = 0.7 * this.freq + 0.3 * (1 / period);
        }
        this.lastCross = this.t;
        this.crossings += 1;
      }
      this.lastAbove = above;
    }

    this.t += dt;
  }

  snapshot(): SimSnapshot {
    const nodeValues: Record<string, number> = {};
    const nodeHeat: Record<string, number> = {};
    const edgeValues: Record<string, number> = {};
    for (const n of this.bp.nodes) {
      nodeValues[n.id] = this.V.get(n.id) ?? 0;
      nodeHeat[n.id] = (this.T.get(n.id) ?? TAMB) - TAMB;
    }
    for (const e of this.bp.edges) edgeValues[e.id] = this.Iedge.get(e.id) ?? 0;
    return {
      time: this.t,
      nodeValues,
      nodeHeat,
      edgeValues,
      extra: {
        freq: this.freq,
        power: this.power,
        tmax: Math.max(0, ...this.bp.nodes.map((n) => (this.T.get(n.id) ?? TAMB) - TAMB)),
      },
    };
  }

  series(): SeriesKey[] {
    const inv = this.bp.nodes.filter((n) => n.kind === "inverter" || n.kind === "tap").slice(0, 4);
    return inv.map((n) => ({ key: n.id, label: n.label }));
  }

  proof(): ProofMetric[] {
    const vdd = this.bp.nodes.find((n) => n.params.fixed === 1 && (n.params.v ?? 0) > 0.2)?.params.v ?? 0.75;
    const core = this.bp.nodes.find((n) => n.id === "n11") ?? this.bp.nodes.find((n) => n.kind === "tap");
    const ir = core ? vdd - (this.V.get(core.id) ?? vdd) : 0;
    const irPct = (ir / vdd) * 100;
    const tmax = Math.max(...this.bp.nodes.map((n) => this.T.get(n.id) ?? TAMB));
    const tj = tmax - 273.15;
    let jMax = 0;
    for (const e of this.bp.edges) {
      const i = Math.abs(this.Iedge.get(e.id) ?? 0);
      const w = (e.params.w_nm ?? 14) * 1e-9;
      const t = 1e-7;
      jMax = Math.max(jMax, i / Math.max(w * t, 1e-20));
    }
    const T = tmax;
    const n = 1.8;
    const A = 1e16;
    const mttf = jMax > 0 ? (A / Math.pow(jMax / 1e8, n)) * Math.exp(EA_EM / (K_B * T)) : 1e12;
    const mttfYr = mttf / (3600 * 24 * 365);
    const thin = this.bp.edges.some((e) => (e.params.w_nm ?? 40) < 12 && e.kind !== "rail");
    const osc = this.freq > 1e8;
    const isRO = this.bp.nodes.some((n) => n.kind === "inverter");

    const out: ProofMetric[] = [];
    if (isRO) {
      out.push({
        id: "f",
        label: "Ring frequency",
        value: this.freq,
        unit: "Hz",
        status: osc ? "pass" : this.t > 2e-11 ? "fail" : "info",
        limit: 1e8,
        note: osc ? "Closed loop is oscillating." : "Waiting for a full period.",
      });
    } else {
      out.push({
        id: "ir",
        label: "Core IR drop",
        value: irPct,
        unit: "%",
        status: irPct < 5 ? "pass" : irPct < 10 ? "warn" : "fail",
        limit: 5,
        note: "Budget is 5 % of VDD at the hottest tap.",
      });
    }
    out.push({
      id: "p",
      label: "Joule power",
      value: this.power,
      unit: "W",
      status: this.power < 0.08 ? "pass" : "warn",
      note: "I²R on the extracted net.",
    });
    out.push({
      id: "tj",
      label: "Junction temperature",
      value: tj,
      unit: "°C",
      status: tj < 85 ? "pass" : tj < 105 ? "warn" : "fail",
      limit: 105,
      note: "Lumped thermal node per device, 300 K ambient.",
    });
    out.push({
      id: "em",
      label: "EM MTTF (Black)",
      value: mttfYr,
      unit: "yr",
      status: mttfYr > 10 ? "pass" : mttfYr > 2 ? "warn" : "fail",
      limit: 10,
      note: "Black’s equation, Ea = 0.9 eV, n = 1.8, worst via.",
    });
    const turns = this.bp.edges.map((e) => e.params.bend ?? 0);
    const sharp = turns.length ? Math.max(...turns) : 0;
    const squares = this.bp.edges.reduce((s, e) => s + (e.params.corners ?? 0), 0);
    out.push({
      id: "drc",
      label: "Min drawn width",
      value: Math.min(...this.bp.edges.map((e) => e.params.w_nm ?? 40)),
      unit: "nm",
      status: thin ? "fail" : "pass",
      limit: 12,
      note: thin ? "A trace is below 12 nm — 7 nm-class DRC fail." : "Widths clear 12 nm drawn.",
    });
    out.push({
      id: "turn",
      label: "Sharpest turn",
      value: sharp,
      unit: "deg",
      status: sharp > 95 ? "fail" : sharp > 70 ? "warn" : "pass",
      limit: 90,
      note:
        sharp > 95
          ? "An acute corner crowds current — chamfer or split the turn."
          : sharp > 70
            ? "Right-angle corners add ~0.56 squares each. 45° miters run cooler."
            : "Bends are shallow; corner resistance is small.",
    });
    out.push({
      id: "corner",
      label: "Corner squares",
      value: squares,
      unit: "",
      status: squares > 2 ? "warn" : "info",
      note: "Extra sheet-resistance squares from current crowding at turns. Geometry, not a fudge factor.",
    });
    return out;
  }
}
