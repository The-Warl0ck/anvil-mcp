import { clamp } from "../../lib/utils.ts";
import type { Blueprint, ProofMetric, SeriesKey, SimSnapshot, Solver } from "../types.ts";

export class MechanicalSolver implements Solver {
  domain = "mechanical" as const;
  recommendedDt = 8e-7;
  realPerWall = 0.0004;
  bp!: Blueprint;
  t = 0;
  y = new Map<string, number>();
  v = new Map<string, number>();
  stress = new Map<string, number>();
  peak = 0;
  crossings = 0;
  lastPos = false;
  lastCross = 0;
  freq = 0;

  reset(bp: Blueprint) {
    this.bp = bp;
    this.t = 0;
    this.y.clear();
    this.v.clear();
    this.stress.clear();
    this.peak = 0;
    this.freq = 0;
    this.crossings = 0;
    this.lastCross = 0;
    this.lastPos = false;
    for (const n of bp.nodes) {
      this.y.set(n.id, 0);
      this.v.set(n.id, 0);
    }
  }

  step(dt: number) {
    const F = new Map<string, number>();
    for (const n of this.bp.nodes) F.set(n.id, n.params.F ?? 0);

    for (const e of this.bp.edges) {
      const L = Math.max(e.params.L ?? 2e-5, 1e-7);
      const w = e.params.w ?? 2e-5;
      const th = e.params.t ?? 2e-6;
      const E = e.params.E ?? 1.6e11;
      const I = (w * th ** 3) / 12;
      const k = (3 * E * I) / L ** 3;
      const ya = this.y.get(e.from) ?? 0;
      const yb = this.y.get(e.to) ?? 0;
      const f = k * (yb - ya);
      F.set(e.from, (F.get(e.from) ?? 0) + f);
      F.set(e.to, (F.get(e.to) ?? 0) - f);
      const sigma = (E * th * Math.abs(yb - ya)) / (L * L) * 0.5;
      this.stress.set(e.id, sigma);
    }

    for (const n of this.bp.nodes) {
      if (n.params.fixed === 1 || n.kind === "anchor") {
        this.y.set(n.id, 0);
        this.v.set(n.id, 0);
        continue;
      }
      const m = Math.max(n.params.m ?? 1e-13, 1e-16);
      const damp = 2e-8;
      const a = ((F.get(n.id) ?? 0) - damp * (this.v.get(n.id) ?? 0)) / m;
      const nv = (this.v.get(n.id) ?? 0) + a * dt;
      const ny = (this.y.get(n.id) ?? 0) + nv * dt;
      this.v.set(n.id, nv);
      this.y.set(n.id, ny);
    }

    const tip = this.bp.nodes[this.bp.nodes.length - 1];
    const yt = this.y.get(tip.id) ?? 0;
    this.peak = Math.max(this.peak, Math.abs(yt));
    const pos = yt > 0;
    if (pos && !this.lastPos) {
      if (this.lastCross > 0) {
        const p = this.t - this.lastCross;
        if (p > 1e-6) this.freq = 0.6 * this.freq + 0.4 * (1 / p);
      }
      this.lastCross = this.t;
      this.crossings += 1;
    }
    this.lastPos = pos;
    this.t += dt;
  }

  snapshot(): SimSnapshot {
    const nodeValues: Record<string, number> = {};
    const nodeHeat: Record<string, number> = {};
    const edgeValues: Record<string, number> = {};
    const tip = this.bp.nodes[this.bp.nodes.length - 1];
    const scale = 1 / 4e-6;
    for (const n of this.bp.nodes) {
      nodeValues[n.id] = (this.y.get(n.id) ?? 0) * scale;
      nodeHeat[n.id] = Math.abs(this.y.get(n.id) ?? 0);
    }
    for (const e of this.bp.edges) edgeValues[e.id] = this.stress.get(e.id) ?? 0;
    return {
      time: this.t,
      nodeValues,
      nodeHeat,
      edgeValues,
      extra: {
        tip: this.y.get(tip.id) ?? 0,
        freq: this.freq,
        peak: this.peak,
        smax: Math.max(0, ...this.bp.edges.map((e) => this.stress.get(e.id) ?? 0)),
      },
    };
  }

  series(): SeriesKey[] {
    const tip = this.bp.nodes[this.bp.nodes.length - 1];
    return [{ key: tip.id, label: tip.label }];
  }

  proof(): ProofMetric[] {
    const tip = this.bp.nodes[this.bp.nodes.length - 1];
    const L = this.bp.edges.reduce((s, e) => s + (e.params.L ?? 0), 0);
    const e0 = this.bp.edges[0];
    const w = e0?.params.w ?? 2e-5;
    const th = e0?.params.t ?? 2e-6;
    const E = e0?.params.E ?? 1.6e11;
    const I = (w * th ** 3) / 12;
    const mu = 2330 * w * th;
    const fAnalytic = L > 0 ? ((1.875 ** 2) / (2 * Math.PI)) * Math.sqrt(E * I / (mu * L ** 4)) : 0;
    const smax = Math.max(0, ...this.bp.edges.map((e) => this.stress.get(e.id) ?? 0));
    const yieldSi = 1.2e9;
    const sf = smax > 0 ? yieldSi / smax : 99;
    const tipY = this.y.get(tip.id) ?? 0;
    return [
      {
        id: "f0",
        label: "First mode (sim)",
        value: this.freq,
        unit: "Hz",
        status: this.freq > 200 && this.freq < 20000 ? "pass" : this.t < 0.001 ? "info" : "warn",
        note: "Zero-crossings of the proof mass.",
      },
      {
        id: "fa",
        label: "Euler–Bernoulli f0",
        value: fAnalytic,
        unit: "Hz",
        status: "info",
        note: "(1.875)² / 2π · √(EI/μL⁴) for a clamped-free beam.",
      },
      {
        id: "d",
        label: "Tip deflection (1 g)",
        value: tipY,
        unit: "m",
        status: Math.abs(tipY) > 1e-10 && Math.abs(tipY) < 4e-6 ? "pass" : "warn",
        note: "Amplified ×250 in the viewport.",
      },
      {
        id: "sf",
        label: "Safety factor",
        value: sf,
        unit: "",
        status: sf > 4 ? "pass" : sf > 1.5 ? "warn" : "fail",
        limit: 4,
        note: "Poly-Si yield 1.2 GPa vs peak bending stress.",
      },
      {
        id: "s",
        label: "Peak stress",
        value: smax,
        unit: "Pa",
        status: smax < yieldSi / 4 ? "pass" : smax < yieldSi ? "warn" : "fail",
        note: "Von Mises proxy from beam curvature.",
      },
    ];
  }
}
