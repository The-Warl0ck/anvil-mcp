import { clamp } from "../../lib/utils.ts";
import type { Blueprint, ProofMetric, SeriesKey, SimSnapshot, Solver } from "../types.ts";

const N = 160;
const HBAR = 0.6582;
const H2M = 0.0381 / 0.067;

export class QuantumSolver implements Solver {
  domain = "quantum" as const;
  recommendedDt = 1;
  realPerWall = 960;
  bp!: Blueprint;
  t = 0;
  re = new Float64Array(N);
  im = new Float64Array(N);
  V = new Float64Array(N);
  dx = 20 / N;
  trans = 0;
  refl = 0;
  bloch = { x: 0, y: 0, z: 1 };
  omega = 5e9;
  T2 = 2e-5;

  reset(bp: Blueprint) {
    this.bp = bp;
    this.t = 0;
    this.re = new Float64Array(N);
    this.im = new Float64Array(N);
    this.V = new Float64Array(N);
    this.trans = 0;
    this.refl = 0;
    const bar = bp.nodes.find((n) => n.kind === "barrier");
    const V0 = bar?.params.V_eV ?? 0.22;
    const w = bar?.params.w_nm ?? 4;
    const x0 = 5.5;
    const sigma = 1.4;
    const k0 = 2.2;
    let norm = 0;
    for (let i = 0; i < N; i++) {
      const x = i * this.dx;
      const g = Math.exp(-((x - x0) ** 2) / (2 * sigma * sigma));
      this.re[i] = g * Math.cos(k0 * x);
      this.im[i] = g * Math.sin(k0 * x);
      norm += g * g;
      const xc = 10;
      this.V[i] = Math.abs(x - xc) < w / 2 ? V0 : 0;
      if (x < 0.4 || x > 19.6) this.V[i] = 2.5;
    }
    norm = Math.sqrt(norm);
    for (let i = 0; i < N; i++) {
      this.re[i] /= norm;
      this.im[i] /= norm;
    }
    const q = bp.nodes.find((n) => n.kind === "qubit");
    this.omega = q?.params.omega ?? 5e9;
    this.T2 = q?.params.T2 ?? 2e-5;
    this.bloch = { x: 1, y: 0, z: 0 };
  }

  step(dt: number) {
    const h = 0.02;
    const re = this.re;
    const im = this.im;
    const V = this.V;
    const nre = new Float64Array(N);
    const nim = new Float64Array(N);
    const ckin = H2M / (this.dx * this.dx);
    for (let i = 1; i < N - 1; i++) {
      const kRe = -ckin * (re[i + 1] - 2 * re[i] + re[i - 1]) + V[i] * re[i];
      const kIm = -ckin * (im[i + 1] - 2 * im[i] + im[i - 1]) + V[i] * im[i];
      nre[i] = re[i] + (h / HBAR) * kIm;
      nim[i] = im[i] - (h / HBAR) * kRe;
    }
    nre[0] = 0;
    nim[0] = 0;
    nre[N - 1] = 0;
    nim[N - 1] = 0;
    let nrm = 0;
    for (let i = 0; i < N; i++) nrm += nre[i] * nre[i] + nim[i] * nim[i];
    nrm = Math.sqrt(Math.max(nrm, 1e-18));
    for (let i = 0; i < N; i++) {
      this.re[i] = nre[i] / nrm;
      this.im[i] = nim[i] / nrm;
    }
    let left = 0;
    let right = 0;
    const mid = Math.floor(N / 2);
    for (let i = 0; i < N; i++) {
      const p = this.re[i] ** 2 + this.im[i] ** 2;
      if (i < mid) left += p;
      else right += p;
    }
    this.refl = left;
    this.trans = right;

    const w = this.omega * 2 * Math.PI * 1e-12;
    const decay = Math.exp(-dt / Math.max(this.T2 * 1e12, 1));
    const c = Math.cos(w * dt);
    const s = Math.sin(w * dt);
    const x = this.bloch.x;
    const y = this.bloch.y;
    this.bloch.x = (x * c - y * s) * decay;
    this.bloch.y = (x * s + y * c) * decay;
    this.bloch.z = clamp(this.bloch.z * decay + (1 - decay) * 0.05, -1, 1);
    this.t += dt * 1e-15;
  }

  snapshot(): SimSnapshot {
    const psiAbs: number[] = [];
    const potential: number[] = [];
    for (let i = 0; i < N; i++) {
      psiAbs.push(this.re[i] ** 2 + this.im[i] ** 2);
      potential.push(this.V[i]);
    }
    const nodeValues: Record<string, number> = {};
    for (const n of this.bp.nodes) {
      if (n.kind === "barrier") nodeValues[n.id] = n.params.V_eV ?? 0;
      else if (n.kind === "qubit") nodeValues[n.id] = Math.hypot(this.bloch.x, this.bloch.y);
      else nodeValues[n.id] = n.x < 50 ? this.refl : this.trans;
    }
    return {
      time: this.t,
      nodeValues,
      nodeHeat: {},
      edgeValues: {},
      extra: { T: this.trans, R: this.refl, purity: Math.hypot(this.bloch.x, this.bloch.y, this.bloch.z) },
      wave: { n: N, psiAbs, potential },
      bloch: { ...this.bloch },
    };
  }

  series(): SeriesKey[] {
    return [
      { key: "T", label: "Transmission" },
      { key: "R", label: "Reflection" },
    ];
  }

  proof(): ProofMetric[] {
    const bar = this.bp.nodes.find((n) => n.kind === "barrier");
    const V0 = bar?.params.V_eV ?? 0.22;
    const w = bar?.params.w_nm ?? 4;
    const E = 0.12;
    const m = 0.067;
    const kappa = V0 > E ? Math.sqrt(2 * m * 26.25 * (V0 - E)) : 0;
    const Twkb = V0 > E ? Math.exp(-2 * kappa * w) : 1;
    const T = this.trans;
    return [
      {
        id: "T",
        label: "Transmission",
        value: T,
        unit: "",
        status: T > 0.05 ? "pass" : T > 0.01 ? "warn" : "fail",
        limit: 0.05,
        note: "Probability on the collector side of the barrier.",
      },
      {
        id: "wkb",
        label: "WKB estimate",
        value: Twkb,
        unit: "",
        status: "info",
        note: `T ≈ exp(−2κL), κ from V0=${V0} eV, L=${w} nm, E=0.12 eV.`,
      },
      {
        id: "pur",
        label: "Qubit Bloch radius",
        value: Math.hypot(this.bloch.x, this.bloch.y, this.bloch.z),
        unit: "",
        status: Math.hypot(this.bloch.x, this.bloch.y, this.bloch.z) > 0.3 ? "pass" : "warn",
        note: "T2 decay on the two-level system sitting above the well.",
      },
      {
        id: "V",
        label: "Barrier height",
        value: V0,
        unit: "eV",
        status: V0 > 0 && V0 < 0.5 ? "pass" : "warn",
        note: "Keep within a few kT of the packet energy to couple the dots.",
      },
    ];
  }
}
