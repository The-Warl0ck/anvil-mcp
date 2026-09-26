import type { Blueprint, LabEdge } from "./types.ts";

export type Pt = { x: number; y: number };

const RHO_CU = 1.68e-8;
const T_M = 1e-7;

export function edgePoints(bp: Blueprint, edge: LabEdge): Pt[] {
  const a = bp.nodes.find((n) => n.id === edge.from);
  const b = bp.nodes.find((n) => n.id === edge.to);
  if (!a || !b) return [];
  const wps = edge.waypoints || [];
  return [{ x: a.x, y: a.y }, ...wps, { x: b.x, y: b.y }];
}

export function polyLength(pts: Pt[]): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
}

/** Deflection at each interior vertex, degrees. 0 = straight, 90 = right-angle. */
export function turnDegrees(pts: Pt[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const ax = pts[i - 1].x - pts[i].x;
    const ay = pts[i - 1].y - pts[i].y;
    const bx = pts[i + 1].x - pts[i].x;
    const by = pts[i + 1].y - pts[i].y;
    const la = Math.hypot(ax, ay) || 1e-9;
    const lb = Math.hypot(bx, by) || 1e-9;
    const cos = Math.min(1, Math.max(-1, (ax * bx + ay * by) / (la * lb)));
    const interior = (Math.acos(cos) * 180) / Math.PI;
    out.push(Math.max(0, 180 - interior));
  }
  return out;
}

/** Extra sheet-resistance squares from current crowding at corners. */
export function cornerSquares(turns: number[]): number {
  let s = 0;
  for (const t of turns) {
    const u = t / 90;
    s += 0.56 * u * u;
  }
  return s;
}

export function geometricR(lengthUnits: number, wNm: number, scale: number, squares: number): number {
  const L = Math.max(lengthUnits, 0.05) * (scale || 2e-7);
  const w = Math.max(wNm, 4) * 1e-9;
  const rLine = (RHO_CU * L) / (w * T_M);
  const rCorner = squares * (RHO_CU / T_M) * (1 / w);
  return Math.max(rLine + rCorner, 0.02);
}

export function measureEdge(bp: Blueprint, edge: LabEdge) {
  const pts = edgePoints(bp, edge);
  const turns = turnDegrees(pts);
  const length = polyLength(pts);
  const squares = cornerSquares(turns);
  const w = edge.params.w_nm ?? 40;
  return {
    pts,
    length,
    turns,
    maxTurn: turns.length ? Math.max(...turns) : 0,
    minTurn: turns.length ? Math.min(...turns) : 0,
    squares,
    R: geometricR(length, w, bp.scale, squares),
  };
}

export function applyGeometry(bp: Blueprint): Blueprint {
  if (!bp.edges?.length) return bp;
  return {
    ...bp,
    edges: bp.edges.map((e) => {
      if (e.kind === "rail") return e;
      const g = measureEdge(bp, e);
      const w = e.params.w_nm ?? (bp.domain === "silicon" ? 40 : e.params.w_nm);
      return {
        ...e,
        params: {
          ...e.params,
          ...(w != null ? { w_nm: w } : {}),
          L: g.length,
          bend: g.maxTurn,
          corners: g.squares,
          R: bp.domain === "silicon" || e.kind === "trace" ? g.R : e.params.R ?? g.R,
        },
      };
    }),
  };
}

/** Move interior waypoint i so the turn there becomes `turnDeg` (0 straight … 90 right). */
export function waypointForTurn(prev: Pt, next: Pt, turnDeg: number, side: number): Pt {
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const L = Math.hypot(dx, dy) || 1;
  const mx = (prev.x + next.x) / 2;
  const my = (prev.y + next.y) / 2;
  const px = -dy / L;
  const py = dx / L;
  const phi = Math.max(0, Math.min(140, turnDeg));
  const alpha = Math.max(8, 180 - phi);
  const h = L / 2 / Math.tan(((alpha / 2) * Math.PI) / 180);
  const sgn = side >= 0 ? 1 : -1;
  return { x: mx + px * h * sgn, y: my + py * h * sgn };
}

export function sideOf(prev: Pt, next: Pt, p: Pt): number {
  return (next.x - prev.x) * (p.y - prev.y) - (next.y - prev.y) * (p.x - prev.x);
}
