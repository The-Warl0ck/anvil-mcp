import { hash32, type Pt } from "./path-geom.ts";

export interface SigilDef {
  id: string;
  name: string;
  blurb: string;
  closed: boolean;
}

export const SIGIL_CATALOG: SigilDef[] = [
  { id: "pentagram", name: "Pentagram net", blurb: "Five-point star. Crossings crowd current — good heat/EM probe.", closed: true },
  { id: "hexagram", name: "Hexagram net", blurb: "Two triangles. Parallel paths vs a single bus.", closed: true },
  { id: "heptagram", name: "Heptagram net", blurb: "{7/3} star. Longer series, more vias.", closed: true },
  { id: "enneagram", name: "Enneagram net", blurb: "{9/4} star. Dense crossings, current crowding.", closed: true },
  { id: "spiral", name: "Archimedean spiral", blurb: "Long series trace. IR and Joule along the coil.", closed: false },
  { id: "lemniscate", name: "Lemniscate", blurb: "Figure-eight. Two loops share a via at the pinch.", closed: true },
  { id: "vesica", name: "Vesica", blurb: "Two overlapping circles. Dual rings + shared chord.", closed: true },
  { id: "circle", name: "Ring loop", blurb: "Closed circular bus — baseline vs star layouts.", closed: true },
  { id: "tree", name: "Ten-node tree", blurb: "Classic 10-sphere / 22-path graph as a PDN.", closed: false },
  { id: "seal", name: "Named seal", blurb: "Any word → unique star + circle + chords. Reproducible.", closed: true },
];

function star(n: number, skip: number, r = 34, cx = 50, cy = 50): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (i * skip * 2 * Math.PI) / n;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function circle(n = 32, r = 32, cx = 50, cy = 50): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
}

function spiral(turns = 3.2, n = 96): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = t * turns * Math.PI * 2;
    const r = 4 + t * 30;
    pts.push({ x: 50 + r * Math.cos(a), y: 50 + r * Math.sin(a) });
  }
  return pts;
}

function lemniscate(n = 80): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const s = Math.sin(t);
    const c = Math.cos(t);
    const d = 1 + s * s;
    pts.push({ x: 50 + (28 * c) / d, y: 50 + (18 * s * c) / d });
  }
  return pts;
}

function vesica(): Pt[][] {
  return [circle(36, 22, 40, 50), circle(36, 22, 60, 50)];
}

/** 10-node tree with 22 paths — positions in schematic space. */
export function treeGraph(): { nodes: Pt[]; edges: [number, number][] } {
  const nodes: Pt[] = [
    { x: 50, y: 10 },
    { x: 32, y: 22 },
    { x: 68, y: 22 },
    { x: 18, y: 40 },
    { x: 50, y: 40 },
    { x: 82, y: 40 },
    { x: 18, y: 62 },
    { x: 50, y: 62 },
    { x: 82, y: 62 },
    { x: 50, y: 88 },
  ];
  const edges: [number, number][] = [
    [0, 1], [0, 2], [1, 2],
    [1, 3], [1, 4], [2, 4], [2, 5],
    [3, 4], [4, 5],
    [3, 6], [4, 6], [4, 7], [4, 8], [5, 8],
    [6, 7], [7, 8],
    [6, 9], [7, 9], [8, 9],
    [3, 7], [5, 7], [1, 6],
  ];
  return { nodes, edges };
}

export function sealFromName(name: string): Pt[][] {
  const h = hash32(name.trim().toLowerCase() || "seal");
  const n = 5 + (h % 5);
  const skip = 2 + ((h >>> 8) % Math.max(1, Math.floor((n - 1) / 2)));
  const r = 28 + (h % 8);
  const paths: Pt[][] = [star(n, skip, r), circle(40, r + 6)];
  const inner = 12 + ((h >>> 4) % 10);
  const spokes = 3 + ((h >>> 12) % 4);
  const chord: Pt[] = [];
  for (let i = 0; i < spokes; i++) {
    const a = -Math.PI / 2 + (i * skip * 2 * Math.PI) / n;
    const b = -Math.PI / 2 + ((i + 2) * skip * 2 * Math.PI) / n;
    chord.push({ x: 50 + inner * Math.cos(a), y: 50 + inner * Math.sin(a) });
    chord.push({ x: 50 + r * Math.cos(b), y: 50 + r * Math.sin(b) });
  }
  if (chord.length >= 2) paths.push(chord);
  return paths;
}

export function sigilPolylines(id: string, seed?: string): Pt[][] {
  const key = id.toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (key === "pentagram" || key === "pentacle" || key === "goetic") return [star(5, 2), circle(40, 36)];
  if (key === "hexagram" || key === "star-of-david") return [star(6, 2)];
  if (key === "heptagram") return [star(7, 3)];
  if (key === "enneagram") return [star(9, 4)];
  if (key === "spiral") return [spiral()];
  if (key === "lemniscate" || key === "infinity") return [lemniscate()];
  if (key === "vesica") return vesica();
  if (key === "circle" || key === "ring") return [circle()];
  if (key === "seal" || key === "named") return sealFromName(seed || "seal");
  if (key.startsWith("seal:")) return sealFromName(key.slice(5) || seed || "seal");
  if (seed && (key === "sigil" || key === "custom")) return sealFromName(seed);
  return [star(5, 2), circle(40, 36)];
}

export function isSigilId(id: string) {
  const key = id.toLowerCase().replace(/[^a-z0-9-:]/g, "");
  if (key.startsWith("seal:")) return true;
  return SIGIL_CATALOG.some((s) => s.id === key) || /pentagram|hexagram|heptagram|enneagram|spiral|lemniscate|vesica|goetic|sigil/.test(key);
}
