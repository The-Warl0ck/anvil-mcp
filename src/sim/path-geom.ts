/** Path / polyline geometry for mapping arbitrary drawings onto a net. */

export interface Pt {
  x: number;
  y: number;
}

const EPS = 1e-9;

export function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function pathLength(pts: Pt[]) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

export function densify(pts: Pt[], maxSeg = 3.2): Pt[] {
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const d = dist(a, b);
    const n = Math.max(1, Math.ceil(d / maxSeg));
    for (let k = 1; k <= n; k++) out.push(lerpPt(a, b, k / n));
  }
  return out;
}

export function bbox(pts: Pt[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 100, maxY: 100, w: 100, h: 100 };
  return { minX, minY, maxX, maxY, w: Math.max(1e-6, maxX - minX), h: Math.max(1e-6, maxY - minY) };
}

/** Fit points into 8–92 schematic space, keeping aspect. */
export function normalizeToSchematic(pts: Pt[], pad = 10): Pt[] {
  if (!pts.length) return [];
  const b = bbox(pts);
  const span = Math.max(b.w, b.h);
  const usable = 100 - pad * 2;
  const s = usable / span;
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  return pts.map((p) => ({
    x: 50 + (p.x - cx) * s,
    y: 50 + (p.y - cy) * s,
  }));
}

export function isClosed(pts: Pt[], eps = 2.4) {
  return pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < eps;
}

/** Segment intersection in open interval (0,1) — skips shared endpoints. */
export function segIntersect(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < EPS) return null;
  const qp = { x: c.x - a.x, y: c.y - a.y };
  const t = (qp.x * s.y - qp.y * s.x) / den;
  const u = (qp.x * r.y - qp.y * r.x) / den;
  if (t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98) return lerpPt(a, b, t);
  return null;
}

export function clusterPoints(pts: Pt[], eps = 1.65): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const hit = out.find((q) => dist(p, q) <= eps);
    if (hit) {
      hit.x = (hit.x + p.x) / 2;
      hit.y = (hit.y + p.y) / 2;
    } else out.push({ ...p });
  }
  return out;
}

export function nearestIndex(pts: Pt[], p: Pt) {
  let best = 0;
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dd = dist(pts[i], p);
    if (dd < d) {
      d = dd;
      best = i;
    }
  }
  return { i: best, d };
}

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return {
    x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + tt * t * p3.x,
    y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + tt * t * p3.y,
  };
}

function quad(p0: Pt, p1: Pt, p2: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
}

function tokenizePath(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|([+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    if (m[1]) out.push(m[1]);
    else out.push(Number(m[2]));
  }
  return out;
}

function arcToPoints(p0: Pt, rx: number, ry: number, phiDeg: number, fa: number, fs: number, p1: Pt): Pt[] {
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx < 1e-6 || ry < 1e-6) return [p1];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (p0.x - p1.x) / 2;
  const dy = (p0.y - p1.y) / 2;
  let x1 = cos * dx + sin * dy;
  let y1 = -sin * dx + cos * dy;
  let rx2 = rx * rx;
  let ry2 = ry * ry;
  const x12 = x1 * x1;
  const y12 = y1 * y1;
  let lam = x12 / rx2 + y12 / ry2;
  if (lam > 1) {
    const s = Math.sqrt(lam);
    rx *= s;
    ry *= s;
    rx2 = rx * rx;
    ry2 = ry * ry;
  }
  const sign = fa === fs ? -1 : 1;
  let num = rx2 * ry2 - rx2 * y12 - ry2 * x12;
  const den = rx2 * y12 + ry2 * x12;
  num = Math.max(0, num);
  const coef = den < EPS ? 0 : sign * Math.sqrt(num / den);
  const cx1 = coef * ((rx * y1) / ry);
  const cy1 = coef * (-(ry * x1) / rx);
  const cx = cos * cx1 - sin * cy1 + (p0.x + p1.x) / 2;
  const cy = sin * cx1 + cos * cy1 + (p0.y + p1.y) / 2;
  const ux = (x1 - cx1) / rx;
  const uy = (y1 - cy1) / ry;
  const vx = (-x1 - cx1) / rx;
  const vy = (-y1 - cy1) / ry;
  const start = Math.atan2(uy, ux);
  let dth = Math.atan2(uy * vx - ux * vy, ux * vx + uy * vy);
  if (!fs && dth > 0) dth -= 2 * Math.PI;
  if (fs && dth < 0) dth += 2 * Math.PI;
  const steps = Math.max(6, Math.min(48, Math.ceil(Math.abs(dth) / 0.18)));
  const pts: Pt[] = [];
  for (let i = 1; i <= steps; i++) {
    const a = start + (dth * i) / steps;
    const x = rx * Math.cos(a);
    const y = ry * Math.sin(a);
    pts.push({ x: cos * x - sin * y + cx, y: sin * x + cos * y + cy });
  }
  return pts;
}

/** Parse SVG path `d` into subpaths of sampled points. */
export function parsePathD(d: string, samples = 12): Pt[][] {
  const tok = tokenizePath(d);
  const sub: Pt[][] = [];
  let cur: Pt[] = [];
  let i = 0;
  let cmd = "M";
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cx = 0;
  let cy = 0;
  let qx = 0;
  let qy = 0;
  let prev = "";

  const push = (p: Pt) => {
    x = p.x;
    y = p.y;
    cur.push({ x, y });
  };

  while (i < tok.length) {
    const t = tok[i];
    if (typeof t === "string") {
      cmd = t;
      i += 1;
    }
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();

    if (C === "Z") {
      cur.push({ x: sx, y: sy });
      x = sx;
      y = sy;
      if (cur.length) sub.push(cur);
      cur = [];
      prev = "Z";
      continue;
    }
    if (C === "M") {
      if (cur.length) sub.push(cur);
      cur = [];
      const nx = Number(tok[i++]);
      const ny = Number(tok[i++]);
      x = rel ? x + nx : nx;
      y = rel ? y + ny : ny;
      sx = x;
      sy = y;
      cur.push({ x, y });
      cmd = rel ? "l" : "L";
      prev = "M";
      continue;
    }
    if (C === "L") {
      const nx = Number(tok[i++]);
      const ny = Number(tok[i++]);
      push({ x: rel ? x + nx : nx, y: rel ? y + ny : ny });
      prev = "L";
      continue;
    }
    if (C === "H") {
      const nx = Number(tok[i++]);
      push({ x: rel ? x + nx : nx, y });
      prev = "H";
      continue;
    }
    if (C === "V") {
      const ny = Number(tok[i++]);
      push({ x, y: rel ? y + ny : ny });
      prev = "V";
      continue;
    }
    if (C === "C") {
      const x1 = Number(tok[i++]);
      const y1 = Number(tok[i++]);
      const x2 = Number(tok[i++]);
      const y2 = Number(tok[i++]);
      const x3 = Number(tok[i++]);
      const y3 = Number(tok[i++]);
      const p1 = { x: rel ? x + x1 : x1, y: rel ? y + y1 : y1 };
      const p2 = { x: rel ? x + x2 : x2, y: rel ? y + y2 : y2 };
      const p3 = { x: rel ? x + x3 : x3, y: rel ? y + y3 : y3 };
      const p0 = { x, y };
      for (let s = 1; s <= samples; s++) push(cubic(p0, p1, p2, p3, s / samples));
      cx = p2.x;
      cy = p2.y;
      prev = "C";
      continue;
    }
    if (C === "S") {
      const x2 = Number(tok[i++]);
      const y2 = Number(tok[i++]);
      const x3 = Number(tok[i++]);
      const y3 = Number(tok[i++]);
      const p1 = prev === "C" || prev === "S" ? { x: 2 * x - cx, y: 2 * y - cy } : { x, y };
      const p2 = { x: rel ? x + x2 : x2, y: rel ? y + y2 : y2 };
      const p3 = { x: rel ? x + x3 : x3, y: rel ? y + y3 : y3 };
      const p0 = { x, y };
      for (let s = 1; s <= samples; s++) push(cubic(p0, p1, p2, p3, s / samples));
      cx = p2.x;
      cy = p2.y;
      prev = "S";
      continue;
    }
    if (C === "Q") {
      const x1 = Number(tok[i++]);
      const y1 = Number(tok[i++]);
      const x2 = Number(tok[i++]);
      const y2 = Number(tok[i++]);
      const p1 = { x: rel ? x + x1 : x1, y: rel ? y + y1 : y1 };
      const p2 = { x: rel ? x + x2 : x2, y: rel ? y + y2 : y2 };
      const p0 = { x, y };
      for (let s = 1; s <= samples; s++) push(quad(p0, p1, p2, s / samples));
      qx = p1.x;
      qy = p1.y;
      prev = "Q";
      continue;
    }
    if (C === "T") {
      const x2 = Number(tok[i++]);
      const y2 = Number(tok[i++]);
      const p1 = prev === "Q" || prev === "T" ? { x: 2 * x - qx, y: 2 * y - qy } : { x, y };
      const p2 = { x: rel ? x + x2 : x2, y: rel ? y + y2 : y2 };
      const p0 = { x, y };
      for (let s = 1; s <= samples; s++) push(quad(p0, p1, p2, s / samples));
      qx = p1.x;
      qy = p1.y;
      prev = "T";
      continue;
    }
    if (C === "A") {
      const rx = Number(tok[i++]);
      const ry = Number(tok[i++]);
      const phi = Number(tok[i++]);
      const fa = Number(tok[i++]);
      const fs = Number(tok[i++]);
      const x2 = Number(tok[i++]);
      const y2 = Number(tok[i++]);
      const p1 = { x: rel ? x + x2 : x2, y: rel ? y + y2 : y2 };
      const extra = arcToPoints({ x, y }, rx, ry, phi, fa, fs, p1);
      for (const p of extra) push(p);
      prev = "A";
      continue;
    }
    i += 1;
  }
  if (cur.length) sub.push(cur);
  return sub.filter((s) => s.length >= 2);
}

export function parsePolylinePoints(attr: string): Pt[] {
  const nums = attr
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

/** Pull drawable geometry out of SVG markup without a DOM. */
export function extractSvgPolylines(svg: string): Pt[][] {
  const paths: Pt[][] = [];
  const pathRe = /<path\b[^>]*?\sd=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(svg))) {
    paths.push(...parsePathD(m[1]));
  }
  const polyRe = /<polyline\b[^>]*?\spoints=["']([^"']+)["'][^>]*>/gi;
  while ((m = polyRe.exec(svg))) {
    const pts = parsePolylinePoints(m[1]);
    if (pts.length >= 2) paths.push(pts);
  }
  const polygonRe = /<polygon\b[^>]*?\spoints=["']([^"']+)["'][^>]*>/gi;
  while ((m = polygonRe.exec(svg))) {
    const pts = parsePolylinePoints(m[1]);
    if (pts.length >= 2) {
      pts.push({ ...pts[0] });
      paths.push(pts);
    }
  }
  const lineRe = /<line\b([^>]*)>/gi;
  while ((m = lineRe.exec(svg))) {
    const tag = m[1];
    const num = (k: string) => {
      const hit = tag.match(new RegExp(`\\b${k}=["']?([\\d.+-eE]+)`));
      return hit ? Number(hit[1]) : 0;
    };
    paths.push([
      { x: num("x1"), y: num("y1") },
      { x: num("x2"), y: num("y2") },
    ]);
  }
  return paths.filter((p) => p.length >= 2);
}

export function hash32(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
