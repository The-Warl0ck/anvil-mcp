import { clamp } from "../../lib/utils.ts";
import type { Blueprint, ProofMetric, SeriesKey, SimSnapshot, Solver } from "../types.ts";

const R = 8.314;
const TAMB = 298.15;

/**
 * Mass-action batch reactor.
 * Species nodes hold concentration (mol/L). Reaction nodes are hubs:
 * incoming edges = reactants (nu), outgoing = products (nu).
 * Integrates dc/dt and dT/dt from ΔH · net rate.
 */
export class ChemistrySolver implements Solver {
  domain = "chemistry" as const;
  recommendedDt = 0.05;
  realPerWall = 18;
  bp!: Blueprint;
  t = 0;
  c = new Map<string, number>();
  T = TAMB;
  Tref = TAMB;
  extent = 0;
  heat = 0;

  reset(bp: Blueprint) {
    this.bp = bp;
    this.t = 0;
    this.extent = 0;
    this.heat = 0;
    this.c.clear();
    const reactor = bp.nodes.find((n) => n.kind === "reactor");
    this.T = reactor?.params.T ?? TAMB;
    this.Tref = this.T;
    for (const n of bp.nodes) {
      if (n.kind === "species") this.c.set(n.id, Math.max(0, n.params.c ?? n.params.n ?? 0));
    }
  }

  private reactions() {
    return this.bp.nodes.filter((n) => n.kind === "reaction");
  }

  step(dt: number) {
    const dc = new Map<string, number>();
    let q = 0;
    for (const rx of this.reactions()) {
      const kf0 = Number.isFinite(rx.params.kf) ? rx.params.kf : 0.02;
      const kr0 = Number.isFinite(rx.params.kr) ? rx.params.kr : 0;
      const Ea = Number.isFinite(rx.params.Ea) ? rx.params.Ea : 45000;
      const dH = Number.isFinite(rx.params.dH) ? rx.params.dH : -40000;
      const T = Number.isFinite(this.T) ? this.T : TAMB;
      const Tref = Number.isFinite(this.Tref) && this.Tref > 50 ? this.Tref : T;
      // Forward and reverse rate constants are defined at the reactor's starting T; Arrhenius applies only as T drifts.
      const arr = Math.exp((-Ea / R) * (1 / Math.max(T, 50) - 1 / Math.max(Tref, 50)));
      const kf = kf0 * (Number.isFinite(arr) ? arr : 1);
      const kr = kr0 * (Number.isFinite(arr) ? arr : 1);

      const reactants = this.bp.edges.filter((e) => e.to === rx.id);
      const products = this.bp.edges.filter((e) => e.from === rx.id);
      let fwd = kf;
      let rev = kr;
      for (const e of reactants) {
        const nu = Math.max(0.01, e.params.nu ?? 1);
        const conc = Math.max(this.c.get(e.from) ?? 0, 0);
        fwd *= Math.pow(conc, nu);
      }
      for (const e of products) {
        const nu = Math.max(0.01, e.params.nu ?? 1);
        const conc = Math.max(this.c.get(e.to) ?? 0, 0);
        rev *= Math.pow(conc, nu);
      }
      const net = fwd - rev;
      this.extent += net * dt;
      q += -dH * net;
      for (const e of reactants) {
        const nu = e.params.nu ?? 1;
        dc.set(e.from, (dc.get(e.from) ?? 0) - nu * net);
      }
      for (const e of products) {
        const nu = e.params.nu ?? 1;
        dc.set(e.to, (dc.get(e.to) ?? 0) + nu * net);
      }
    }

    for (const [id, d] of dc) {
      this.c.set(id, Math.max(0, (this.c.get(id) ?? 0) + d * dt));
    }
    const vol = this.bp.nodes.find((n) => n.kind === "reactor")?.params.V ?? 1;
    const rhoCpV = 4180 * Math.max(vol, 0.05);
    const dT = Number.isFinite(q) ? (q * dt) / rhoCpV : 0;
    this.T = clamp((Number.isFinite(this.T) ? this.T : TAMB) + dT, 200, 900);
    this.heat += q * dt;
    this.t += dt;
  }

  snapshot(): SimSnapshot {
    const nodeValues: Record<string, number> = {};
    const nodeHeat: Record<string, number> = {};
    const edgeValues: Record<string, number> = {};
    for (const n of this.bp.nodes) {
      if (n.kind === "species") nodeValues[n.id] = this.c.get(n.id) ?? 0;
      else if (n.kind === "reactor") nodeValues[n.id] = this.T;
      else nodeValues[n.id] = 0;
      nodeHeat[n.id] = Math.max(0, this.T - TAMB);
    }
    for (const e of this.bp.edges) edgeValues[e.id] = this.c.get(e.from) ?? this.c.get(e.to) ?? 0;
    const species = this.bp.nodes.filter((n) => n.kind === "species");
    const total = species.reduce((s, n) => s + (this.c.get(n.id) ?? 0), 0);
    return {
      time: this.t,
      nodeValues,
      nodeHeat,
      edgeValues,
      extra: {
        T: this.T,
        tmax: this.T - TAMB,
        extent: this.extent,
        heat: this.heat,
        totalC: total,
      },
    };
  }

  series(): SeriesKey[] {
    return this.bp.nodes
      .filter((n) => n.kind === "species")
      .slice(0, 6)
      .map((n) => ({ key: n.id, label: n.label }));
  }

  proof(): ProofMetric[] {
    const species = this.bp.nodes.filter((n) => n.kind === "species");
    const product = species.find((n) => /product|nh3|etoac|co2|ester/i.test(n.id + n.label)) ?? species[species.length - 1];
    const reactant = species[0];
    const cP = product ? this.c.get(product.id) ?? 0 : 0;
    const cR = reactant ? this.c.get(reactant.id) ?? 0 : 0;
    const cR0 = reactant ? reactant.params.c ?? reactant.params.n ?? 1 : 1;
    const conv = cR0 > 1e-9 ? (1 - cR / cR0) * 100 : 0;
    const dT = this.T - TAMB;
    const eqRes = this.reactions().length
      ? Math.abs(this.extent) > 0
        ? Math.min(1, 1 / (1 + Math.abs(this.extent)))
        : 1
      : 0;
    return [
      {
        id: "conv",
        label: "Conversion",
        value: conv,
        unit: "%",
        status: conv > 8 ? "pass" : conv > 1 ? "warn" : "fail",
        limit: 8,
        note: reactant ? `${reactant.label} consumed` : "limiting reactant",
      },
      {
        id: "yield",
        label: "Product conc.",
        value: cP,
        unit: "mol/L",
        status: cP > 0.05 ? "pass" : cP > 0.005 ? "warn" : "info",
        note: product ? product.label : "product",
      },
      {
        id: "tj",
        label: "Reactor T",
        value: this.T - 273.15,
        unit: "°C",
        status: this.T > 650 ? "fail" : this.T > 480 ? "warn" : "pass",
        limit: 377,
        note: dT > 0 ? "exotherm" : "endotherm / isothermal",
      },
      {
        id: "heat",
        label: "Heat released",
        value: this.heat,
        unit: "J",
        status: "info",
        note: "∫ −ΔH · rate dt",
      },
      {
        id: "eq",
        label: "Extent",
        value: this.extent,
        unit: "mol/L",
        status: Math.abs(this.extent) > 0.01 ? "pass" : "warn",
        note: eqRes < 0.2 ? "near stall" : "progressing",
      },
    ];
  }
}
