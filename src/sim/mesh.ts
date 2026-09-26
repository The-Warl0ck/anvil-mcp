import type { Blueprint, LabNode } from "./types.ts";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { anvilDir } from "../lib/utils.ts";

type V = [number, number, number];
interface Tri {
  n: V;
  a: V;
  b: V;
  c: V;
}

function sub(a: V, b: V): V {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: V, b: V): V {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a: V): V {
  const L = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / L, a[1] / L, a[2] / L];
}
function add(a: V, b: V): V {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function mul(a: V, s: number): V {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function tri(a: V, b: V, c: V): Tri {
  return { n: norm(cross(sub(b, a), sub(c, a))), a, b, c };
}

function box(c: V, sx: number, sy: number, sz: number): Tri[] {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const p: V[] = [
    [c[0] - hx, c[1] - hy, c[2] - hz],
    [c[0] + hx, c[1] - hy, c[2] - hz],
    [c[0] + hx, c[1] + hy, c[2] - hz],
    [c[0] - hx, c[1] + hy, c[2] - hz],
    [c[0] - hx, c[1] - hy, c[2] + hz],
    [c[0] + hx, c[1] - hy, c[2] + hz],
    [c[0] + hx, c[1] + hy, c[2] + hz],
    [c[0] - hx, c[1] + hy, c[2] + hz],
  ];
  const q = (i: number, j: number, k: number, l: number) => [tri(p[i], p[j], p[k]), tri(p[i], p[k], p[l])];
  return [
    ...q(0, 1, 2, 3),
    ...q(4, 7, 6, 5),
    ...q(0, 4, 5, 1),
    ...q(3, 2, 6, 7),
    ...q(0, 3, 7, 4),
    ...q(1, 5, 6, 2),
  ];
}

function cylinder(a: V, b: V, r: number, segs = 12): Tri[] {
  const d = sub(b, a);
  const L = Math.hypot(d[0], d[1], d[2]) || 1;
  const ax = [d[0] / L, d[1] / L, d[2] / L] as V;
  const tmp: V = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(ax, tmp));
  const v = norm(cross(ax, u));
  const ring = (p: V) => {
    const out: V[] = [];
    for (let i = 0; i < segs; i++) {
      const th = (i / segs) * Math.PI * 2;
      out.push(add(p, add(mul(u, Math.cos(th) * r), mul(v, Math.sin(th) * r))));
    }
    return out;
  };
  const ra = ring(a);
  const rb = ring(b);
  const out: Tri[] = [];
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs;
    out.push(tri(ra[i], rb[i], rb[j]));
    out.push(tri(ra[i], rb[j], ra[j]));
    out.push(tri(a, ra[j], ra[i]));
    out.push(tri(b, rb[i], rb[j]));
  }
  return out;
}

function sphere(c: V, r: number, segs = 10): Tri[] {
  const out: Tri[] = [];
  const pt = (lat: number, lon: number): V => {
    const la = (lat / segs) * Math.PI;
    const lo = (lon / segs) * Math.PI * 2;
    return [c[0] + r * Math.sin(la) * Math.cos(lo), c[1] + r * Math.cos(la), c[2] + r * Math.sin(la) * Math.sin(lo)];
  };
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < segs; j++) {
      const a = pt(i, j);
      const b = pt(i + 1, j);
      const c2 = pt(i + 1, j + 1);
      const d = pt(i, j + 1);
      if (i > 0) out.push(tri(a, b, d));
      if (i < segs - 1) out.push(tri(b, c2, d));
    }
  }
  return out;
}

function printScale(bp: Blueprint) {
  if (bp.domain === "architecture") return 80;
  if (bp.domain === "robotics" || bp.domain === "machines") return 80;
  if (bp.domain === "mechanical") return 4e5;
  if (bp.domain === "metallurgy") return 0.8;
  return 0.8;
}

function pos(bp: Blueprint, n: LabNode): V {
  const s = printScale(bp);
  return [(n.x - 50) * s, n.z * s * 0.4 + 6, (n.y - 50) * s];
}

function nodeMesh(bp: Blueprint, n: LabNode): Tri[] {
  const c = pos(bp, n);
  const s = printScale(bp);
  if (n.kind === "gear") {
    const r = Math.max(4, (n.params.z ?? 20) * (n.params.m ?? 0.002) * 1000 * 0.5);
    const th = (n.params.b ?? 0.012) * 1000;
    return cylinder([c[0], c[1] - th / 2, c[2]], [c[0], c[1] + th / 2, c[2]], r, 20);
  }
  if (n.kind === "piston") {
    const bore = (n.params.bore ?? 0.05) * 1000;
    return cylinder([c[0], c[1] - bore * 0.4, c[2]], [c[0], c[1] + bore * 0.4, c[2]], bore / 2, 14);
  }
  if (n.kind === "crank") {
    const r = (n.params.r ?? 0.03) * 1000;
    return cylinder([c[0] - r, c[1], c[2]], [c[0] + r, c[1], c[2]], Math.max(3, r * 0.18), 12);
  }
  if (n.kind === "part") {
    const L = (n.params.L ?? 0.06) * 1000;
    const b = (n.params.b ?? 0.018) * 1000;
    const t = (n.params.t ?? 0.004) * 1000;
    return box(c, L, t, b);
  }
  if (n.kind === "joint" || n.kind === "base" || n.kind === "ee") {
    return sphere(c, n.kind === "base" ? 8 : 5, 8);
  }
  if (n.kind === "melt" || n.kind === "alloy") return sphere(c, 10, 10);
  if (n.kind === "room" || n.kind === "foyer" || n.kind === "studio" || n.kind === "gallery") {
    const a = n.params.area || 24;
    const w = Math.sqrt(a) * 8;
    return box([c[0], 1.2, c[2]], w, 2.4, w);
  }
  if (n.kind === "inverter" || n.kind === "pad" || n.kind === "tap") return box(c, 6, 2, 8);
  if (n.kind === "anchor") return box(c, 8, 8, 8);
  if (n.kind === "mass") return box(c, 10, 6, 10);
  const r = Math.max(3, (n.params.wt ?? 1) * 2.2);
  return box(c, Math.max(5, s * 0.08), Math.max(4, r), Math.max(5, s * 0.08));
}

function edgeMesh(bp: Blueprint, from: LabNode, to: LabNode, kind: string, params: Record<string, number>): Tri[] {
  const a = pos(bp, from);
  const b = pos(bp, to);
  if (kind === "link" || kind === "arm" || kind === "rod" || kind === "shaft") {
    const r = kind === "rod" ? Math.max(1.6, (params.d ?? 0.01) * 500) : 2.4;
    return cylinder(a, b, r, 10);
  }
  if (kind === "beam") {
    const w = Math.max(1.2, (params.w ?? 2e-5) * 8e4);
    const t = Math.max(0.8, (params.t ?? 2e-6) * 2e5);
    const mid: V = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 8;
    return box(mid, L, t, w);
  }
  if (kind === "door" || kind === "corridor") return [];
  return cylinder(a, b, 1.4, 8);
}

export function buildMesh(bp: Blueprint): Tri[] {
  const tris: Tri[] = [];
  for (const n of bp.nodes) tris.push(...nodeMesh(bp, n));
  const byId = new Map(bp.nodes.map((n) => [n.id, n]));
  for (const e of bp.edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    tris.push(...edgeMesh(bp, a, b, e.kind, e.params));
  }
  return tris.filter((t) => Number.isFinite(t.n[0]) && Number.isFinite(t.a[0]));
}

export function toStlAscii(bp: Blueprint, tris = buildMesh(bp)) {
  const name = (bp.name || "anvil").replace(/[^\w.-]+/g, "_").slice(0, 40);
  const lines = [`solid ${name}`];
  for (const t of tris) {
    lines.push(`  facet normal ${t.n[0]} ${t.n[1]} ${t.n[2]}`);
    lines.push("    outer loop");
    lines.push(`      vertex ${t.a[0]} ${t.a[1]} ${t.a[2]}`);
    lines.push(`      vertex ${t.b[0]} ${t.b[1]} ${t.b[2]}`);
    lines.push(`      vertex ${t.c[0]} ${t.c[1]} ${t.c[2]}`);
    lines.push("    endloop");
    lines.push("  endfacet");
  }
  lines.push(`endsolid ${name}`);
  return lines.join("\n");
}

export function toObj(bp: Blueprint, tris = buildMesh(bp)) {
  const verts: string[] = [];
  const faces: string[] = [];
  let i = 1;
  for (const t of tris) {
    verts.push(`v ${t.a[0]} ${t.a[1]} ${t.a[2]}`);
    verts.push(`v ${t.b[0]} ${t.b[1]} ${t.b[2]}`);
    verts.push(`v ${t.c[0]} ${t.c[1]} ${t.c[2]}`);
    faces.push(`f ${i} ${i + 1} ${i + 2}`);
    i += 3;
  }
  return [`# ANVIL ${bp.name}`, ...verts, ...faces].join("\n");
}

export function exportMesh(bp: Blueprint, format: "stl" | "obj" = "stl") {
  const tris = buildMesh(bp);
  const ascii = format === "obj" ? toObj(bp, tris) : toStlAscii(bp, tris);
  const dir = anvilDir("anvil-exports");
  mkdirSync(dir, { recursive: true });
  const ext = format === "obj" ? ".obj" : ".stl";
  const file = `${(bp.id || "anvil").replace(/[^\w.-]+/g, "_")}${ext}`;
  const path = join(dir, file);
  writeFileSync(path, ascii, "utf8");
  return {
    ok: true,
    format,
    triangles: tris.length,
    bytes: Buffer.byteLength(ascii),
    file,
    path,
    url: "/api/anvil/mesh." + format,
    units: "mm",
    ascii,
  };
}

export function meshMeta(bp: Blueprint) {
  const tris = buildMesh(bp);
  return { triangles: tris.length, units: "mm", format: "stl", domain: bp.domain };
}
