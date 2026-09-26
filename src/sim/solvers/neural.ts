import { clamp } from "../../lib/utils.ts";
import type { Blueprint, LabNode, ProofMetric, SeriesKey, SimSnapshot, Solver } from "../types.ts";

interface Cell {
  v: number;
  u: number;
  spikes: number;
  last: number;
}

interface Event {
  t: number;
  to: string;
  w: number;
}

const INTENT = ["idle", "listening", "speaking", "thinking", "work"] as const;

const EXPECTED: Record<(typeof INTENT)[number], string[]> = {
  idle: ["PCC", "dlPFC", "FPole", "ACC"],
  listening: ["A1", "Wernicke", "Insula", "STS"],
  speaking: ["Broca", "M1", "A1", "SMA", "Wernicke"],
  thinking: ["dlPFC", "FPole", "ACC", "PCC"],
  work: ["dlPFC", "AG", "Cerebellum", "SMA"],
};

const REGION_SPEC: Record<string, { domains: string[]; label: string }> = {
  V1: { domains: ["sensory"], label: "V1 visual" },
  A1: { domains: ["sensory"], label: "A1 auditory" },
  S1: { domains: ["sensory"], label: "S1 touch" },
  M1: { domains: ["sensory"], label: "M1 motor" },
  Broca: { domains: ["core", "logical"], label: "Broca" },
  Wernicke: { domains: ["core"], label: "Wernicke" },
  dlPFC: { domains: ["logical", "planning"], label: "dlPFC" },
  vmPFC: { domains: ["emotional"], label: "vmPFC" },
  ACC: { domains: ["security"], label: "ACC" },
  PCC: { domains: ["persona"], label: "PCC" },
  AG: { domains: ["research"], label: "Angular" },
  Insula: { domains: ["biological", "sensory"], label: "Insula" },
  Amygdala: { domains: ["security", "emotional"], label: "Amygdala" },
  Hippocampus: { domains: ["research"], label: "Hippocampus" },
  Thalamus: { domains: ["core"], label: "Thalamus" },
  NAcc: { domains: ["emotional"], label: "NAcc" },
  Cerebellum: { domains: ["planning"], label: "Cerebellum" },
  FPole: { domains: ["persona"], label: "Frontopolar" },
  TPJ: { domains: ["social"], label: "TPJ" },
  SMA: { domains: ["planning", "sensory"], label: "SMA" },
  STS: { domains: ["social", "sensory"], label: "STS" },
  PAG: { domains: ["security", "biological"], label: "PAG" },
};

function regionKind(n: LabNode) {
  if (n.kind === "region") return String(n.label || "").split(" ")[0];
  return n.kind;
}

export class NeuralSolver implements Solver {
  domain = "neural" as const;
  recommendedDt = 5e-4;
  realPerWall = 0.12;
  bp!: Blueprint;
  t = 0;
  cells = new Map<string, Cell>();
  queue: Event[] = [];
  Ibuf = new Map<string, number>();
  pulses: { edgeId: string; u: number; born: number }[] = [];
  homology = new Map<string, number>();
  why: Record<string, { kind: string; id: string; gain: number }[]> = {};
  flow = false;
  intent: (typeof INTENT)[number] = "idle";

  reset(bp: Blueprint) {
    this.bp = bp;
    this.t = 0;
    this.cells.clear();
    this.queue = [];
    this.pulses = [];
    this.Ibuf.clear();
    this.homology.clear();
    this.why = {};
    this.flow = bp.nodes.some((n) => n.kind === "stimulus");
    for (const n of bp.nodes) {
      this.cells.set(n.id, { v: n.params.c ?? -65, u: (n.params.b ?? 0.2) * (n.params.c ?? -65), spikes: 0, last: -1 });
      this.Ibuf.set(n.id, 0);
    }
  }

  step(dt: number) {
    const ms = dt * 1000;
    for (const n of this.bp.nodes) this.Ibuf.set(n.id, n.params.Ibias ?? 0);
    const stim = this.bp.nodes.find((n) => n.kind === "stimulus");
    if (stim) {
      this._applyHomology(stim);
    } else {
      const drive = 8 + 6 * Math.sin(this.t * 2 * Math.PI * 40);
      const first = this.bp.nodes[0];
      if (first) this.Ibuf.set(first.id, (this.Ibuf.get(first.id) ?? 0) + drive);
    }

    this.queue = this.queue.filter((ev) => {
      if (ev.t > this.t) return true;
      this.Ibuf.set(ev.to, (this.Ibuf.get(ev.to) ?? 0) + ev.w);
      return false;
    });

    for (const n of this.bp.nodes) {
      if (n.kind === "stimulus") continue;
      const c = this.cells.get(n.id)!;
      const a = n.params.a ?? 0.02;
      const b = n.params.b ?? 0.2;
      const cc = n.params.c ?? -65;
      const d = n.params.d ?? 8;
      const I = this.Ibuf.get(n.id) ?? 0;
      let v = c.v;
      let u = c.u;
      const steps = 2;
      const h = ms / steps;
      for (let s = 0; s < steps; s++) {
        const dv = 0.04 * v * v + 5 * v + 140 - u + I;
        const du = a * (b * v - u);
        v += dv * h;
        u += du * h;
      }
      if (v >= 30) {
        v = cc;
        u += d;
        c.spikes += 1;
        c.last = this.t;
        for (const e of this.bp.edges) {
          if (e.from !== n.id) continue;
          const delay = e.params.delay ?? 0.002;
          this.queue.push({ t: this.t + delay, to: e.to, w: e.params.w ?? 5 });
          this.pulses.push({ edgeId: e.id, u: 0, born: this.t });
        }
      }
      c.v = clamp(v, -90, 40);
      c.u = u;
    }

    this.pulses = this.pulses
      .map((p) => ({ ...p, u: (this.t - p.born) / 0.006 }))
      .filter((p) => p.u < 1.05);

    this.t += dt;
  }

  _applyHomology(stim: LabNode) {
    const idx = Math.round(clamp(stim.params.intent ?? 1, 0, 4));
    this.intent = INTENT[idx] ?? "idle";
    const domainW: Record<string, number> = {
      sensory: stim.params.sensory ?? 0,
      social: stim.params.social ?? 0,
      logical: stim.params.logical ?? 0,
      emotional: stim.params.emotional ?? 0,
      security: stim.params.security ?? 0,
      biological: stim.params.biological ?? 0,
      planning: stim.params.planning ?? 0,
      core: stim.params.core ?? 0,
      research: stim.params.research ?? 0,
      persona: stim.params.persona ?? 0,
    };
    const expected = new Set(EXPECTED[this.intent]);
    this.homology.clear();
    this.why = {};
    for (const n of this.bp.nodes) {
      if (n.kind === "stimulus") {
        this.homology.set(n.id, 1);
        continue;
      }
      const kind = regionKind(n);
      const spec = REGION_SPEC[kind];
      if (!spec) continue;
      let fire = 0.08;
      const why: { kind: string; id: string; gain: number }[] = [];
      if (expected.has(kind)) {
        fire += 0.55;
        why.push({ kind: "intent", id: this.intent, gain: 0.55 });
      }
      for (const d of spec.domains) {
        const w = domainW[d] ?? 0;
        if (w > 0.04) {
          const g = w * 0.5;
          fire += g;
          why.push({ kind: "domain", id: d, gain: g });
        }
      }
      fire = clamp(fire, 0, 1);
      this.homology.set(n.id, fire);
      this.why[n.id] = why;
      this.Ibuf.set(n.id, (this.Ibuf.get(n.id) ?? 0) + fire * 14);
    }
  }

  snapshot(): SimSnapshot {
    const nodeValues: Record<string, number> = {};
    const nodeHeat: Record<string, number> = {};
    const edgeValues: Record<string, number> = {};
    for (const n of this.bp.nodes) {
      const c = this.cells.get(n.id);
      const hom = this.homology.get(n.id) ?? 0;
      if (this.flow) {
        nodeValues[n.id] = hom;
        nodeHeat[n.id] = hom;
      } else {
        nodeValues[n.id] = (c?.v ?? 0) / 100;
        nodeHeat[n.id] = this.t - (c?.last ?? -1) < 0.004 ? 1 : 0;
      }
    }
    for (const e of this.bp.edges) {
      const a = this.homology.get(e.from) ?? 0;
      const b = this.homology.get(e.to) ?? 0;
      edgeValues[e.id] = this.flow ? Math.sqrt(Math.max(0, a * b)) : 0;
    }
    const rates = this.bp.nodes.map((n) => (this.t > 0.05 ? (this.cells.get(n.id)?.spikes ?? 0) / this.t : 0));
    const expected = EXPECTED[this.intent] || [];
    const onBench = expected.filter((k) => this.bp.nodes.some((n) => regionKind(n) === k));
    const firing = onBench.filter((k) => {
      const n = this.bp.nodes.find((x) => regionKind(x) === k);
      return n ? (this.homology.get(n.id) ?? 0) > 0.35 : false;
    });
    return {
      time: this.t,
      nodeValues,
      nodeHeat,
      edgeValues,
      extra: {
        rate0: rates[0] ?? 0,
        rateOut: rates[rates.length - 1] ?? 0,
        spikes: [...this.cells.values()].reduce((s, c) => s + c.spikes, 0),
        coverage: expected.length ? firing.length / expected.length : 0,
        intent: INTENT.indexOf(this.intent),
      },
      pulses: this.pulses.map((p) => ({ edgeId: p.edgeId, u: p.u })),
    };
  }

  series(): SeriesKey[] {
    return this.bp.nodes.slice(0, 4).map((n) => ({ key: n.id, label: n.label }));
  }

  proof(): ProofMetric[] {
    if (this.flow) return this._flowProof();
    const cells = this.bp.nodes.map((n) => this.cells.get(n.id)!);
    const inR = this.t > 0.1 ? (cells[0]?.spikes ?? 0) / this.t : 0;
    const outR = this.t > 0.1 ? (cells[cells.length - 1]?.spikes ?? 0) / this.t : 0;
    const fidelity = inR > 1 ? outR / inR : 0;
    const energy = cells.reduce((s, c) => s + c.spikes * 3.6e-10, 0);
    const maxRate = Math.max(0, ...cells.map((c) => (this.t > 0 ? c.spikes / this.t : 0)));
    return [
      {
        id: "in",
        label: "Relay rate",
        value: inR,
        unit: "Hz",
        status: inR > 10 && inR < 80 ? "pass" : this.t < 0.15 ? "info" : "warn",
        note: "40 Hz drive on the thalamic cell (Izhikevich).",
      },
      {
        id: "fid",
        label: "Pathway fidelity",
        value: fidelity,
        unit: "",
        status: fidelity > 0.45 ? "pass" : this.t < 0.2 ? "info" : "fail",
        limit: 0.45,
        note: "Readout spikes / relay spikes after axonal delay.",
      },
      {
        id: "blk",
        label: "Peak rate",
        value: maxRate,
        unit: "Hz",
        status: maxRate < 220 ? "pass" : "fail",
        note: "Depolarization block if a cell runs away past 220 Hz.",
      },
      {
        id: "e",
        label: "Energy (ATP-scale)",
        value: energy,
        unit: "J",
        status: "info",
        note: "~3.6×10⁻¹⁰ J/spike, cortical estimate.",
      },
    ];
  }

  _flowProof(): ProofMetric[] {
    const expected = EXPECTED[this.intent] || [];
    const kinds = this.bp.nodes.map(regionKind);
    const missing = expected.filter((k) => !kinds.includes(k));
    const placed = expected.filter((k) => kinds.includes(k));
    const firing = placed.filter((k) => {
      const n = this.bp.nodes.find((x) => regionKind(x) === k);
      return n ? (this.homology.get(n.id) ?? 0) > 0.35 : false;
    });
    const over = this.bp.nodes.filter((n) => {
      const k = regionKind(n);
      if (n.kind === "stimulus" || !REGION_SPEC[k]) return false;
      if (expected.includes(k)) return false;
      return (this.homology.get(n.id) ?? 0) > 0.4;
    });
    const neededPairs = this.bp.edges.length;
    const livePairs = this.bp.edges.filter((e) => (this.homology.get(e.from) ?? 0) > 0.25 && (this.homology.get(e.to) ?? 0) > 0.25).length;
    const coverage = expected.length ? firing.length / expected.length : 0;
    const complete = expected.length ? (expected.length - missing.length) / expected.length : 0;
    return [
      {
        id: "intent",
        label: "Intent coverage",
        value: coverage,
        unit: "",
        status: coverage >= 0.75 ? "pass" : coverage >= 0.4 ? "warn" : "fail",
        limit: 0.75,
        note: `${this.intent}: ${firing.join(", ") || "none"} firing of ${expected.join(", ")}.`,
      },
      {
        id: "parts",
        label: "Parts on bench",
        value: complete,
        unit: "",
        status: missing.length === 0 ? "pass" : "warn",
        note: missing.length ? `Missing for this intent: ${missing.join(", ")}.` : "Every region this intent needs is on the bench.",
      },
      {
        id: "over",
        label: "Over-recruitment",
        value: over.length,
        unit: "",
        status: over.length === 0 ? "pass" : "warn",
        note: over.length
          ? `Lit without being needed: ${over.map((n) => regionKind(n)).join(", ")}.`
          : "Only intent-needed regions are hot — good sparse recruitment.",
      },
      {
        id: "flow",
        label: "Tract flow",
        value: neededPairs ? livePairs / neededPairs : 0,
        unit: "",
        status: neededPairs === 0 ? "warn" : livePairs / neededPairs > 0.5 ? "pass" : "fail",
        note: neededPairs === 0
          ? "No synapses yet — Shift-click two regions to net a tract before you prototype."
          : `${livePairs}/${neededPairs} tracts carrying this intent.`,
      },
    ];
  }
}
