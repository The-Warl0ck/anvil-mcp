import { clamp } from "../../lib/utils.ts";
import type { Blueprint, ProofMetric, SeriesKey, SimSnapshot, Solver } from "../types.ts";

const NX = 36;
const NY = 36;

export class CellularSolver implements Solver {
  domain = "cellular" as const;
  recommendedDt = 5e-4;
  realPerWall = 0.35;
  bp!: Blueprint;
  t = 0;
  v = 0;
  w = 0;
  ca = 0.1;
  atp = 1;
  spikes = 0;
  lastSpike = -1;
  u: Float32Array = new Float32Array(NX * NY);
  vv: Float32Array = new Float32Array(NX * NY);
  nodeV = new Map<string, number>();

  reset(bp: Blueprint) {
    this.bp = bp;
    this.t = 0;
    this.v = -1.2;
    this.w = -0.6;
    this.ca = 0.1;
    this.atp = 1;
    this.spikes = 0;
    this.lastSpike = -1;
    this.u = new Float32Array(NX * NY);
    this.vv = new Float32Array(NX * NY);
    for (let i = 0; i < NX * NY; i++) {
      this.u[i] = 1;
      this.vv[i] = 0;
    }
    for (let k = 0; k < 40; k++) {
      const i = 12 + (k % 8);
      const j = 12 + Math.floor(k / 8);
      this.vv[j * NX + i] = 0.4 + Math.random() * 0.4;
    }
    this.nodeV.clear();
  }

  private lap(arr: Float32Array, x: number, y: number) {
    const i = (xx: number, yy: number) => arr[yy * NX + xx];
    const c = i(x, y);
    const l = x > 0 ? i(x - 1, y) : c;
    const r = x < NX - 1 ? i(x + 1, y) : c;
    const d = y > 0 ? i(x, y - 1) : c;
    const u = y < NY - 1 ? i(x, y + 1) : c;
    return l + r + d + u - 4 * c;
  }

  step(dt: number) {
    const I =
      this.bp.nodes
        .filter((n) => n.kind === "channel" || n.kind === "mitochondrion")
        .reduce((s, n) => s + (n.params.I ?? n.params.g ?? 0.4), 0) * 0.15 +
      0.35 * (1 + Math.sin(this.t * 6));

    const v = this.v;
    const w = this.w;
    const dv = v - (v * v * v) / 3 - w + I;
    const dw = 0.08 * (v + 0.7 - 0.8 * w);
    this.v = v + dv * dt * 12;
    this.w = w + dw * dt * 12;

    const vm = -0.07 + 0.045 * (this.v + 1.5);
    if (this.v > 1.0 && this.t - this.lastSpike > 0.04) {
      this.spikes += 1;
      this.lastSpike = this.t;
      this.ca = clamp(this.ca + 0.08, 0, 2);
    }
    this.ca *= Math.exp(-dt / 0.18);
    const mito = this.bp.nodes.filter((n) => n.kind === "mitochondrion").length || 1;
    this.atp = clamp(this.atp + dt * (0.4 * mito - 0.6 * Math.max(0, this.v)), 0.05, 1.4);

    const F = 0.025;
    const k = 0.056;
    const Du = 0.16;
    const Dv = 0.08;
    const un = new Float32Array(this.u);
    const vn = new Float32Array(this.vv);
    const h = dt * 18;
    for (let y = 1; y < NY - 1; y++) {
      for (let x = 1; x < NX - 1; x++) {
        const idx = y * NX + x;
        const u = this.u[idx];
        const vv = this.vv[idx];
        const uvv = u * vv * vv;
        un[idx] = u + (Du * this.lap(this.u, x, y) - uvv + F * (1 - u)) * h;
        vn[idx] = vv + (Dv * this.lap(this.vv, x, y) + uvv - (F + k) * vv) * h;
      }
    }
    this.u = un;
    this.vv = vn;

    for (const n of this.bp.nodes) {
      if (n.kind === "channel") {
        const g = n.params.g ?? 0.5;
        const E = n.params.E ?? 0;
        this.nodeV.set(n.id, vm + 0.01 * g * (E - vm));
      } else if (n.kind === "mitochondrion") {
        this.nodeV.set(n.id, this.atp);
      } else if (n.kind === "organelle") {
        this.nodeV.set(n.id, this.ca);
      } else {
        this.nodeV.set(n.id, vm);
      }
    }
    this.t += dt;
  }

  snapshot(): SimSnapshot {
    const nodeValues: Record<string, number> = {};
    const nodeHeat: Record<string, number> = {};
    for (const n of this.bp.nodes) {
      nodeValues[n.id] = this.nodeV.get(n.id) ?? 0;
      nodeHeat[n.id] = n.kind === "mitochondrion" ? this.atp : this.ca;
    }
    let contrast = 0;
    let mean = 0;
    for (let i = 0; i < this.vv.length; i++) mean += this.vv[i];
    mean /= this.vv.length;
    for (let i = 0; i < this.vv.length; i++) contrast += Math.abs(this.vv[i] - mean);
    contrast /= this.vv.length;
    return {
      time: this.t,
      nodeValues,
      nodeHeat,
      edgeValues: {},
      extra: {
        vm: -0.07 + 0.045 * (this.v + 1.5),
        ca: this.ca,
        atp: this.atp,
        spikes: this.spikes,
        contrast,
      },
      field: { nx: NX, ny: NY, values: Array.from(this.vv) },
    };
  }

  series(): SeriesKey[] {
    return [
      { key: "vm", label: "Vm" },
      { key: "ca", label: "[Ca]" },
      { key: "atp", label: "ATP" },
    ];
  }

  proof(): ProofMetric[] {
    const vm = -0.07 + 0.045 * (this.v + 1.5);
    const rate = this.t > 0.2 ? this.spikes / this.t : 0;
    let contrast = 0;
    let mean = 0;
    for (let i = 0; i < this.vv.length; i++) mean += this.vv[i];
    mean /= this.vv.length || 1;
    for (let i = 0; i < this.vv.length; i++) contrast += Math.abs(this.vv[i] - mean);
    contrast /= this.vv.length || 1;
    return [
      {
        id: "vm",
        label: "Membrane potential",
        value: vm,
        unit: "V",
        status: vm > -0.09 && vm < 0.04 ? "pass" : "fail",
        note: "FitzHugh–Nagumo mapped onto a neuronal rest/spike range.",
      },
      {
        id: "spk",
        label: "Spike rate",
        value: rate,
        unit: "Hz",
        status: rate > 0.5 && rate < 80 ? "pass" : this.t < 0.3 ? "info" : "warn",
        note: "Excitability without depolarization block.",
      },
      {
        id: "ca",
        label: "Cytosolic calcium",
        value: this.ca,
        unit: "AU",
        status: this.ca < 0.8 ? "pass" : "fail",
        limit: 0.8,
        note: "Overload would apoptose this layout.",
      },
      {
        id: "atp",
        label: "ATP charge",
        value: this.atp,
        unit: "AU",
        status: this.atp > 0.25 ? "pass" : "fail",
        note: "Mitochondrial count vs. spike cost.",
      },
      {
        id: "tur",
        label: "Morphogen contrast",
        value: contrast,
        unit: "",
        status: contrast > 0.08 ? "pass" : "info",
        note: "Gray–Scott on the membrane (Turing-like).",
      },
    ];
  }
}
