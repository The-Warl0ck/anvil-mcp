import { clamp } from "../../lib/utils.ts";
import type { Blueprint, ProofMetric, SeriesKey, SimSnapshot, Solver } from "../types.ts";

/**
 * Engines, gear pairs, printable parts.
 * Slider-crank kinematics + gas load; Lewis/Hertz-ish gears; beam part for FDM.
 */
export class MachinesSolver implements Solver {
  domain = "machines" as const;
  recommendedDt = 2e-4;
  realPerWall = 0.08;
  bp!: Blueprint;
  t = 0;
  theta = 0;
  omega = 120;
  Fp = 0;
  Frod = 0;
  xp = 0;
  sigma = 0;
  rpm = 0;
  peakF = 0;
  peakS = 0;

  reset(bp: Blueprint) {
    this.bp = bp;
    this.t = 0;
    this.theta = 0;
    const crank = bp.nodes.find((n) => n.kind === "crank");
    this.omega = crank?.params.omega ?? ((crank?.params.rpm ?? 1800) * 2 * Math.PI) / 60;
    this.Fp = 0;
    this.Frod = 0;
    this.xp = 0;
    this.sigma = 0;
    this.peakF = 0;
    this.peakS = 0;
    this.rpm = (this.omega * 60) / (2 * Math.PI);
  }

  private crank() {
    return this.bp.nodes.find((n) => n.kind === "crank");
  }
  private piston() {
    return this.bp.nodes.find((n) => n.kind === "piston");
  }
  private rodLen() {
    const n = this.bp.nodes.find((x) => x.kind === "rod");
    if (n) return n.params.L ?? 0.12;
    const e = this.bp.edges.find((x) => x.kind === "rod");
    return e?.params.L ?? 0.12;
  }
  private rodD() {
    const n = this.bp.nodes.find((x) => x.kind === "rod");
    if (n) return n.params.d ?? 0.01;
    const e = this.bp.edges.find((x) => x.kind === "rod");
    return e?.params.d ?? 0.01;
  }
  private isEngine() {
    return !!(this.crank() && this.piston());
  }
  private isGear() {
    return this.bp.nodes.filter((n) => n.kind === "gear").length >= 2;
  }

  step(dt: number) {
    if (this.isEngine()) {
      this.theta += this.omega * dt;
      const r = this.crank()?.params.r ?? 0.03;
      const L = this.rodLen();
      const s = Math.sin(this.theta);
      const c = Math.cos(this.theta);
      const root = Math.sqrt(Math.max(1e-8, L * L - r * r * s * s));
      this.xp = r * c + root;
      const bore = this.piston()?.params.bore ?? 0.05;
      const P = this.piston()?.params.P ?? 1.2e6;
      this.Fp = P * (Math.PI * bore * bore) / 4 * Math.max(0, c);
      const phi = Math.asin(clamp((r / L) * s, -0.99, 0.99));
      this.Frod = this.Fp / Math.max(0.2, Math.cos(phi));
      const d = this.rodD();
      this.sigma = this.Frod / Math.max(1e-8, Math.PI * d * d * 0.25);
      this.peakF = Math.max(this.peakF, this.Frod);
      this.peakS = Math.max(this.peakS, this.sigma);
      this.rpm = (this.omega * 60) / (2 * Math.PI);
    }
    this.t += dt;
  }

  snapshot(): SimSnapshot {
    const nodeValues: Record<string, number> = {};
    const nodeHeat: Record<string, number> = {};
    const edgeValues: Record<string, number> = {};
    for (const n of this.bp.nodes) {
      if (n.kind === "piston") nodeValues[n.id] = this.xp;
      else if (n.kind === "crank") nodeValues[n.id] = this.theta;
      else if (n.kind === "gear") nodeValues[n.id] = n.params.z ?? 0;
      else nodeValues[n.id] = this.sigma;
      nodeHeat[n.id] = this.sigma / 1e7;
    }
    for (const e of this.bp.edges) edgeValues[e.id] = this.Frod;
    return {
      time: this.t,
      nodeValues,
      nodeHeat,
      edgeValues,
      extra: { theta: this.theta, xp: this.xp, Frod: this.Frod, sigma: this.sigma, rpm: this.rpm, peakS: this.peakS },
    };
  }

  series(): SeriesKey[] {
    const p = this.piston();
    if (p) return [{ key: p.id, label: p.label }];
    return this.bp.nodes.slice(0, 3).map((n) => ({ key: n.id, label: n.label }));
  }

  proof(): ProofMetric[] {
    if (this.isEngine()) return this.engineProof();
    if (this.isGear()) return this.gearProof();
    return this.partProof();
  }

  private engineProof(): ProofMetric[] {
    const r = this.crank()?.params.r ?? 0.03;
    const stroke = 2 * r;
    const mean = (2 * stroke * this.rpm) / 60;
    const steel = 3.5e8;
    // Non-positive or NaN peak stress is non-physical — fail loudly, never
    // map it to a comforting sf = 99.
    const badLoad = !(this.peakS > 0) || !isFinite(this.peakS);
    const sf = this.peakS > 0 ? steel / this.peakS : 99;
    return [
      {
        id: "rpm",
        label: "Crank speed",
        value: this.rpm,
        unit: "rpm",
        status: "info",
        note: "ω from crank.omega or rpm. Slider-crank x = r cosθ + √(L² − r² sin²θ).",
      },
      {
        id: "up",
        label: "Mean piston speed",
        value: mean,
        unit: "m/s",
        status: mean > 25 ? "fail" : mean > 18 ? "warn" : "pass",
        limit: 18,
        note: "2 · stroke · rpm / 60. Small-engine heuristic < 18 m/s.",
      },
      {
        id: "srod",
        label: "Peak rod stress",
        value: this.peakS,
        unit: "Pa",
        status: badLoad ? "fail" : sf < 2 ? "fail" : sf < 4 ? "warn" : "pass",
        note: badLoad
          ? "Non-physical peak stress (≤0 or NaN) — check load path / params."
          : "σ = F_rod / (π d²/4), F_rod = F_gas / cosφ. Gas load P·A·max(cosθ,0).",
      },
      {
        id: "sf",
        label: "Rod safety factor",
        value: sf,
        unit: "",
        status: badLoad ? "fail" : sf < 2 ? "fail" : sf < 4 ? "warn" : "pass",
        limit: 4,
        note: badLoad
          ? "Non-physical load — safety factor is meaningless; fix inputs."
          : "Against 350 MPa (mild steel). Not fatigue / Goodman.",
      },
      {
        id: "F",
        label: "Peak rod force",
        value: this.peakF,
        unit: "N",
        status: "info",
        note: "Also the main-bearing load in this 1-cyl model.",
      },
    ];
  }

  private gearProof(): ProofMetric[] {
    const gears = this.bp.nodes.filter((n) => n.kind === "gear");
    const a = gears[0];
    const b = gears[1];
    const z1 = a.params.z ?? 20;
    const z2 = b.params.z ?? 40;
    const mod = a.params.m ?? 2e-3;
    const T = a.params.T ?? 8;
    const bW = a.params.b ?? 0.012;
    const i = z2 / z1;
    const Ft = T / Math.max(1e-6, (mod * z1) / 2);
    const y = 0.154 - 0.912 / z1;
    const sigma = Ft / Math.max(1e-8, bW * mod * Math.max(y, 0.05));
    const steel = 2.0e8;
    const badLoad = !(sigma > 0) || !isFinite(sigma);
    const sf = sigma > 0 ? steel / sigma : 99;
    return [
      {
        id: "ratio",
        label: "Ratio z2/z1",
        value: i,
        unit: "",
        status: "info",
        note: "Spur pair. Center distance ≈ m(z1+z2)/2.",
      },
      {
        id: "lewis",
        label: "Lewis bending σ",
        value: sigma,
        unit: "Pa",
        status: badLoad ? "fail" : sf < 1.5 ? "fail" : sf < 2.5 ? "warn" : "pass",
        note: badLoad
          ? "Non-physical bending stress (≤0 or NaN) — check torque / geometry."
          : "σ = Ft / (b m Y), Y ≈ 0.154 − 0.912/z. First-pass tooth root.",
      },
      {
        id: "sf",
        label: "Tooth safety factor",
        value: sf,
        unit: "",
        status: badLoad ? "fail" : sf < 1.5 ? "fail" : sf < 2.5 ? "warn" : "pass",
        limit: 2.5,
        note: badLoad
          ? "Non-physical load — safety factor is meaningless; fix inputs."
          : "Against 200 MPa allowable (untreated steel). No AGMA K factors.",
      },
      {
        id: "Ft",
        label: "Tangential load",
        value: Ft,
        unit: "N",
        status: "info",
        note: "Ft = T / (m z / 2).",
      },
    ];
  }

  private partProof(): ProofMetric[] {
    const p = this.bp.nodes.find((n) => n.kind === "part") ?? this.bp.nodes[this.bp.nodes.length - 1];
    const L = p.params.L ?? 0.06;
    const b = p.params.b ?? 0.018;
    const t = p.params.t ?? 0.004;
    const F = p.params.F ?? 40;
    const E = p.params.E ?? 2.3e9;
    const sigma = (6 * F * L) / Math.max(1e-12, b * t * t);
    const ys = p.params.ys ?? 4.0e7;
    const badLoad = !(sigma > 0) || !isFinite(sigma);
    const sf = sigma > 0 ? ys / sigma : 99;
    const wallMm = t * 1000;
    const overhang = p.params.overhang ?? 0;
    return [
      {
        id: "s",
        label: "Bending stress",
        value: sigma,
        unit: "Pa",
        status: badLoad ? "fail" : sf < 2 ? "fail" : sf < 3 ? "warn" : "pass",
        note: badLoad
          ? "Non-physical bending stress (≤0 or NaN) — check load / dimensions."
          : "σ = 6FL / bt² for a cantilevered part. Print orientation assumed load in-plane.",
      },
      {
        id: "sf",
        label: "Safety factor",
        value: sf,
        unit: "",
        status: badLoad ? "fail" : sf < 2 ? "fail" : sf < 3 ? "warn" : "pass",
        limit: 3,
        note: badLoad
          ? "Non-physical load — safety factor is meaningless; fix inputs."
          : `YS ${ys} Pa (default PLA-ish 40 MPa unless ys set).`,
      },
      {
        id: "wall",
        label: "Min wall",
        value: wallMm,
        unit: "mm",
        status: wallMm < 0.8 ? "fail" : wallMm < 1.2 ? "warn" : "pass",
        limit: 0.8,
        note: "FDM heuristic: walls ≥ 0.8 mm (two 0.4 mm perimeters).",
      },
      {
        id: "over",
        label: "Overhang",
        value: overhang,
        unit: "deg",
        status: overhang > 55 ? "fail" : overhang > 45 ? "warn" : "pass",
        limit: 45,
        note: "Unsupported overhang vs 45° FDM rule of thumb.",
      },
      {
        id: "def",
        label: "Tip δ (est.)",
        value: (F * L ** 3) / (3 * E * ((b * t ** 3) / 12)),
        unit: "m",
        status: "info",
        note: "δ = FL³ / 3EI, I = bt³/12. Linear isotropic — not anisotropic print.",
      },
    ];
  }
}
