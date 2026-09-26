import type { Blueprint, Domain, LabEdge, LabNode } from "./types.ts";

function uid(prefix = "n") {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}
import {
  clusterPoints,
  densify,
  dist,
  extractSvgPolylines,
  isClosed,
  nearestIndex,
  normalizeToSchematic,
  parsePathD,
  pathLength,
  segIntersect,
  type Pt,
} from "./path-geom.ts";
import { isSigilId, sealFromName, sigilPolylines, treeGraph } from "./sigils.ts";

export type PathMode = "auto" | "trace" | "ring" | "mesh";
export type CrossingMode = "via" | "overpass";

export interface MapPathInput {
  points?: Pt[];
  paths?: Pt[][];
  svg?: string;
  d?: string;
  sigil?: string;
  seed?: string;
  name?: string;
  domain?: Domain;
  mode?: PathMode;
  crossings?: CrossingMode;
  w_nm?: number;
  vdd?: number;
  stages?: number;
  scale?: number;
}

const RHO_CU = 1.68e-8;
const T_M = 1e-7;

function resist(lenUnits: number, w_nm: number, scale: number) {
  const L = Math.max(lenUnits, 0.2) * scale;
  const w = Math.max(w_nm, 4) * 1e-9;
  const r = (RHO_CU * L) / (w * T_M);
  return Math.max(r, 0.02);
}

function defaultKind(domain: Domain) {
  if (domain === "silicon") return "tap";
  if (domain === "cellular") return "organelle";
  if (domain === "quantum") return "well";
  if (domain === "neural") return "soma";
  if (domain === "architecture") return "room";
  if (domain === "metallurgy") return "Fe";
  if (domain === "robotics") return "joint";
  if (domain === "machines") return "part";
  return "joint";
}

function defaultEdge(domain: Domain) {
  if (domain === "silicon") return "trace";
  if (domain === "neural") return "synapse";
  if (domain === "mechanical") return "beam";
  if (domain === "quantum") return "tunnel";
  if (domain === "architecture") return "door";
  if (domain === "metallurgy") return "mix";
  if (domain === "robotics") return "link";
  if (domain === "machines") return "shaft";
  return "cytosol";
}

function defaultScale(domain: Domain) {
  if (domain === "silicon") return 2e-7;
  if (domain === "cellular") return 1e-6;
  if (domain === "quantum") return 1e-9;
  if (domain === "neural") return 5e-5;
  if (domain === "architecture") return 0.45;
  if (domain === "metallurgy") return 1;
  if (domain === "robotics") return 0.01;
  if (domain === "machines") return 0.001;
  return 2e-6;
}

function nodeParams(domain: Domain, kind: string, extra: Record<string, number> = {}): Record<string, number> {
  if (domain === "silicon") {
    if (kind === "pad") return { v: extra.v ?? 0.75, fixed: extra.fixed ?? 1, C: 2e-14, ...extra };
    if (kind === "inverter") return { gain: 14, rout: 180, C: 2e-14, Cth: 3e-12, w_nm: extra.w_nm ?? 28, ...extra };
    if (kind === "tap") return { C: 8e-15, Iload: extra.Iload ?? 0, ...extra };
    return { C: 5e-16, ...extra };
  }
  if (domain === "neural") return { a: 0.02, b: 0.2, c: -65, d: 8, Ibias: extra.Ibias ?? 3, ...extra };
  if (domain === "mechanical") return kind === "anchor" ? { fixed: 1, m: 0 } : { m: 2e-13, ...extra };
  if (domain === "quantum") return { V_eV: 0.15, w_nm: extra.w_nm ?? 4, ...extra };
  if (domain === "architecture") {
    return { area: extra.area ?? 28, people: extra.people ?? 3, windows: extra.windows ?? 2, lights: extra.lights ?? 2, desks: extra.desks ?? 1, chairs: extra.chairs ?? 2, plants: extra.plants ?? 1, ...extra };
  }
  return { g: 0.5, ...extra };
}

function edgeParams(domain: Domain, len: number, w_nm: number, scale: number, layer = 1): Record<string, number> {
  if (domain === "silicon") {
    return { R: resist(len, w_nm, scale), C: 1.2e-16, L_nm: len * scale * 1e9, w_nm, layer };
  }
  if (domain === "neural") return { w: 8, delay: Math.max(0.0004, len * 0.00008) };
  if (domain === "mechanical") return { L: Math.max(len * scale, 1e-6), w: 2e-5, t: 2e-6, E: 1.6e11 };
  if (domain === "quantum") return { coupling: 0.06 };
  if (domain === "architecture") return { width: 1.1 };
  return { g: 0.4, delay: 0.002 };
}

function gatherPaths(input: MapPathInput): Pt[][] {
  if (input.sigil) {
    const id = input.sigil.toLowerCase();
    if (id === "tree") return [];
    return sigilPolylines(input.sigil, input.seed || input.name);
  }
  if (input.paths?.length) return input.paths;
  if (input.points?.length) return [input.points];
  if (input.d) return parsePathD(input.d);
  if (input.svg) return extractSvgPolylines(input.svg);
  return [];
}

function splitAtIntersections(paths: Pt[][]): Pt[][] {
  const dens = paths.map((p) => densify(p, 2.8));
  const extras: Pt[][][] = dens.map(() => []);
  for (let p = 0; p < dens.length; p++) {
    extras[p] = dens[p].map(() => [] as Pt[]);
  }
  for (let pi = 0; pi < dens.length; pi++) {
    const A = dens[pi];
    for (let i = 0; i < A.length - 1; i++) {
      for (let pj = pi; pj < dens.length; pj++) {
        const B = dens[pj];
        const j0 = pj === pi ? i + 2 : 0;
        for (let j = j0; j < B.length - 1; j++) {
          const hit = segIntersect(A[i], A[i + 1], B[j], B[j + 1]);
          if (!hit) continue;
          extras[pi][i].push(hit);
          extras[pj][j].push(hit);
        }
      }
    }
  }
  return dens.map((line, pi) => {
    const out: Pt[] = [];
    for (let i = 0; i < line.length - 1; i++) {
      out.push(line[i]);
      const hits = extras[pi][i]
        .slice()
        .sort((a, b) => dist(line[i], a) - dist(line[i], b));
      for (const h of hits) out.push(h);
    }
    out.push(line[line.length - 1]);
    return out;
  });
}

function cornersAndEnds(line: Pt[]): Pt[] {
  const out: Pt[] = [];
  if (!line.length) return out;
  out.push(line[0]);
  for (let i = 1; i < line.length - 1; i++) {
    const a = line[i - 1];
    const b = line[i];
    const c = line[i + 1];
    const v1x = b.x - a.x;
    const v1y = b.y - a.y;
    const v2x = c.x - b.x;
    const v2y = c.y - b.y;
    const l1 = Math.hypot(v1x, v1y) || 1;
    const l2 = Math.hypot(v2x, v2y) || 1;
    const dot = (v1x * v2x + v1y * v2y) / (l1 * l2);
    if (dot < 0.86) out.push(b);
  }
  out.push(line[line.length - 1]);
  return out;
}

interface NetGraph {
  nodes: Pt[];
  links: { a: number; b: number; len: number }[];
}

function sampleLine(line: Pt[], step = 8): Pt[] {
  if (line.length < 2) return line.slice();
  const out: Pt[] = [line[0]];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    acc += dist(line[i - 1], line[i]);
    if (acc >= step) {
      out.push(line[i]);
      acc = 0;
    }
  }
  const last = line[line.length - 1];
  if (dist(out[out.length - 1], last) > 0.45) out.push(last);
  else out[out.length - 1] = last;
  return out;
}

function graphFromPaths(raw: Pt[][], crossings: CrossingMode): NetGraph {
  const fitted = raw.map((p) => normalizeToSchematic(p));
  const lines = crossings === "via" ? splitAtIntersections(fitted) : fitted.map((p) => densify(p, 3.2));
  const seeds: Pt[] = [];
  for (const line of lines) seeds.push(...cornersAndEnds(line));
  if (crossings === "via") {
    for (const line of lines) seeds.push(...sampleLine(line, 8));
  }
  const nodes = clusterPoints(seeds, 3.0);
  const links: { a: number; b: number; len: number }[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    let prev = nearestIndex(nodes, line[0]).i;
    let acc = 0;
    for (let i = 1; i < line.length; i++) {
      acc += dist(line[i - 1], line[i]);
      const cur = nearestIndex(nodes, line[i]).i;
      if (cur === prev) continue;
      const key = prev < cur ? `${prev}-${cur}` : `${cur}-${prev}`;
      if (!seen.has(key)) {
        seen.add(key);
        links.push({ a: prev, b: cur, len: Math.max(acc, dist(nodes[prev], nodes[cur])) });
      }
      prev = cur;
      acc = 0;
    }
  }
  if (nodes.length < 2) {
    nodes.push({ x: 30, y: 50 }, { x: 70, y: 50 });
    links.push({ a: 0, b: 1, len: 40 });
  }
  if (!links.length) {
    for (let i = 0; i < nodes.length - 1; i++) {
      links.push({ a: i, b: i + 1, len: dist(nodes[i], nodes[i + 1]) });
    }
  }
  return { nodes, links };
}

function pickMode(input: MapPathInput, graph: NetGraph, paths: Pt[][]): PathMode {
  if (input.mode && input.mode !== "auto") return input.mode;
  const closed = paths.some((p) => isClosed(p, 4));
  const crossings = graph.links.length > graph.nodes.length;
  if (closed && graph.nodes.length >= 5 && !crossings) return "ring";
  if (crossings || graph.nodes.length >= 8) return "mesh";
  return "trace";
}

function buildTreeBlueprint(domain: Domain, w_nm: number, vdd: number, scale: number, name: string): Blueprint {
  const g = treeGraph();
  const nodes: LabNode[] = g.nodes.map((p, i) => {
    const kind = i === 0 ? (domain === "silicon" ? "pad" : defaultKind(domain)) : defaultKind(domain);
    return {
      id: `n${i}`,
      kind: i === 0 && domain === "silicon" ? "pad" : i === 9 && domain === "silicon" ? "tap" : kind,
      label: i === 0 ? "CROWN" : i === 9 ? "ROOT" : `N${i}`,
      x: p.x,
      y: p.y,
      z: 0,
      params:
        domain === "silicon" && i === 0
          ? nodeParams(domain, "pad", { v: vdd, fixed: 1 })
          : domain === "silicon" && i === 9
            ? nodeParams(domain, "tap", { Iload: 0.018 })
            : nodeParams(domain, kind),
    };
  });
  if (domain === "silicon") {
    nodes.push({
      id: "gnd",
      kind: "pad",
      label: "VSS",
      x: 50,
      y: 96,
      z: 0,
      params: nodeParams(domain, "pad", { v: 0, fixed: 1 }),
    });
  }
  const edges: LabEdge[] = g.edges.map((e, i) => {
    const len = dist(g.nodes[e[0]], g.nodes[e[1]]);
    return {
      id: `e${i}`,
      from: `n${e[0]}`,
      to: `n${e[1]}`,
      kind: defaultEdge(domain),
      params: edgeParams(domain, len, w_nm, scale),
    };
  });
  if (domain === "silicon") {
    edges.push({
      id: "eg",
      from: "n9",
      to: "gnd",
      kind: "load",
      params: edgeParams(domain, 8, w_nm * 2, scale, 2),
    });
  }
  return {
    id: uid("bp"),
    name,
    domain,
    description: "Ten-node / 22-path graph mapped as a physical net. Same adjacency the drawing claims.",
    notes: "Spec: compare IR/heat vs a Manhattan mesh of the same node count.",
    scale,
    nodes,
    edges,
  };
}

export function mapPathToBlueprint(input: MapPathInput): Blueprint {
  const domain: Domain = input.domain ?? "silicon";
  const w_nm = input.w_nm ?? 20;
  const vdd = input.vdd ?? 0.75;
  const scale = input.scale ?? defaultScale(domain);
  const crossings: CrossingMode = input.crossings ?? "via";
  const name =
    input.name ||
    (input.sigil ? `${input.sigil} layout` : input.seed ? `Seal ${input.seed}` : "Mapped path");

  if ((input.sigil || "").toLowerCase() === "tree") {
    return buildTreeBlueprint(domain, w_nm, vdd, scale, name);
  }

  let paths = gatherPaths(input);
  if (!paths.length && input.seed) paths = sealFromName(input.seed);
  if (!paths.length) paths = sigilPolylines("pentagram");

  const graph = graphFromPaths(paths, crossings);
  const mode = pickMode(input, graph, paths);
  const closed = paths.some((p) => isClosed(normalizeToSchematic(p), 4));

  const nodes: LabNode[] = graph.nodes.map((p, i) => ({
    id: `n${i}`,
    kind: defaultKind(domain),
    label: `N${i + 1}`,
    x: p.x,
    y: p.y,
    z: 0,
    params: nodeParams(domain, defaultKind(domain)),
  }));

  const top = graph.nodes.reduce((b, p, i) => (p.y < graph.nodes[b].y ? i : b), 0);
  const bot = graph.nodes.reduce((b, p, i) => (p.y > graph.nodes[b].y ? i : b), 0);
  const core = graph.nodes.reduce((b, p, i) => {
    const da = dist(p, { x: 50, y: 50 });
    const db = dist(graph.nodes[b], { x: 50, y: 50 });
    return da < db ? i : b;
  }, 0);

  if (domain === "silicon") {
    if (mode === "ring") {
      const stages = Math.max(3, Math.min(9, input.stages ?? (graph.nodes.length % 2 === 1 ? Math.min(7, graph.nodes.length) : 5)));
      const order = [...graph.nodes.keys()].sort((a, b) => {
        const aa = Math.atan2(graph.nodes[a].y - 50, graph.nodes[a].x - 50);
        const bb = Math.atan2(graph.nodes[b].y - 50, graph.nodes[b].x - 50);
        return aa - bb;
      });
      const pick: number[] = [];
      for (let s = 0; s < stages; s++) pick.push(order[Math.floor((s * order.length) / stages) % order.length]);
      const unique = [...new Set(pick)];
      while (unique.length < 3 && unique.length < order.length) unique.push(order[unique.length]);
      for (const i of unique) {
        nodes[i].kind = "inverter";
        nodes[i].label = `INV ${nodes[i].id}`;
        nodes[i].params = nodeParams(domain, "inverter", { w_nm: Math.max(16, w_nm) });
      }
    } else if (mode === "mesh") {
      nodes[core].kind = "tap";
      nodes[core].label = "CORE";
      nodes[core].params = nodeParams(domain, "tap", { Iload: 0.022, C: 2e-14 });
    } else {
      nodes[core].kind = "tap";
      nodes[core].params = nodeParams(domain, "tap", { Iload: 0.008 });
    }

    nodes.push({
      id: "vdd",
      kind: "pad",
      label: "VDD",
      x: graph.nodes[top].x,
      y: Math.max(6, graph.nodes[top].y - 10),
      z: 0,
      params: nodeParams(domain, "pad", { v: vdd, fixed: 1 }),
    });
    nodes.push({
      id: "gnd",
      kind: "pad",
      label: "VSS",
      x: graph.nodes[bot].x,
      y: Math.min(94, graph.nodes[bot].y + 10),
      z: 0,
      params: nodeParams(domain, "pad", { v: 0, fixed: 1 }),
    });
  } else if (domain === "mechanical") {
    nodes[top].kind = "anchor";
    nodes[top].params = { fixed: 1, m: 0 };
    nodes[bot].kind = "mass";
    nodes[bot].params = { m: 3e-12, F: 3e-11 };
  } else if (domain === "neural") {
    nodes[0].params = nodeParams(domain, "soma", { Ibias: 5 });
  } else if (domain === "architecture") {
    nodes[bot].kind = "foyer";
    nodes[bot].label = "Foyer";
    nodes[bot].params = nodeParams(domain, "foyer", { area: 18, people: 2, windows: 1, lights: 2, exit: 1, plants: 1 });
    for (let i = 0; i < nodes.length; i++) {
      if (i === bot) continue;
      nodes[i].kind = "room";
      nodes[i].label = "Room " + (i + 1);
      nodes[i].params = nodeParams(domain, "room", { area: 22 + (i % 4) * 6, people: 3, windows: 1 + (i % 3), lights: 2, desks: 1, chairs: 2, plants: i % 2 });
    }
  }

  const edges: LabEdge[] = graph.links.map((l, i) => ({
    id: `e${i}`,
    from: `n${l.a}`,
    to: `n${l.b}`,
    kind: defaultEdge(domain),
    params: edgeParams(domain, l.len, crossings === "overpass" && i % 2 ? w_nm : w_nm, scale, crossings === "overpass" && i % 2 ? 2 : 1),
  }));

  if (domain === "silicon") {
    const railW = Math.max(w_nm * 2, 28);
    edges.push({
      id: "railp",
      from: "vdd",
      to: `n${top}`,
      kind: "rail",
      params: edgeParams(domain, 10, railW, scale, 2),
    });
    edges.push({
      id: "railn",
      from: `n${bot}`,
      to: "gnd",
      kind: "rail",
      params: edgeParams(domain, 10, railW, scale, 1),
    });
    if (mode === "mesh") {
      edges.push({
        id: "eg",
        from: `n${core}`,
        to: "gnd",
        kind: "load",
        params: { R: 70, w_nm: railW, L_nm: 4000, layer: 2 },
      });
    }
  }

  const Ltot = pathLength(paths.flat());
  return {
    id: uid("bp"),
    name,
    domain,
    description:
      domain === "architecture"
        ? `Mapped floor plate: ${graph.nodes.length} rooms / ${graph.links.length} doors from the drawing. Foyer is the south node.`
        : `Mapped ${graph.nodes.length} nodes / ${graph.links.length} traces from a ${mode} layout (${crossings} crossings). Geometry is the drawing — not a Manhattan rewrite.`,
    notes:
      domain === "architecture"
        ? `Spec: density, egress, daylight, furniture fill. Path length ${Ltot.toFixed(1)}.`
        : `Spec: compare Joule, Tj, IR, EM vs a grid of the same node count. Path length ${Ltot.toFixed(1)} schematic units. VDD ${vdd} V, ${w_nm} nm drawn.${closed ? " Closed path." : ""}`,
    scale,
    nodes,
    edges,
    skin: domain === "architecture" ? { pack: "office" } : undefined,
  };
}

export function isPathish(text: string) {
  const t = text.toLowerCase();
  return /sigil|pentagram|hexagram|heptagram|enneagram|spiral|lemniscate|vesica|goetic|seal of|star polygon|svg path|polyline|shape of|layout shaped|tree of life|named seal|walk (the |this )?(net|path|circuit)/.test(
    t,
  );
}

export function extractSealName(text: string) {
  const m = text.match(/seal of\s+([a-z0-9][\w-]{0,40})/i) || text.match(/sigil of\s+([a-z0-9][\w-]{0,40})/i);
  return m ? m[1] : undefined;
}

export function inferSigilId(text: string) {
  const t = text.toLowerCase();
  if (/tree of life|ten-node tree|22.path/.test(t)) return "tree";
  if (/pentagram|pentacle|goetic/.test(t)) return "pentagram";
  if (/hexagram|star of david/.test(t)) return "hexagram";
  if (/heptagram/.test(t)) return "heptagram";
  if (/enneagram/.test(t)) return "enneagram";
  if (/spiral/.test(t)) return "spiral";
  if (/lemniscate|figure.?eight|infinity/.test(t)) return "lemniscate";
  if (/vesica/.test(t)) return "vesica";
  if (/named seal|seal of|sigil of/.test(t)) return "seal";
  if (isSigilId(t)) return t;
  return "pentagram";
}
