import { uid } from "../lib/utils.ts";
import type { Blueprint, Domain, LabEdge, LabNode } from "./types.ts";

function N(
  id: string,
  kind: string,
  label: string,
  x: number,
  y: number,
  params: Record<string, number> = {},
  z = 0,
): LabNode {
  return { id, kind, label, x, y, z, params };
}

function E(
  id: string,
  from: string,
  to: string,
  params: Record<string, number> = {},
  kind = "trace",
): LabEdge {
  return { id, from, to, kind, params };
}

export const SAMPLES: Blueprint[] = [
  {
    id: "si-ring-7nm",
    name: "7 nm ring oscillator",
    domain: "silicon",
    description:
      "Three-stage CMOS inverter ring on a 7 nm-class BEOL. Solves Kirchhoff current on the RC graph, inverter transfer, Joule heating, and Black’s electromigration MTTF — the same checks a tape-out would fail first.",
    scale: 2e-7,
    notes:
      "FO1 ring. Copper M1, 14 nm drawn width. Spec: oscillate, Tj < 105 °C, EM MTTF > 10 yr.",
    nodes: [
      N("vdd", "pad", "VDD", 50, 8, { v: 0.75, fixed: 1, C: 2e-14 }),
      N("gnd", "pad", "VSS", 50, 92, { v: 0, fixed: 1, C: 2e-14 }),
      N("a", "inverter", "INV A", 24, 38, { gain: 14, rout: 180, C: 2e-14, Cth: 3e-12, w_nm: 28 }),
      N("b", "inverter", "INV B", 76, 38, { gain: 14, rout: 180, C: 2e-14, Cth: 3e-12, w_nm: 28 }),
      N("c", "inverter", "INV C", 50, 68, { gain: 14, rout: 180, C: 2e-14, Cth: 3e-12, w_nm: 28 }),
      N("out", "pad", "PROBE", 90, 16, { v: 0, fixed: 0, C: 8e-16 }),
    ],
    edges: [
      E("e1", "c", "a", { R: 48, C: 1.2e-16, L_nm: 420, w_nm: 14, layer: 1 }),
      E("e2", "a", "b", { R: 52, C: 1.3e-16, L_nm: 460, w_nm: 14, layer: 1 }),
      E("e3", "b", "c", { R: 58, C: 1.4e-16, L_nm: 510, w_nm: 14, layer: 1 }),
      E("e4", "b", "out", { R: 70, C: 1.6e-16, L_nm: 380, w_nm: 14, layer: 2 }),
      E("e5", "vdd", "a", { R: 12, C: 4e-17, L_nm: 200, w_nm: 40, layer: 2 }, "rail"),
      E("e6", "vdd", "b", { R: 12, C: 4e-17, L_nm: 200, w_nm: 40, layer: 2 }, "rail"),
      E("e7", "vdd", "c", { R: 16, C: 5e-17, L_nm: 260, w_nm: 40, layer: 2 }, "rail"),
      E("e8", "a", "gnd", { R: 14, C: 4e-17, L_nm: 220, w_nm: 40, layer: 1 }, "rail"),
      E("e9", "b", "gnd", { R: 14, C: 4e-17, L_nm: 220, w_nm: 40, layer: 1 }, "rail"),
      E("e10", "c", "gnd", { R: 18, C: 5e-17, L_nm: 280, w_nm: 40, layer: 1 }, "rail"),
    ],
  },
  {
    id: "si-ir-drop",
    name: "Power-grid IR drop",
    domain: "silicon",
    description:
      "Modified nodal analysis of a C4-bumped VDD mesh with interior current sinks. Reports IR drop, current crowding, and Black’s-equation lifetime on the hottest via.",
    scale: 5e-6,
    notes: "Spec: IR drop < 5 % of 0.75 V. J < 1 MA/cm².",
    nodes: [
      N("p00", "pad", "C4 A", 12, 12, { v: 0.75, fixed: 1, C: 1e-13 }),
      N("p02", "pad", "C4 B", 88, 12, { v: 0.75, fixed: 1, C: 1e-13 }),
      N("p20", "pad", "C4 C", 12, 88, { v: 0.75, fixed: 1, C: 1e-13 }),
      N("p22", "pad", "C4 D", 88, 88, { v: 0.75, fixed: 1, C: 1e-13 }),
      N("n01", "tap", "N01", 50, 12, { C: 8e-15, Iload: 0.004 }),
      N("n10", "tap", "N10", 12, 50, { C: 8e-15, Iload: 0.006 }),
      N("n11", "tap", "CORE", 50, 50, { C: 2e-14, Iload: 0.028 }),
      N("n12", "tap", "N12", 88, 50, { C: 8e-15, Iload: 0.006 }),
      N("n21", "tap", "N21", 50, 88, { C: 8e-15, Iload: 0.004 }),
      N("gnd", "pad", "VSS", 50, 96, { v: 0, fixed: 1, C: 1e-13 }),
    ],
    edges: [
      E("r1", "p00", "n01", { R: 0.18, L_nm: 80000, w_nm: 2000 }),
      E("r2", "n01", "p02", { R: 0.18, L_nm: 80000, w_nm: 2000 }),
      E("r3", "p00", "n10", { R: 0.18, L_nm: 80000, w_nm: 2000 }),
      E("r4", "p02", "n12", { R: 0.18, L_nm: 80000, w_nm: 2000 }),
      E("r5", "n10", "p20", { R: 0.18, L_nm: 80000, w_nm: 2000 }),
      E("r6", "n12", "p22", { R: 0.18, L_nm: 80000, w_nm: 2000 }),
      E("r7", "p20", "n21", { R: 0.18, L_nm: 80000, w_nm: 2000 }),
      E("r8", "n21", "p22", { R: 0.18, L_nm: 80000, w_nm: 2000 }),
      E("r9", "n01", "n11", { R: 0.22, L_nm: 80000, w_nm: 1600 }),
      E("r10", "n10", "n11", { R: 0.22, L_nm: 80000, w_nm: 1600 }),
      E("r11", "n12", "n11", { R: 0.22, L_nm: 80000, w_nm: 1600 }),
      E("r12", "n21", "n11", { R: 0.22, L_nm: 80000, w_nm: 1600 }),
      E("rg", "n11", "gnd", { R: 80, L_nm: 4000, w_nm: 200 }, "load"),
    ],
  },
  {
    id: "cell-excitable",
    name: "Excitable eukaryotic cell",
    domain: "cellular",
    description:
      "Cable-theory compartments plus FitzHugh–Nagumo excitability and a Gray–Scott morphogen on the membrane. Tests whether a proposed organelle layout can hold a stable action potential and a Turing pattern without lysis.",
    scale: 1e-6,
    notes: "Spec: spike without [Ca] overload. Morphogen contrast > 0.2.",
    nodes: [
      N("mem", "membrane", "Membrane", 50, 50, { radius: 38, leak: 0.3 }, 0),
      N("nuc", "nucleus", "Nucleus", 48, 46, { volume: 1, D: 0.04 }, 0.4),
      N("m1", "mitochondrion", "Mito 1", 32, 38, { atp: 1, I: 0.12 }, 0.2),
      N("m2", "mitochondrion", "Mito 2", 68, 40, { atp: 1, I: 0.1 }, 0.2),
      N("m3", "mitochondrion", "Mito 3", 58, 64, { atp: 1, I: 0.08 }, 0.15),
      N("er", "organelle", "ER", 36, 60, { ca: 0.4, buffer: 0.6 }, 0.18),
      N("ch1", "channel", "Nav", 18, 32, { g: 1.2, E: 0.055 }, 0),
      N("ch2", "channel", "Kv", 82, 30, { g: 0.9, E: -0.077 }, 0),
      N("ch3", "channel", "CaL", 22, 72, { g: 0.4, E: 0.06 }, 0),
      N("ch4", "channel", "Kir", 78, 74, { g: 0.5, E: -0.09 }, 0),
    ],
    edges: [
      E("c1", "ch1", "nuc", { g: 0.4, delay: 0.002 }, "cytosol"),
      E("c2", "ch2", "nuc", { g: 0.4, delay: 0.002 }, "cytosol"),
      E("c3", "m1", "nuc", { g: 0.8, delay: 0.001 }, "cytosol"),
      E("c4", "m2", "nuc", { g: 0.8, delay: 0.001 }, "cytosol"),
      E("c5", "m3", "nuc", { g: 0.7, delay: 0.001 }, "cytosol"),
      E("c6", "er", "nuc", { g: 0.5, delay: 0.003 }, "cytosol"),
      E("c7", "ch3", "er", { g: 0.6, delay: 0.002 }, "cytosol"),
      E("c8", "ch4", "m3", { g: 0.3, delay: 0.002 }, "cytosol"),
    ],
  },
  {
    id: "q-tunnel",
    name: "Wavepacket tunnel barrier",
    domain: "quantum",
    description:
      "Time-dependent Schrödinger equation on a 1D grid (ħ, m* of GaAs). A Gaussian packet hits a finite barrier whose height and width come from the schematic — transmission is compared to the WKB estimate.",
    scale: 1e-9,
    notes: "GaAs m* = 0.067 me. Spec: T > 0.05 if this is meant to couple two dots.",
    nodes: [
      N("src", "source", "Emitter", 12, 50, { E_eV: 0.12, k: 1.6 }, 0),
      N("dotL", "well", "Dot L", 32, 50, { V: 0, w_nm: 8 }, 0),
      N("bar", "barrier", "Barrier", 50, 50, { V_eV: 0.22, w_nm: 4, height: 0.22 }, 0),
      N("dotR", "well", "Dot R", 68, 50, { V: 0, w_nm: 8 }, 0),
      N("drn", "source", "Collector", 88, 50, { E_eV: 0.12, k: 1.6 }, 0),
      N("q0", "qubit", "Qubit", 50, 22, { omega: 5e9, T1: 4e-5, T2: 2e-5 }, 1),
    ],
    edges: [
      E("q1", "src", "dotL", { coupling: 0.04 }, "tunnel"),
      E("q2", "dotL", "bar", { coupling: 0.08 }, "tunnel"),
      E("q3", "bar", "dotR", { coupling: 0.08 }, "tunnel"),
      E("q4", "dotR", "drn", { coupling: 0.04 }, "tunnel"),
    ],
  },
  {
    id: "n-thalamo",
    name: "Thalamocortical microcircuit",
    domain: "neural",
    description:
      "Izhikevich neurons with axonal delay from physical length and a 4 m/s conduction velocity. Pyramidal–FS loop is tuned near gamma; the proof checks spike fidelity, conduction failure, and energy per spike.",
    scale: 5e-5,
    notes: "Spec: relay follows 40 Hz drive. No depolarization block.",
    nodes: [
      N("th", "soma", "Thalamic relay", 20, 50, { a: 0.02, b: 0.2, c: -65, d: 8, Ibias: 4 }, 0),
      N("in", "soma", "TRN interneuron", 38, 28, { a: 0.1, b: 0.2, c: -65, d: 2, Ibias: 0 }, 0.3),
      N("p1", "soma", "L4 pyramid", 58, 58, { a: 0.02, b: 0.2, c: -65, d: 6, Ibias: 3.2 }, 0.6),
      N("p2", "soma", "L2/3 pyramid", 78, 40, { a: 0.02, b: 0.2, c: -55, d: 4, Ibias: 2.4 }, 1),
      N("fs", "soma", "FS basket", 62, 24, { a: 0.1, b: 0.2, c: -65, d: 2, Ibias: 0 }, 0.8),
      N("out", "soma", "Readout", 90, 62, { a: 0.02, b: 0.2, c: -65, d: 8, Ibias: 0 }, 1.2),
    ],
    edges: [
      E("s1", "th", "in", { w: 8, delay: 0.001, kind: 1 }, "synapse"),
      E("s2", "in", "th", { w: -6, delay: 0.001, kind: -1 }, "synapse"),
      E("s3", "th", "p1", { w: 10, delay: 0.004, kind: 1 }, "synapse"),
      E("s4", "p1", "fs", { w: 9, delay: 0.001, kind: 1 }, "synapse"),
      E("s5", "fs", "p1", { w: -12, delay: 0.0008, kind: -1 }, "synapse"),
      E("s6", "p1", "p2", { w: 7, delay: 0.002, kind: 1 }, "synapse"),
      E("s7", "fs", "p2", { w: -8, delay: 0.0015, kind: -1 }, "synapse"),
      E("s8", "p2", "out", { w: 11, delay: 0.002, kind: 1 }, "synapse"),
      E("s9", "p2", "fs", { w: 6, delay: 0.001, kind: 1 }, "synapse"),
    ],
  },
  {
    id: "n-listen-flow",
    name: "Listen-intent homology flow",
    domain: "neural",
    description:
      "Bench the regions a listen intent should recruit (A1, STS, Wernicke, Insula) plus Broca/M1 which should stay quiet. Proof checks coverage, over-recruitment, and tract flow — same idea as tape-out: confirm the path works before you build.",
    scale: 5e-5,
    notes:
      "Stimulus intent=1 (listen), sensory=1. Spec: listen regions fire, speech-motor stays dark, tracts carry the combo.",
    nodes: [
      N("stim", "stimulus", "Intent", 10, 50, { intent: 1, sensory: 1, social: 0.2, biological: 0.15, logical: 0, emotional: 0, security: 0, planning: 0 }),
      N("th", "Thalamus", "Thalamus", 28, 50, { a: 0.02, b: 0.2, c: -65, d: 8, Ibias: 1 }),
      N("a1", "A1", "A1 auditory", 46, 28, { a: 0.02, b: 0.2, c: -65, d: 8, Ibias: 1 }),
      N("sts", "STS", "STS", 46, 72, { a: 0.02, b: 0.2, c: -65, d: 8, Ibias: 1 }),
      N("w", "Wernicke", "Wernicke", 64, 40, { a: 0.02, b: 0.2, c: -65, d: 8, Ibias: 1 }),
      N("ins", "Insula", "Insula", 64, 68, { a: 0.02, b: 0.2, c: -65, d: 8, Ibias: 1 }),
      N("bro", "Broca", "Broca", 86, 28, { a: 0.02, b: 0.2, c: -65, d: 8, Ibias: 0 }),
      N("m1", "M1", "M1 motor", 86, 72, { a: 0.02, b: 0.2, c: -65, d: 8, Ibias: 0 }),
    ],
    edges: [
      E("e1", "stim", "th", { w: 8, delay: 0.001 }, "synapse"),
      E("e2", "th", "a1", { w: 9, delay: 0.002 }, "synapse"),
      E("e3", "a1", "sts", { w: 6, delay: 0.002 }, "synapse"),
      E("e4", "a1", "w", { w: 10, delay: 0.002 }, "synapse"),
      E("e5", "sts", "w", { w: 7, delay: 0.002 }, "synapse"),
      E("e6", "w", "ins", { w: 6, delay: 0.002 }, "synapse"),
      E("e7", "w", "bro", { w: 3, delay: 0.003 }, "synapse"),
      E("e8", "bro", "m1", { w: 4, delay: 0.002 }, "synapse"),
    ],
  },
  {
    id: "mech-mems",
    name: "MEMS accelerometer beam",
    domain: "mechanical",
    description:
      "Lumped Euler–Bernoulli cantilever with a proof mass. Solves M ü + C u̇ + K u = F, reports first-mode frequency against the analytic (1.875)² √(EI/μL⁴) and von Mises stress against silicon yield.",
    scale: 2e-6,
    notes: "Poly-Si, 2 µm thick, 20 µm wide. Spec: 1 g range, SF > 4, f0 1–8 kHz.",
    nodes: [
      N("a0", "anchor", "Anchor", 10, 50, { fixed: 1, m: 0 }, 0),
      N("b1", "joint", "J1", 24, 50, { m: 2.3e-13 }, 0),
      N("b2", "joint", "J2", 38, 50, { m: 2.3e-13 }, 0),
      N("b3", "joint", "J3", 52, 50, { m: 2.3e-13 }, 0),
      N("b4", "joint", "J4", 66, 50, { m: 2.3e-13 }, 0),
      N("tip", "mass", "Proof mass", 84, 50, { m: 3.2e-12, F: 3.2e-12 * 9.81 }, 0),
    ],
    edges: [
      E("bm1", "a0", "b1", { L: 2.8e-5, w: 2e-5, t: 2e-6, E: 1.6e11 }, "beam"),
      E("bm2", "b1", "b2", { L: 2.8e-5, w: 2e-5, t: 2e-6, E: 1.6e11 }, "beam"),
      E("bm3", "b2", "b3", { L: 2.8e-5, w: 2e-5, t: 2e-6, E: 1.6e11 }, "beam"),
      E("bm4", "b3", "b4", { L: 2e-5, w: 2e-5, t: 2e-6, E: 1.6e11 }, "beam"),
      E("bm5", "b4", "tip", { L: 2e-5, w: 4e-5, t: 4e-6, E: 1.6e11 }, "beam"),
    ],
  },
  {
    id: "chem-ester",
    name: "Acid-catalysed esterification",
    domain: "chemistry",
    description:
      "Batch AcOH + EtOH ⇌ EtOAc + H2O. Mass-action kinetics with Arrhenius k(T) and ΔH heating the reactor — the same checks a process chemist runs before scaling.",
    scale: 1,
    notes: "Spec: conversion > 8 % in the bench window without boiling the pot (T < 120 °C).",
    nodes: [
      N("pot", "reactor", "Batch 1 L", 50, 10, { T: 348, V: 1 }),
      N("acoh", "species", "AcOH", 18, 42, { c: 2.0 }),
      N("etoh", "species", "EtOH", 18, 72, { c: 3.0 }),
      N("rx", "reaction", "esterify", 50, 58, { kf: 0.08, kr: 0.03, Ea: 52000, dH: -15000 }),
      N("etoac", "species", "EtOAc", 82, 42, { c: 0.05 }),
      N("h2o", "species", "H2O", 82, 72, { c: 0.2 }),
    ],
    edges: [
      E("r1", "acoh", "rx", { nu: 1 }, "reactant"),
      E("r2", "etoh", "rx", { nu: 1 }, "reactant"),
      E("p1", "rx", "etoac", { nu: 1 }, "product"),
      E("p2", "rx", "h2o", { nu: 1 }, "product"),
    ],
  },
  {
    id: "chem-haber",
    name: "Haber–Bosch slice",
    domain: "chemistry",
    description:
      "N2 + 3 H2 ⇌ 2 NH3 at elevated T. Tests equilibrium vs. temperature — hotter is faster but equilibrium yield drops.",
    scale: 1,
    notes: "Spec: ammonia appears; reactor stays below 650 K.",
    nodes: [
      N("pot", "reactor", "Converter", 50, 10, { T: 720, V: 2 }),
      N("n2", "species", "N2", 18, 40, { c: 1.0 }),
      N("h2", "species", "H2", 18, 70, { c: 3.0 }),
      N("rx", "reaction", "Haber", 50, 55, { kf: 0.04, kr: 0.09, Ea: 80000, dH: -92000 }),
      N("nh3", "species", "NH3", 82, 55, { c: 0.02 }),
    ],
    edges: [
      E("r1", "n2", "rx", { nu: 1 }, "reactant"),
      E("r2", "h2", "rx", { nu: 3 }, "reactant"),
      E("p1", "rx", "nh3", { nu: 2 }, "product"),
    ],
  },
  {
    id: "chem-combust",
    name: "Methane combustion",
    domain: "chemistry",
    description:
      "CH4 + 2 O2 → CO2 + 2 H2O, strongly exothermic. Heat of reaction drives reactor T — a runaway check.",
    scale: 1,
    notes: "Spec: fuel converts; T stays under 650 °C on this short bench.",
    nodes: [
      N("pot", "reactor", "Burner", 50, 10, { T: 900, V: 0.5 }),
      N("ch4", "species", "CH4", 18, 40, { c: 0.5 }),
      N("o2", "species", "O2", 18, 70, { c: 1.2 }),
      N("rx", "reaction", "burn", 50, 55, { kf: 0.35, kr: 0, Ea: 40000, dH: -890000 }),
      N("co2", "species", "CO2", 82, 40, { c: 0 }),
      N("h2o", "species", "H2O", 82, 70, { c: 0 }),
    ],
    edges: [
      E("r1", "ch4", "rx", { nu: 1 }, "reactant"),
      E("r2", "o2", "rx", { nu: 2 }, "reactant"),
      E("p1", "rx", "co2", { nu: 1 }, "product"),
      E("p2", "rx", "h2o", { nu: 2 }, "product"),
    ],
  },
  {
    id: "arch-loft",
    name: "Warehouse loft",
    domain: "architecture",
    description:
      "Open studio + sleeping alcove + wet room. Circulation, daylight, furniture fill, and pack absorption — the same checks before you commit a layout.",
    scale: 0.45,
    notes: "Spec: peak density < 0.22 /m², egress ≤ 3 doors, furniture fill < 32 %.",
    skin: { pack: "cozy" },
    nodes: [
      N("foyer", "foyer", "Entry", 50, 88, { area: 12, people: 1, windows: 1, lights: 1, exit: 1, desks: 0, chairs: 1, plants: 1 }),
      N("live", "studio", "Live / work", 38, 48, { area: 42, people: 3, windows: 3, lights: 4, desks: 1, chairs: 3, plants: 2 }),
      N("sleep", "room", "Sleep", 78, 42, { area: 16, people: 1, windows: 1, lights: 1, desks: 0, chairs: 1, plants: 1 }),
      N("wet", "room", "Wet room", 78, 72, { area: 8, people: 0, windows: 0, lights: 1, desks: 0, chairs: 0, plants: 0 }),
    ],
    edges: [
      E("d1", "foyer", "live", { width: 1.2 }, "door"),
      E("d2", "live", "sleep", { width: 0.9 }, "door"),
      E("d3", "live", "wet", { width: 0.8 }, "door"),
    ],
  },
  {
    id: "arch-office",
    name: "Four-room office",
    domain: "architecture",
    description:
      "Lobby, open floor, two meeting rooms. Occupancy diffuses through doors; daylight and heat are first-class proofs. Swap the texture pack without changing the plan.",
    scale: 0.5,
    notes: "Spec: no dead-end conference room, peak T < 26 °C, daylight pass.",
    skin: { pack: "office" },
    nodes: [
      N("lobby", "foyer", "Lobby", 50, 88, { area: 28, people: 4, windows: 2, lights: 4, exit: 1, desks: 0, chairs: 4, plants: 2 }),
      N("open", "room", "Open floor", 50, 50, { area: 64, people: 10, windows: 4, lights: 8, desks: 6, chairs: 8, plants: 3 }),
      N("meetA", "room", "Meet A", 18, 22, { area: 18, people: 6, windows: 2, lights: 2, desks: 1, chairs: 6, plants: 1 }),
      N("meetB", "room", "Meet B", 82, 22, { area: 18, people: 4, windows: 1, lights: 2, desks: 1, chairs: 4, plants: 0 }),
    ],
    edges: [
      E("d1", "lobby", "open", { width: 1.8 }, "door"),
      E("d2", "open", "meetA", { width: 1.0 }, "door"),
      E("d3", "open", "meetB", { width: 1.0 }, "door"),
    ],
  },
  {
    id: "arch-gallery",
    name: "Linear gallery",
    domain: "architecture",
    description:
      "Procession of halls. Tests dead-ends and egress hops — a mapped floor plate should still get you out.",
    scale: 0.55,
    notes: "Spec: egress hops ≤ 3, no more than one dead-end.",
    skin: { pack: "sacred" },
    nodes: [
      N("in", "foyer", "Narthex", 50, 88, { area: 20, people: 6, windows: 2, lights: 2, exit: 1, chairs: 0, plants: 2 }),
      N("a", "gallery", "Hall A", 50, 58, { area: 36, people: 8, windows: 2, lights: 4, chairs: 0, plants: 1 }),
      N("b", "gallery", "Hall B", 50, 32, { area: 36, people: 8, windows: 3, lights: 4, chairs: 0, plants: 1 }),
      N("c", "gallery", "Apse", 50, 10, { area: 16, people: 4, windows: 1, lights: 2, chairs: 0, plants: 0 }),
    ],
    edges: [
      E("d1", "in", "a", { width: 2.2 }, "door"),
      E("d2", "a", "b", { width: 2.2 }, "door"),
      E("d3", "b", "c", { width: 1.6 }, "door"),
    ],
  },
  {
    id: "metal-4340",
    name: "4340-class steel melt",
    domain: "metallurgy",
    description:
      "Fe–C–Cr–Ni–Mo mix. IIW carbon equivalent, ROM density/k/E, yield proxy. Methods on each metric — not a CCT diagram.",
    scale: 1,
    notes: "Spec: CE < 0.40 for as-welded; soak toward liquidus.",
    nodes: [
      N("melt", "melt", "Melt", 50, 18, { T: 1200 }),
      N("fe", "Fe", "Fe", 18, 48, { wt: 96.2 }),
      N("c", "C", "C", 32, 78, { wt: 0.4 }),
      N("cr", "Cr", "Cr", 50, 78, { wt: 0.8 }),
      N("ni", "Ni", "Ni", 68, 78, { wt: 1.8 }),
      N("mo", "Mo", "Mo", 82, 48, { wt: 0.25 }),
    ],
    edges: [
      E("m1", "fe", "melt", {}, "mix"),
      E("m2", "c", "melt", {}, "mix"),
      E("m3", "cr", "melt", {}, "mix"),
      E("m4", "ni", "melt", {}, "mix"),
      E("m5", "mo", "melt", {}, "mix"),
    ],
  },
  {
    id: "metal-alsi10",
    name: "AlSi10Mg powder",
    domain: "metallurgy",
    description:
      "Al–Si–Mg LPBF alloy window. Si 6–13 wt% crack-resistance heuristic plus ROM thermal k.",
    scale: 1,
    notes: "Spec: Si in 6–13 wt%; confirm with coupon porosity, not this bench alone.",
    nodes: [
      N("melt", "melt", "Melt", 50, 20, { T: 850 }),
      N("al", "Al", "Al", 22, 62, { wt: 89.5 }),
      N("si", "Si", "Si", 50, 78, { wt: 10.0 }),
      N("mg", "Mg", "Mg", 78, 62, { wt: 0.4 }),
    ],
    edges: [
      E("m1", "al", "melt", {}, "mix"),
      E("m2", "si", "melt", {}, "mix"),
      E("m3", "mg", "melt", {}, "mix"),
    ],
  },
  {
    id: "robot-arm-3",
    name: "3-DOF planar arm",
    domain: "robotics",
    description:
      "Serial arm, planar FK, static gravity torques vs actuator rating, payload at the EE. No collision world.",
    scale: 0.01,
    notes: "Spec: actuator margin ≥ 1.5 with 0.5 kg payload.",
    nodes: [
      N("base", "base", "Base", 18, 78, { m: 2 }),
      N("j1", "joint", "J1", 32, 58, { m: 0.8, q: 0.4, qdes: 0.5, tau: 12, qmin: -2.4, qmax: 2.4 }),
      N("j2", "joint", "J2", 52, 40, { m: 0.5, q: 0.5, qdes: 0.7, tau: 6, qmin: -2.4, qmax: 2.4 }),
      N("ee", "ee", "Gripper", 78, 28, { m: 0.25, payload: 0.5, q: 0.2, qdes: 0.3, tau: 3 }),
    ],
    edges: [
      E("l1", "base", "j1", { L: 0.22, m: 0.4 }, "link"),
      E("l2", "j1", "j2", { L: 0.18, m: 0.3 }, "link"),
      E("l3", "j2", "ee", { L: 0.14, m: 0.15 }, "link"),
    ],
  },
  {
    id: "machine-crank",
    name: "Slider-crank 1-cyl",
    domain: "machines",
    description:
      "Kinematics x = r cosθ + √(L²−r²sin²θ), gas load P·A·max(cosθ,0), rod stress vs 350 MPa steel, mean piston speed.",
    scale: 0.01,
    notes: "Spec: mean piston speed < 18 m/s, rod SF ≥ 4.",
    nodes: [
      N("crank", "crank", "Crank", 28, 50, { r: 0.032, rpm: 2400, omega: 251 }),
      N("rod", "rod", "Rod", 50, 50, { L: 0.12, d: 0.012 }),
      N("piston", "piston", "Piston", 74, 50, { bore: 0.054, P: 1.4e6 }),
    ],
    edges: [
      E("e1", "crank", "rod", { L: 0.032 }, "shaft"),
      E("e2", "rod", "piston", { L: 0.12, d: 0.012 }, "rod"),
    ],
  },
  {
    id: "machine-gears",
    name: "Spur pair 20/40",
    domain: "machines",
    description: "Lewis bending on a 2 mm module 20/40 spur pair at 8 N·m. No AGMA K factors.",
    scale: 0.01,
    notes: "Spec: Lewis SF ≥ 2.5 vs 200 MPa.",
    nodes: [
      N("g1", "gear", "Pinion", 34, 50, { z: 20, m: 0.002, b: 0.014, T: 8 }),
      N("g2", "gear", "Gear", 66, 50, { z: 40, m: 0.002, b: 0.014, T: 16 }),
    ],
    edges: [E("mesh", "g1", "g2", { m: 0.002 }, "mesh")],
  },
  {
    id: "machine-bracket",
    name: "FDM L-bracket",
    domain: "machines",
    description:
      "Cantilevered printable part. σ = 6FL/bt², FDM min wall and overhang checks. STL in millimetres.",
    scale: 0.001,
    notes: "Spec: SF ≥ 3 vs 40 MPa, wall ≥ 0.8 mm, overhang ≤ 45°.",
    nodes: [
      N("fix", "anchor", "Mount", 22, 58, { fixed: 1 }),
      N("part", "part", "Bracket", 62, 42, { L: 0.06, b: 0.02, t: 0.004, F: 35, ys: 4.0e7, overhang: 30, E: 2.3e9 }),
    ],
    edges: [E("b1", "fix", "part", { L: 0.06 }, "beam")],
  },
  {
    id: "optics-sundial",
    name: "Garden sundial",
    domain: "optics",
    description:
      "Gnomon + ground + sun. Shadow length L = h / tan(altitude) from a NOAA-style solar position. Spin the sun hour to watch the shadow.",
    scale: 1,
    notes: "Spec: daylight shadow finite; night reports no shadow.",
    nodes: [
      N("ground", "ground", "Ground", 50, 82, { fixed: 1 }),
      N("gnomon", "gnomon", "Gnomon", 50, 48, { h: 1.2 }),
      N("sun", "sun", "Sun", 78, 18, { lat: 33.45, lon: -112.07, hour: 15, spin: 0 }),
    ],
    edges: [
      E("s1", "gnomon", "ground", { L: 1.2 }, "shadow"),
      E("ray", "sun", "gnomon", {}, "ray"),
    ],
  },
  {
    id: "sky-live",
    name: "Live sky",
    domain: "sky",
    description:
      "Computed sun altitude/azimuth for a lat/lon/hour. If Stellarium Remote Control is on :8090, the bench prefers that live pose.",
    scale: 1,
    notes: "Enable Stellarium Remote Control plugin for live overlay.",
    nodes: [N("sky", "sky", "Sky", 50, 50, { lat: 33.45, lon: -112.07, hour: 15 })],
    edges: [],
  },
];

export function blankBlueprint(domain: Domain): Blueprint {
  const id = uid("bp");
  if (domain === "silicon") {
    return {
      id,
      name: "Untitled die",
      domain,
      description: "Blank net. Add inverters, pads, and traces, or import a diagram.",
      scale: 2e-7,
      notes: "",
      nodes: [
        N("vdd", "pad", "VDD", 50, 10, { v: 0.8, fixed: 1, C: 1e-14 }),
        N("gnd", "pad", "VSS", 50, 90, { v: 0, fixed: 1, C: 1e-14 }),
        N("a", "inverter", "INV", 50, 50, { gain: 12, rout: 220, C: 5e-16 }),
      ],
      edges: [
        E("e1", "vdd", "a", { R: 20, w_nm: 28, L_nm: 200 }, "rail"),
        E("e2", "a", "gnd", { R: 20, w_nm: 28, L_nm: 200 }, "rail"),
      ],
    };
  }
  if (domain === "cellular") {
    return {
      id,
      name: "Untitled cell",
      domain,
      description: "Single compartment with a leak and one channel.",
      scale: 1e-6,
      notes: "",
      nodes: [
        N("mem", "membrane", "Membrane", 50, 50, { radius: 32, leak: 0.3 }),
        N("nuc", "nucleus", "Nucleus", 50, 50, { volume: 1 }, 0.3),
        N("ch1", "channel", "Nav", 20, 40, { g: 1, E: 0.05 }),
      ],
      edges: [E("c1", "ch1", "nuc", { g: 0.5 }, "cytosol")],
    };
  }
  if (domain === "quantum") {
    return {
      id,
      name: "Untitled well",
      domain,
      description: "Particle-in-a-box with a central barrier.",
      scale: 1e-9,
      notes: "",
      nodes: [
        N("src", "source", "Source", 16, 50, { E_eV: 0.1 }),
        N("bar", "barrier", "Barrier", 50, 50, { V_eV: 0.2, w_nm: 5 }),
        N("drn", "source", "Drain", 84, 50, { E_eV: 0.1 }),
      ],
      edges: [
        E("q1", "src", "bar", { coupling: 0.05 }, "tunnel"),
        E("q2", "bar", "drn", { coupling: 0.05 }, "tunnel"),
      ],
    };
  }
  if (domain === "neural") {
    return {
      id,
      name: "Untitled pathway",
      domain,
      description: "Two somas and one synapse.",
      scale: 5e-5,
      notes: "",
      nodes: [
        N("n1", "soma", "Pre", 28, 50, { a: 0.02, b: 0.2, c: -65, d: 8, Ibias: 5 }),
        N("n2", "soma", "Post", 72, 50, { a: 0.02, b: 0.2, c: -65, d: 8, Ibias: 0 }),
      ],
      edges: [E("s1", "n1", "n2", { w: 10, delay: 0.002 }, "synapse")],
    };
  }
  if (domain === "metallurgy") {
    return {
      id,
      name: "Untitled alloy",
      domain,
      description: "Add elements (wt%) into a melt.",
      scale: 1,
      notes: "",
      nodes: [
        N("melt", "melt", "Melt", 50, 22, { T: 1000 }),
        N("fe", "Fe", "Fe", 28, 68, { wt: 98 }),
        N("c", "C", "C", 72, 68, { wt: 0.2 }),
      ],
      edges: [
        E("m1", "fe", "melt", {}, "mix"),
        E("m2", "c", "melt", {}, "mix"),
      ],
    };
  }
  if (domain === "robotics") {
    return {
      id,
      name: "Untitled arm",
      domain,
      description: "Base, one joint, end effector.",
      scale: 0.01,
      notes: "",
      nodes: [
        N("base", "base", "Base", 24, 72, { m: 1 }),
        N("j1", "joint", "J1", 50, 48, { m: 0.5, q: 0.4, tau: 6 }),
        N("ee", "ee", "EE", 76, 28, { m: 0.2, payload: 0.2, tau: 2 }),
      ],
      edges: [
        E("l1", "base", "j1", { L: 0.2 }, "link"),
        E("l2", "j1", "ee", { L: 0.16 }, "link"),
      ],
    };
  }
  if (domain === "machines") {
    return {
      id,
      name: "Untitled part",
      domain,
      description: "Printable cantilever. Set L, b, t, F.",
      scale: 0.001,
      notes: "",
      nodes: [
        N("fix", "anchor", "Mount", 24, 50, { fixed: 1 }),
        N("part", "part", "Part", 70, 50, { L: 0.05, b: 0.016, t: 0.004, F: 20, ys: 4e7, overhang: 20 }),
      ],
      edges: [E("b1", "fix", "part", { L: 0.05 }, "beam")],
    };
  }
  if (domain === "architecture") {
    return {
      id,
      name: "Untitled plan",
      domain,
      description: "Foyer and one room. Draw more rooms, connect doors, assign a texture pack.",
      scale: 0.45,
      notes: "",
      skin: { pack: "office" },
      nodes: [
        N("foyer", "foyer", "Foyer", 50, 82, { area: 16, people: 1, windows: 1, lights: 1, exit: 1, plants: 1 }),
        N("room", "room", "Room", 50, 42, { area: 28, people: 3, windows: 2, lights: 2, desks: 1, chairs: 2, plants: 1 }),
      ],
      edges: [E("d1", "foyer", "room", { width: 1.1 }, "door")],
    };
  }
  if (domain === "optics") {
    return {
      id,
      name: "Untitled sundial",
      domain,
      description: "Gnomon on ground. Set sun lat/lon/hour.",
      scale: 1,
      notes: "",
      nodes: [
        N("ground", "ground", "Ground", 50, 82, { fixed: 1 }),
        N("gnomon", "gnomon", "Gnomon", 50, 48, { h: 1 }),
        N("sun", "sun", "Sun", 78, 18, { lat: 33.45, lon: -112.07, hour: 12 }),
      ],
      edges: [E("s1", "gnomon", "ground", { L: 1 }, "shadow")],
    };
  }
  if (domain === "sky") {
    return {
      id,
      name: "Untitled sky",
      domain,
      description: "Live sun. Optional Stellarium on :8090.",
      scale: 1,
      notes: "",
      nodes: [N("sky", "sky", "Sky", 50, 50, { lat: 33.45, lon: -112.07, hour: 12 })],
      edges: [],
    };
  }
  if (domain === "chemistry") {
    return {
      id,
      name: "Untitled reaction",
      domain,
      description: "Two species and one reversible step. Add a reactor node for temperature.",
      scale: 1,
      notes: "",
      nodes: [
        N("pot", "reactor", "Batch", 50, 12, { T: 348, V: 1 }),
        N("a", "species", "A", 22, 55, { c: 1 }),
        N("rx", "reaction", "A→B", 50, 55, { kf: 0.05, kr: 0.01, Ea: 40000, dH: -20000 }),
        N("b", "species", "B", 78, 55, { c: 0.02 }),
      ],
      edges: [
        E("r1", "a", "rx", { nu: 1 }, "reactant"),
        E("p1", "rx", "b", { nu: 1 }, "product"),
      ],
    };
  }
  return {
    id,
    name: "Untitled mechanism",
    domain: "mechanical",
    description: "Anchor, beam, tip mass.",
    scale: 2e-6,
    notes: "",
    nodes: [
      N("a0", "anchor", "Anchor", 18, 50, { fixed: 1, m: 0 }),
      N("tip", "mass", "Tip", 82, 50, { m: 1e-12, F: 1e-11 }),
    ],
    edges: [E("bm1", "a0", "tip", { L: 1e-4, w: 2e-5, t: 2e-6, E: 1.6e11 }, "beam")],
  };
}

export function cloneBlueprint(bp: Blueprint, name?: string): Blueprint {
  return {
    ...bp,
    id: uid("bp"),
    name: name ?? bp.name,
    nodes: bp.nodes.map((n) => ({ ...n, params: { ...n.params } })),
    edges: bp.edges.map((e) => ({ ...e, params: { ...e.params } })),
    skin: bp.skin ? { pack: bp.skin.pack, assets: bp.skin.assets ? bp.skin.assets.map((a) => ({ ...a })) : undefined } : undefined,
  };
}

export const PALETTE: Record<Domain, { kind: string; label: string }[]> = {
  silicon: [
    { kind: "inverter", label: "Inverter" },
    { kind: "pad", label: "Pad" },
    { kind: "tap", label: "Tap" },
    { kind: "resistor", label: "Resistor" },
    { kind: "capacitor", label: "Capacitor" },
    { kind: "via", label: "Via" },
  ],
  cellular: [
    { kind: "nucleus", label: "Nucleus" },
    { kind: "mitochondrion", label: "Mitochondrion" },
    { kind: "channel", label: "Ion channel" },
    { kind: "organelle", label: "Organelle" },
  ],
  quantum: [
    { kind: "well", label: "Well" },
    { kind: "barrier", label: "Barrier" },
    { kind: "source", label: "Lead" },
    { kind: "qubit", label: "Qubit" },
  ],
  neural: [
    { kind: "soma", label: "Soma" },
    { kind: "stimulus", label: "Intent / stimulus" },
    { kind: "A1", label: "A1 auditory" },
    { kind: "STS", label: "STS" },
    { kind: "Wernicke", label: "Wernicke" },
    { kind: "Broca", label: "Broca" },
    { kind: "M1", label: "M1 motor" },
    { kind: "V1", label: "V1 visual" },
    { kind: "dlPFC", label: "dlPFC" },
    { kind: "ACC", label: "ACC" },
    { kind: "Insula", label: "Insula" },
    { kind: "Amygdala", label: "Amygdala" },
    { kind: "Hippocampus", label: "Hippocampus" },
    { kind: "Thalamus", label: "Thalamus" },
    { kind: "AG", label: "Angular" },
    { kind: "SMA", label: "SMA" },
  ],
  mechanical: [
    { kind: "anchor", label: "Anchor" },
    { kind: "joint", label: "Joint" },
    { kind: "mass", label: "Mass" },
  ],
  chemistry: [
    { kind: "species", label: "Species" },
    { kind: "reaction", label: "Reaction" },
    { kind: "reactor", label: "Reactor" },
    { kind: "acid", label: "Acid" },
    { kind: "ester", label: "Ester" },
    { kind: "water", label: "Water" },
  ],
  architecture: [
    { kind: "room", label: "Room" },
    { kind: "foyer", label: "Foyer / exit" },
    { kind: "studio", label: "Studio" },
    { kind: "gallery", label: "Gallery" },
  ],
  metallurgy: [
    { kind: "melt", label: "Melt" },
    { kind: "Fe", label: "Fe" },
    { kind: "C", label: "C" },
    { kind: "Cr", label: "Cr" },
    { kind: "Ni", label: "Ni" },
    { kind: "Al", label: "Al" },
    { kind: "Si", label: "Si" },
    { kind: "Cu", label: "Cu" },
    { kind: "Ti", label: "Ti" },
  ],
  robotics: [
    { kind: "base", label: "Base" },
    { kind: "joint", label: "Joint" },
    { kind: "ee", label: "End effector" },
  ],
  machines: [
    { kind: "crank", label: "Crank" },
    { kind: "piston", label: "Piston" },
    { kind: "rod", label: "Rod" },
    { kind: "gear", label: "Gear" },
    { kind: "part", label: "Printable part" },
  ],
  optics: [
    { kind: "gnomon", label: "Gnomon" },
    { kind: "ground", label: "Ground" },
    { kind: "sun", label: "Sun" },
  ],
  sky: [{ kind: "sky", label: "Sky" }],
};
