import { clamp } from "../../lib/utils.ts";
import type { Blueprint, ProofMetric, SeriesKey, SimSnapshot, Solver } from "../types.ts";

const G = 9.81;

function links(bp: Blueprint) {
  return bp.edges.filter((e) => e.kind === "link" || e.kind === "arm");
}

/**
 * Planar serial arm. Forward kinematics + gravity torques (static).
 * Joints integrate toward a commanded pose with a PD; proof is peak τ vs rating,
 * reach, payload margin, joint limits.
 */
export class RoboticsSolver implements Solver {
  domain = "robotics" as const;
  recommendedDt = 0.002;
  realPerWall = 1.2;
  bp!: Blueprint;
  t = 0;
  q = new Map<string, number>();
  dq = new Map<string, number>();
  tau = new Map<string, number>();
  peakTau = 0;
  reach = 0;
  x = 0;
  y = 0;

  reset(bp: Blueprint) {
    this.bp = bp;
    this.t = 0;
    this.q.clear();
    this.dq.clear();
    this.tau.clear();
    this.peakTau = 0;
    for (const n of bp.nodes) {
      if (n.kind === "joint" || n.kind === "ee") {
        this.q.set(n.id, n.params.q ?? 0.35);
        this.dq.set(n.id, 0);
      }
    }
    this.fk();
  }

  private chain() {
    const base = this.bp.nodes.find((n) => n.kind === "base") ?? this.bp.nodes[0];
    const ordered: string[] = [];
    if (!base) return ordered;
    let cur = base.id;
    const used = new Set<string>();
    ordered.push(cur);
    for (let k = 0; k < 12; k++) {
      const e = links(this.bp).find((l) => l.from === cur && !used.has(l.id));
      if (!e) break;
      used.add(e.id);
      cur = e.to;
      ordered.push(cur);
    }
    return ordered;
  }

  private fk() {
    const ids = this.chain();
    let x = 0;
    let y = 0;
    let ang = 0;
    let reach = 0;
    for (let i = 0; i < ids.length - 1; i++) {
      const e = links(this.bp).find((l) => l.from === ids[i] && l.to === ids[i + 1]);
      const L = Math.max(e?.params.L ?? 0.18, 0.02);
      const j = this.bp.nodes.find((n) => n.id === ids[i + 1]);
      const q = this.q.get(ids[i + 1]) ?? this.q.get(ids[i]) ?? 0;
      ang += q;
      x += L * Math.cos(ang);
      y += L * Math.sin(ang);
      reach += L;
      if (j) {
        const m = j.params.m ?? 0.4;
        const tauG = m * G * (L / 2) * Math.cos(ang);
        this.tau.set(j.id, tauG);
        this.peakTau = Math.max(this.peakTau, Math.abs(tauG));
      }
    }
    this.x = x;
    this.y = y;
    this.reach = reach;
  }

  step(dt: number) {
    const ids = this.chain();
    for (let i = 1; i < ids.length; i++) {
      const n = this.bp.nodes.find((nd) => nd.id === ids[i]);
      if (!n || n.kind === "base") continue;
      const qdes = n.params.qdes ?? n.params.q ?? 0.4;
      const q = this.q.get(n.id) ?? 0;
      const dq = this.dq.get(n.id) ?? 0;
      const qmin = n.params.qmin ?? -2.6;
      const qmax = n.params.qmax ?? 2.6;
      const acc = 48 * (qdes - q) - 8 * dq;
      const ndq = dq + acc * dt;
      const nq = clamp(q + ndq * dt, qmin, qmax);
      this.dq.set(n.id, ndq);
      this.q.set(n.id, nq);
    }
    this.fk();
    const ee = this.bp.nodes.find((n) => n.kind === "ee");
    const payload = ee?.params.payload ?? 0;
    if (payload > 0 && ids.length > 1) {
      const last = ids[ids.length - 1];
      const extra = payload * G * Math.max(0.05, this.reach * 0.35);
      this.tau.set(last, (this.tau.get(last) ?? 0) + extra);
      this.peakTau = Math.max(this.peakTau, Math.abs(this.tau.get(last) ?? 0));
    }
    this.t += dt;
  }

  snapshot(): SimSnapshot {
    const nodeValues: Record<string, number> = {};
    const nodeHeat: Record<string, number> = {};
    const edgeValues: Record<string, number> = {};
    for (const n of this.bp.nodes) {
      nodeValues[n.id] = this.q.get(n.id) ?? this.tau.get(n.id) ?? 0;
      nodeHeat[n.id] = Math.abs(this.tau.get(n.id) ?? 0);
    }
    for (const e of this.bp.edges) edgeValues[e.id] = e.params.L ?? 0;
    return {
      time: this.t,
      nodeValues,
      nodeHeat,
      edgeValues,
      extra: { reach: this.reach, x: this.x, y: this.y, tau: this.peakTau },
    };
  }

  series(): SeriesKey[] {
    return this.bp.nodes.filter((n) => n.kind === "joint" || n.kind === "ee").slice(0, 5).map((n) => ({ key: n.id, label: n.label }));
  }

  proof(): ProofMetric[] {
    const joints = this.bp.nodes.filter((n) => n.kind === "joint" || n.kind === "ee");
    const tauMax = Math.max(...joints.map((n) => n.params.tau ?? 6), 1);
    const payload = this.bp.nodes.find((n) => n.kind === "ee")?.params.payload ?? 0;
    const margin = tauMax > 0 ? tauMax / Math.max(this.peakTau, 1e-6) : 0;
    const limited = joints.filter((n) => {
      const q = this.q.get(n.id) ?? 0;
      return q <= (n.params.qmin ?? -2.6) + 0.02 || q >= (n.params.qmax ?? 2.6) - 0.02;
    }).length;
    return [
      {
        id: "reach",
        label: "Reach (Σ L)",
        value: this.reach,
        unit: "m",
        status: this.reach > 0.3 ? "pass" : "warn",
        note: "Planar serial FK. Workspace is a disc of radius ΣL (no obstacle field).",
      },
      {
        id: "tau",
        label: "Peak gravity τ",
        value: this.peakTau,
        unit: "N·m",
        status: this.peakTau > tauMax ? "fail" : this.peakTau > tauMax * 0.7 ? "warn" : "pass",
        limit: tauMax,
        note: "Static τᵢ ≈ m g ℓ_c cosθ + payload lever. No Coriolis / motor dynamics.",
      },
      {
        id: "sf",
        label: "Actuator margin",
        value: margin,
        unit: "",
        status: margin < 1 ? "fail" : margin < 1.5 ? "warn" : "pass",
        limit: 1.5,
        note: "τ_rated / τ_peak. Spec ≥ 1.5 for a first payload case.",
      },
      {
        id: "pay",
        label: "Payload",
        value: payload,
        unit: "kg",
        status: payload > 0 ? "info" : "info",
        note: "End-effector mass used in the gravity load.",
      },
      {
        id: "lim",
        label: "Joints at stop",
        value: limited,
        unit: "",
        status: limited > 0 ? "warn" : "pass",
        note: "q saturating qmin/qmax — singularity / reach wall.",
      },
    ];
  }
}
