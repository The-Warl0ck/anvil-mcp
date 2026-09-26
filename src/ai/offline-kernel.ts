import { blankBlueprint, cloneBlueprint, SAMPLES } from "../sim/blueprints.ts";
import type { Blueprint, Domain, LabEdge, LabNode } from "../sim/types.ts";
import { uid } from "../lib/utils.ts";
import { defaultKind } from "./schema.ts";
import { extractSealName, inferSigilId, isPathish, mapPathToBlueprint } from "../sim/map-path.ts";
import { inferPack } from "../sim/textures.ts";

const DOMAIN_KW: Record<Domain, string[]> = {
  silicon: ["ring", "cmos", "inverter", "oscillator", "ir drop", "chip", "die", "tape", "vdd", "electromigration", "power grid", "silicon", "nm ", "nm", "7 nm", "7nm", "5 nm", "5nm", "trace", "rail", "circuit", "heat", "cooler", "sigil", "pentagram", "spiral", "layout"],
  cellular: ["cell", "membrane", "ion", "calcium", "organelle", "mito", "lysis", "morphogen", "eukaryot", "channel", "nucleus"],
  quantum: ["qubit", "tunnel", "well", "barrier", "schrodinger", "decoherence", "wavepacket", "ev", "quantum", "dot", "wkb"],
  neural: ["neuron", "spike", "synapse", "thalamo", "cortex", "gamma", "izhikevich", "axon", "pyramid", "basket", "pathway"],
  mechanical: ["beam", "mems", "cantilever", "stress", "yield", "accelerometer", "proof mass", "mechanical", "young", "anchor"],
  chemistry: ["chem", "reaction", "kinetics", "ester", "haber", "ammonia", "combust", "methane", "mole", "equilibrium", "arrhenius", "enthalpy", "reactor", "stoich", "acid", "catalyst"],
  architecture: ["architect", "interior", "floor plan", "floorplan", "room", "lobby", "foyer", "gallery", "loft", "apartment", "cabin", "furniture", "daylight", "egress", "boardroom", "meeting room", "texture pack", "wallpaper"],
  metallurgy: ["alloy", "steel", "metallurgy", "carbon equivalent", "weld", "melt", "heat treat", "powder", "bronze", "titanium", "aluminium alloy", "al-si", "4340", "stainless"],
  robotics: ["robot", "arm", "servo", "dof", "gripper", "payload", "kinematics", "end effector", "manipulator"],
  machines: ["engine", "crank", "piston", "gear", "gearbox", "shaft", "bearing", "3d print", "stl", "bracket", "cam", "slider-crank", "fdm"],
  optics: ["sundial", "sun dial", "gnomon", "shadow", "geometry", "similar triangle", "optics", "obelisk", "cast shadow"],
  sky: ["stellarium", "ephemeris", "sun position", "azimuth", "altitude", "sky", "solstice", "equinox", "celestial"],
};

export interface IntentRead {
  domain: Domain;
  mutate: boolean;
  stages?: number;
  nm?: number;
  eV?: number;
  hz?: number;
  force?: number;
  voltage?: number;
  count?: number;
  scores: Record<Domain, number>;
}

export function readIntent(text: string, fallback: Domain, explicit?: Domain): IntentRead {
  const lower = text.toLowerCase();
  const scores = {} as Record<Domain, number>;
  (Object.keys(DOMAIN_KW) as Domain[]).forEach((d) => {
    scores[d] = DOMAIN_KW[d].reduce((s, k) => s + (lower.includes(k) ? 12 : 0), 0);
  });
  const ranked = (Object.entries(scores) as [Domain, number][]).sort((a, b) => b[1] - a[1]);
  // An explicitly named domain is an instruction, not a hint: honor it over
  // keyword scoring (which can misfire on substrings, e.g. "ev" in "cantilever").
  const domain = explicit ?? (ranked[0][1] >= 12 ? ranked[0][0] : fallback);

  const num = (re: RegExp) => {
    const m = lower.match(re);
    return m ? Number(m[1]) : undefined;
  };

  const mutate = /\b(this|current|raise|lower|increase|decrease|tweak|nudge|add a|remove|thicker|thinner|hotter|faster|slower)\b/.test(lower);

  return {
    domain,
    mutate,
    stages: num(/(\d+)\s*-?\s*stage/),
    nm: num(/(\d+(?:\.\d+)?)\s*nm/),
    eV: num(/(\d+(?:\.\d+)?)\s*eV/),
    hz: num(/(\d+(?:\.\d+)?)\s*hz/),
    voltage: num(/(\d+(?:\.\d+)?)\s*v(?:dd|olt)?/),
    count: num(/(\d+)\s*(?:neuron|soma|joint|inverter|channel|well)/),
    scores,
  };
}

export function forgeOffline(prompt: string, current: Blueprint, explicit?: Domain): { blueprint: Blueprint; rationale: string } {
  const read = readIntent(prompt, current.domain, explicit);
  if (read.mutate && read.domain === current.domain) {
    return mutateBench(current, prompt, read);
  }
  switch (read.domain) {
    case "silicon":
      return ringOrGrid(read, prompt);
    case "quantum":
      return tunnel(read, prompt);
    case "neural":
      return circuit(read, prompt);
    case "cellular":
      return cell(read, prompt);
    case "chemistry":
      return chemistry(read, prompt);
    case "architecture":
      return architecture(read, prompt);
    case "metallurgy":
      return metallurgy(read, prompt);
    case "robotics":
      return robotics(read, prompt);
    case "machines":
      return machines(read, prompt);
    case "optics":
      return sundial(read, prompt);
    case "sky":
      return skyBench(read, prompt);
    default:
      return cantilever(read, prompt);
  }
}

function metallurgy(_read: IntentRead, prompt: string) {
  const p = prompt.toLowerCase();
  const id = /al|silicon|si10|powder/.test(p) && !/steel|fe|4340/.test(p) ? "metal-alsi10" : "metal-4340";
  const src = SAMPLES.find((s) => s.id === id) ?? SAMPLES.find((s) => s.domain === "metallurgy")!;
  const bp = cloneBlueprint(src, src.name);
  bp.description = `Alloy forged from: ${prompt.slice(0, 140)}`;
  return { blueprint: bp, rationale: "Offline kernel: ROM mix + IIW CE / Al–Si print window." };
}

function robotics(_read: IntentRead, prompt: string) {
  const src = SAMPLES.find((s) => s.id === "robot-arm-3")!;
  const bp = cloneBlueprint(src, "Planar arm");
  bp.description = `Arm forged from: ${prompt.slice(0, 140)}`;
  return { blueprint: bp, rationale: "Offline kernel: 3-DOF planar FK + gravity torques." };
}

function sundial(_read: IntentRead, prompt: string) {
  const src = SAMPLES.find((s) => s.id === "optics-sundial")!;
  const bp = cloneBlueprint(src, "Sundial");
  bp.description = `Geometry/shadow forged from: ${prompt.slice(0, 140)}`;
  const h = _read.force ? Math.max(0.3, _read.force) : bp.nodes.find((n) => n.kind === "gnomon")?.params.h;
  if (h && bp.nodes.find((n) => n.kind === "gnomon")) {
    bp.nodes.find((n) => n.kind === "gnomon")!.params.h = h;
  }
  return { blueprint: bp, rationale: "Offline kernel: gnomon + solar altitude → similar-triangle shadow." };
}

function skyBench(_read: IntentRead, prompt: string) {
  const src = SAMPLES.find((s) => s.id === "sky-live")!;
  const bp = cloneBlueprint(src, "Live sky");
  bp.description = `Sky forged from: ${prompt.slice(0, 140)}`;
  return { blueprint: bp, rationale: "Offline kernel: NOAA-style sun; Stellarium :8090 if live." };
}

function machines(_read: IntentRead, prompt: string) {
  const p = prompt.toLowerCase();
  const id = /gear/.test(p) ? "machine-gears" : /print|bracket|stl|fdm|part/.test(p) ? "machine-bracket" : "machine-crank";
  const src = SAMPLES.find((s) => s.id === id) ?? SAMPLES.find((s) => s.domain === "machines")!;
  const bp = cloneBlueprint(src, src.name);
  bp.description = `Machine forged from: ${prompt.slice(0, 140)}`;
  return { blueprint: bp, rationale: "Offline kernel: slider-crank / Lewis gear / FDM part." };
}

function architecture(_read: IntentRead, prompt: string) {
  const p = prompt.toLowerCase();
  const pack = inferPack(p);
  if (/gallery|museum|hall|apse/.test(p)) {
    const src = SAMPLES.find((s) => s.id === "arch-gallery") ?? SAMPLES[SAMPLES.length - 1];
    const bp = cloneBlueprint(src, "Gallery");
    bp.skin = { pack: pack === "office" ? "sacred" : pack };
    bp.description = `Gallery forged from: ${prompt.slice(0, 140)}`;
    return { blueprint: bp, rationale: "Offline kernel: linear gallery, egress + daylight." };
  }
  if (/loft|cabin|apartment|home|studio/.test(p)) {
    const src = SAMPLES.find((s) => s.id === "arch-loft") ?? SAMPLES[SAMPLES.length - 3];
    const bp = cloneBlueprint(src, "Loft");
    bp.skin = { pack: pack === "office" ? "cozy" : pack };
    bp.description = `Loft forged from: ${prompt.slice(0, 140)}`;
    return { blueprint: bp, rationale: "Offline kernel: warehouse loft, furniture fill + pack." };
  }
  const src = SAMPLES.find((s) => s.id === "arch-office") ?? SAMPLES[SAMPLES.length - 2];
  const bp = cloneBlueprint(src, "Office plan");
  bp.skin = { pack };
  bp.description = `Office plan forged from: ${prompt.slice(0, 140)}`;
  return { blueprint: bp, rationale: "Offline kernel: four-room office, circulation + heat." };
}

function chemistry(read: IntentRead, prompt: string) {
  const p = prompt.toLowerCase();
  if (/haber|ammonia|nh3/.test(p)) {
    const src = SAMPLES.find((s) => s.id === "chem-haber") ?? SAMPLES[SAMPLES.length - 2];
    const bp = cloneBlueprint(src, "Haber slice");
    if (read.voltage) {
      /* ignore */
    }
    bp.description = `Haber–Bosch forged from: ${prompt.slice(0, 140)}`;
    return { blueprint: bp, rationale: "Offline kernel: mass-action N2 + 3 H2 ⇌ 2 NH3 with ΔH heating." };
  }
  if (/combust|methane|burn|ch4/.test(p)) {
    const src = SAMPLES.find((s) => s.id === "chem-combust") ?? SAMPLES[SAMPLES.length - 1];
    const bp = cloneBlueprint(src, "Combustion");
    bp.description = `Combustion forged from: ${prompt.slice(0, 140)}`;
    return { blueprint: bp, rationale: "Offline kernel: CH4 combustion, runaway heat check." };
  }
  const src = SAMPLES.find((s) => s.id === "chem-ester") ?? SAMPLES[SAMPLES.length - 3];
  const bp = cloneBlueprint(src, "Esterification");
  bp.description = `Esterification forged from: ${prompt.slice(0, 140)}`;
  return { blueprint: bp, rationale: "Offline kernel: AcOH + EtOH ⇌ EtOAc + H2O, Arrhenius + ΔH." };
}

function ringOrGrid(read: IntentRead, prompt: string) {
  if (isPathish(prompt)) {
    const seal = extractSealName(prompt);
    const bp = mapPathToBlueprint({
      sigil: seal ? "seal" : inferSigilId(prompt),
      seed: seal || prompt.slice(0, 40),
      name: seal ? `Seal ${seal}` : undefined,
      domain: "silicon",
      w_nm: read.nm ?? 20,
      vdd: read.voltage,
      mode: /ring|oscillat/.test(prompt.toLowerCase()) ? "ring" : /grid|ir drop|mesh/.test(prompt.toLowerCase()) ? "mesh" : "auto",
      crossings: /overpass|layer|air[\s-]?over/.test(prompt.toLowerCase()) ? "overpass" : "via",
    });
    return { blueprint: bp, rationale: `Path mapper: ${bp.name}. Geometry is the drawing; solver is Kirchhoff + Joule + EM.` };
  }
  const ir = /ir\s*drop|power\s*grid|mesh/.test(prompt.toLowerCase());
  if (ir) {
    const src = SAMPLES.find((s) => s.id === "si-ir-drop") ?? SAMPLES[1];
    const bp = cloneBlueprint(src, "IR-drop mesh");
    if (read.voltage) {
      for (const n of bp.nodes) if (n.params.fixed === 1 && (n.params.v ?? 0) > 0.2) n.params.v = read.voltage;
    }
    bp.notes = `Spec: IR drop < 5 % of ${read.voltage ?? 0.75} V. Mapped offline from intent.`;
    bp.description = `Power mesh forged from: ${prompt.slice(0, 140)}`;
    return { blueprint: bp, rationale: "Offline kernel: power-grid IR drop, Kirchhoff MNA." };
  }
  const stages = Math.max(3, Math.min(9, read.stages ?? 3));
  const nm = read.nm ?? 7;
  const vdd = read.voltage ?? (nm <= 5 ? 0.7 : 0.75);
  const nodes = [
    node("vdd", "pad", "VDD", 50, 8, { v: vdd, fixed: 1, C: 2e-14 }),
    node("gnd", "pad", "VSS", 50, 92, { v: 0, fixed: 1, C: 2e-14 }),
  ];
  const edges: LabEdge[] = [];
  const invs: string[] = [];
  for (let i = 0; i < stages; i++) {
    const ang = (i / stages) * Math.PI * 2 - Math.PI / 2;
    const id = `inv${i}`;
    invs.push(id);
    nodes.push(
      node(id, "inverter", `INV ${String.fromCharCode(65 + i)}`, 50 + Math.cos(ang) * 28, 50 + Math.sin(ang) * 22, {
        gain: 14,
        rout: 160 + nm * 4,
        C: 2e-14,
        Cth: 3e-12,
        w_nm: Math.max(16, nm * 4),
      }),
    );
    edges.push(edge(`railp${i}`, "vdd", id, { R: 12, C: 4e-17, L_nm: 200, w_nm: 40, layer: 2 }, "rail"));
    edges.push(edge(`railn${i}`, id, "gnd", { R: 14, C: 4e-17, L_nm: 220, w_nm: 40, layer: 1 }, "rail"));
  }
  for (let i = 0; i < stages; i++) {
    const a = invs[i];
    const b = invs[(i + 1) % stages];
    edges.push(edge(`e${i}`, a, b, { R: 48 + i * 4, C: 1.2e-16, L_nm: 420, w_nm: Math.max(10, nm * 2), layer: 1 }));
  }
  nodes.push(node("out", "pad", "PROBE", 90, 16, { v: 0, fixed: 0, C: 8e-16 }));
  edges.push(edge("ep", invs[0], "out", { R: 70, C: 1.6e-16, L_nm: 380, w_nm: 14, layer: 2 }));
  const bp: Blueprint = {
    id: uid("ai"),
    name: `${stages}-stage ${nm} nm ring`,
    domain: "silicon",
    description: `${stages}-stage CMOS inverter ring at a ${nm} nm-class BEOL. Kirchhoff + inverter transfer + Joule + Black EM.`,
    notes: `FO1 ring. Spec: oscillate, Tj < 105 °C, EM MTTF > 10 yr. VDD ${vdd} V.`,
    scale: nm * 2e-8,
    nodes,
    edges,
  };
  return { blueprint: bp, rationale: `Offline kernel: ${stages}-stage ring at ${nm} nm, VDD ${vdd} V.` };
}

function tunnel(read: IntentRead, prompt: string) {
  const height = read.eV ?? 0.22;
  const w = read.nm ?? 4;
  const src = SAMPLES.find((s) => s.id === "q-tunnel") ?? blankBlueprint("quantum");
  const bp = cloneBlueprint(src, height > 0.3 ? "High barrier tunnel" : "Wavepacket tunnel");
  const bar = bp.nodes.find((n) => n.kind === "barrier");
  if (bar) {
    bar.params.V_eV = height;
    bar.params.height = height;
    bar.params.w_nm = w;
    bar.label = `${height} eV / ${w} nm`;
  }
  bp.notes = `Spec: T > 0.05 if this is meant to couple two dots. Barrier ${height} eV, ${w} nm.`;
  bp.description = `TDSE tunnel forged from: ${prompt.slice(0, 140)}`;
  return { blueprint: bp, rationale: `Offline kernel: Gaussian packet vs ${height} eV / ${w} nm barrier.` };
}

function circuit(read: IntentRead, prompt: string) {
  const n = Math.max(3, Math.min(8, read.count ?? 6));
  const drive = read.hz ? Math.min(10, 2 + read.hz / 20) : 4;
  const nodes: LabNode[] = [];
  const edges: LabEdge[] = [];
  for (let i = 0; i < n; i++) {
    const x = 14 + (i / Math.max(1, n - 1)) * 72;
    const y = 50 + (i % 2 === 0 ? -12 : 14);
    const fs = i === n - 2;
    nodes.push(
      node(`n${i}`, "soma", fs ? "FS" : i === 0 ? "Relay" : `Pyr ${i}`, x, y, {
        a: fs ? 0.1 : 0.02,
        b: 0.2,
        c: -65,
        d: fs ? 2 : 8,
        Ibias: i === 0 ? drive : fs ? 0 : 2.4,
      }, i * 0.2),
    );
    if (i > 0) {
      edges.push(edge(`s${i}`, `n${i - 1}`, `n${i}`, { w: fs ? -8 : 9, delay: 0.002, kind: fs ? -1 : 1 }, "synapse"));
    }
  }
  if (n >= 4) {
    edges.push(edge("loop", `n${n - 2}`, `n${n - 3}`, { w: -10, delay: 0.001, kind: -1 }, "synapse"));
  }
  const bp: Blueprint = {
    id: uid("ai"),
    name: n >= 6 ? "Thalamocortical sketch" : `${n}-cell pathway`,
    domain: "neural",
    description: `Izhikevich chain with ${n} somas. Drive ${drive}. ${read.hz ? `Target ${read.hz} Hz.` : "Relay follows incoming bias."}`,
    notes: `Spec: no depolarization block. ${read.hz ? `Follow ${read.hz} Hz.` : ""}`,
    scale: 5e-5,
    nodes,
    edges,
  };
  return { blueprint: bp, rationale: `Offline kernel: ${n} Izhikevich cells, bias ${drive}. Intent: ${prompt.slice(0, 80)}` };
}

function cell(read: IntentRead, prompt: string) {
  const src = SAMPLES.find((s) => s.id === "cell-excitable") ?? blankBlueprint("cellular");
  const bp = cloneBlueprint(src, "Excitable cell");
  const extra = Math.max(0, (read.count ?? 0) - 4);
  for (let i = 0; i < extra; i++) {
    const id = `chx${i}`;
    bp.nodes.push(node(id, "channel", `Ca extra ${i + 1}`, 20 + i * 12, 80, { g: 0.35, E: 0.06 }));
    bp.edges.push(edge(`cx${i}`, id, "nuc", { g: 0.4, delay: 0.002 }, "cytosol"));
  }
  bp.description = `Excitable compartment forged from: ${prompt.slice(0, 140)}`;
  bp.notes = "Spec: spike without [Ca] overload. Morphogen contrast > 0.2.";
  return { blueprint: bp, rationale: "Offline kernel: FitzHugh–Nagumo cell + ion channels." };
}

function cantilever(read: IntentRead, prompt: string) {
  const joints = Math.max(3, Math.min(8, read.count ?? 4));
  const nodes = [node("a0", "anchor", "Anchor", 10, 50, { fixed: 1, m: 0 })];
  const edges: LabEdge[] = [];
  for (let i = 1; i <= joints; i++) {
    const id = `j${i}`;
    nodes.push(node(id, "joint", `J${i}`, 10 + (i / (joints + 1)) * 74, 50, { m: 2.3e-13 }));
    const prev = i === 1 ? "a0" : `j${i - 1}`;
    edges.push(edge(`bm${i}`, prev, id, { L: 2.8e-5, w: 2e-5, t: 2e-6, E: 1.6e11 }, "beam"));
  }
  nodes.push(node("tip", "mass", "Proof mass", 88, 50, { m: 3.2e-12, F: 3.2e-12 * 9.81 }));
  edges.push(edge("bmt", `j${joints}`, "tip", { L: 2e-5, w: 4e-5, t: 4e-6, E: 1.6e11 }, "beam"));
  const bp: Blueprint = {
    id: uid("ai"),
    name: "MEMS cantilever",
    domain: "mechanical",
    description: `Euler–Bernoulli beam, ${joints} joints. Forged from: ${prompt.slice(0, 120)}`,
    notes: "Poly-Si. Spec: 1 g range, SF > 4, f0 1–8 kHz.",
    scale: 2e-6,
    nodes,
    edges,
  };
  return { blueprint: bp, rationale: `Offline kernel: ${joints}-joint MEMS cantilever.` };
}

function mutateBench(current: Blueprint, prompt: string, read: IntentRead) {
  const bp = cloneBlueprint(current, current.name);
  const lower = prompt.toLowerCase();
  const sign = /\b(lower|decrease|thinner|slower|drop)\b/.test(lower) ? 0.85 : 1.15;
  if (read.voltage) {
    for (const n of bp.nodes) if (n.params.v != null && n.params.fixed === 1) n.params.v = read.voltage;
  }
  if (read.eV) {
    for (const n of bp.nodes) if (n.kind === "barrier") n.params.V_eV = read.eV;
  }
  if (read.nm) {
    for (const e of bp.edges) if (e.params.w_nm) e.params.w_nm = read.nm * 2;
  }
  if (/\badd a\b/.test(lower)) {
    const kind = defaultKind(bp.domain);
    const id = uid("n");
    bp.nodes.push({
      id,
      kind,
      label: `${kind} +`,
      x: 50,
      y: 22,
      z: 0,
      params: {},
    });
    if (bp.nodes[0]) {
      bp.edges.push({
        id: uid("e"),
        from: bp.nodes[0].id,
        to: id,
        kind: bp.edges[0]?.kind ?? "trace",
        params: { ...(bp.edges[0]?.params ?? {}) },
      });
    }
  }
  for (const n of bp.nodes) {
    if (n.params.Ibias != null && /bias|drive|current/.test(lower)) n.params.Ibias *= sign;
    if (n.params.gain != null && /gain/.test(lower)) n.params.gain *= sign;
  }
  bp.notes = `${bp.notes}\nMutated: ${prompt.slice(0, 160)}`;
  bp.description = `Iteration on ${current.name}.`;
  return { blueprint: bp, rationale: "Offline kernel: mutated the live bench to match the request." };
}

function node(
  id: string,
  kind: string,
  label: string,
  x: number,
  y: number,
  params: Record<string, number> = {},
  z = 0,
) {
  return { id, kind, label, x, y, z, params };
}

function edge(
  id: string,
  from: string,
  to: string,
  params: Record<string, number> = {},
  kind = "trace",
) {
  return { id, from, to, kind, params };
}
