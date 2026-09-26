import { clamp } from "../../lib/utils.ts";
import { ELEMENTS, elementOf } from "../elements.ts";
import type { Blueprint, LabNode, ProofMetric, SeriesKey, SimSnapshot, Solver } from "../types.ts";

function isEl(n: LabNode) {
  return n.kind === "element" || !!ELEMENTS[n.kind];
}

function weights(bp: Blueprint) {
  const els = bp.nodes.filter(isEl);
  const raw = els.map((n) => ({ n, el: elementOf(n.kind, n.params.Z), w: Math.max(0, n.params.wt ?? n.params.mass ?? 1) }));
  const sum = raw.reduce((s, r) => s + r.w, 0) || 1;
  return raw.map((r) => ({ ...r, frac: r.w / sum }));
}

/**
 * Alloy workbench. Mass-weighted mixing of handbook pure-element data,
 * IIW carbon equivalent for ferrous, Al–Si print window for powders.
 * Not a phase diagram — methods are on each metric.
 */
export class MetallurgySolver implements Solver {
  domain = "metallurgy" as const;
  recommendedDt = 0.05;
  realPerWall = 4;
  bp!: Blueprint;
  t = 0;
  T = 300;
  Tliq = 1800;

  reset(bp: Blueprint) {
    this.bp = bp;
    this.t = 0;
    const mix = weights(bp);
    this.Tliq = mix.reduce((s, r) => s + r.frac * r.el.Tm, 0);
    const melt = bp.nodes.find((n) => n.kind === "melt" || n.kind === "alloy");
    this.T = melt?.params.T ?? Math.min(this.Tliq * 0.55, 900);
  }

  step(dt: number) {
    const soak = this.Tliq * 0.92;
    this.T = clamp(this.T + (soak - this.T) * (1 - Math.exp(-dt / 1.8)), 280, 4000);
    this.t += dt;
  }

  snapshot(): SimSnapshot {
    const mix = weights(this.bp);
    const nodeValues: Record<string, number> = {};
    const nodeHeat: Record<string, number> = {};
    for (const n of this.bp.nodes) {
      const row = mix.find((m) => m.n.id === n.id);
      nodeValues[n.id] = row ? row.frac * 100 : this.T;
      nodeHeat[n.id] = Math.max(0, this.T - 300) / 20;
    }
    const rho = mix.reduce((s, r) => s + r.frac * r.el.rho, 0);
    return {
      time: this.t,
      nodeValues,
      nodeHeat,
      edgeValues: {},
      extra: { T: this.T, Tliq: this.Tliq, rho, wt: mix.reduce((s, r) => s + r.frac, 0) },
    };
  }

  series(): SeriesKey[] {
    return this.bp.nodes.filter(isEl).slice(0, 6).map((n) => ({ key: n.id, label: n.label }));
  }

  proof(): ProofMetric[] {
    const mix = weights(this.bp);
    const wt = (id: string) => mix.find((m) => m.el.id === id)?.frac ?? 0;
    const rho = mix.reduce((s, r) => s + r.frac * r.el.rho, 0);
    const Tm = mix.reduce((s, r) => s + r.frac * r.el.Tm, 0);
    const k = mix.reduce((s, r) => s + r.frac * r.el.k, 0);
    const E = mix.reduce((s, r) => s + r.frac * r.el.E, 0);
    const ferrous = wt("Fe") > 0.5;
    const ce =
      wt("C") * 100 +
      (wt("Mn") * 100) / 6 +
      ((wt("Cr") + wt("Mo") + wt("V")) * 100) / 5 +
      ((wt("Ni") + wt("Cu")) * 100) / 15;
    const ys = ferrous ? 250e6 + 620e6 * (ce / 100) * 4 : 70e6 + 480e6 * wt("Cu") + 180e6 * wt("Si") + 900e6 * wt("Zn");
    const alsi = wt("Al") > 0.7;
    const si = wt("Si") * 100;
    const printOk = alsi ? si >= 6 && si <= 13 : ferrous ? ce < 0.45 : wt("Ti") > 0.8;
    return [
      {
        id: "rho",
        label: "Density (ROM)",
        value: rho,
        unit: "kg/m³",
        status: "info",
        note: "Rule of mixtures ρ = Σ wᵢ ρᵢ. Ignores excess volume of mixing.",
      },
      {
        id: "Tm",
        label: "Liquidus (linear)",
        value: Tm,
        unit: "K",
        status: "info",
        note: "Σ wᵢ Tmᵢ — not a real phase diagram. Use as a first bound only.",
      },
      {
        id: "ce",
        label: "IIW carbon equivalent",
        value: ce,
        unit: "wt%",
        status: ferrous ? (ce > 0.5 ? "fail" : ce > 0.4 ? "warn" : "pass") : "info",
        limit: 0.4,
        note: "CE = C + Mn/6 + (Cr+Mo+V)/5 + (Ni+Cu)/15 (IIW). Weldability bound for steels.",
      },
      {
        id: "ys",
        label: "Yield (proxy)",
        value: ys,
        unit: "Pa",
        status: ys > 200e6 ? "pass" : ys > 80e6 ? "warn" : "fail",
        note: ferrous
          ? "Ferritic proxy YS ≈ 250 + 2480·CE MPa. Not a heat-treat curve."
          : "Nonferrous proxy from Cu/Si/Zn strengtheners. Confirm with tensile coupons.",
      },
      {
        id: "E",
        label: "Young's modulus (ROM)",
        value: E,
        unit: "Pa",
        status: "info",
        note: "Σ wᵢ Eᵢ.",
      },
      {
        id: "k",
        label: "Thermal k (ROM)",
        value: k,
        unit: "W/m·K",
        status: "info",
        note: "Σ wᵢ kᵢ.",
      },
      {
        id: "print",
        label: "Powder / print window",
        value: printOk ? 1 : 0,
        unit: "",
        status: printOk ? "pass" : "warn",
        note: alsi
          ? `Al–Si: Si ${si.toFixed(1)} wt% (target 6–13 for LPBF crack resistance).`
          : ferrous
            ? `Steel CE ${ce.toFixed(2)} (prefer < 0.45 for as-welded / DED).`
            : "Ti-rich or other — treat as research alloy; print settings not certified.",
      },
      {
        id: "T",
        label: "Melt soak T",
        value: this.T,
        unit: "K",
        status: this.T > Tm * 0.85 ? "pass" : "info",
        note: "First-order soak toward 0.92·Tliq. Not a furnace schedule.",
      },
    ];
  }
}
