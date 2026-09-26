import { clamp } from "../../lib/utils.ts";
import { packAbsorbs } from "../textures.ts";
import type { Blueprint, ProofMetric, SeriesKey, SimSnapshot, Solver } from "../types.ts";

function isSpace(kind: string) {
  return kind === "room" || kind === "foyer" || kind === "gallery" || kind === "studio";
}

function areaOf(n: { params: Record<string, number> }) {
  if (n.params.area > 0) return n.params.area;
  if (n.params.w > 0 && n.params.d > 0) return n.params.w * n.params.d;
  return 24;
}

/**
 * Interior / plan sandbox.
 * Occupancy diffuses through doors (circulation), lights and people dump heat,
 * windows set daylight. Proof is density, egress, daylight, furniture clearance.
 */
export class ArchitectureSolver implements Solver {
  domain = "architecture" as const;
  recommendedDt = 0.08;
  realPerWall = 12;
  bp!: Blueprint;
  t = 0;
  n = new Map<string, number>();
  heat = new Map<string, number>();
  lux = new Map<string, number>();
  flow = new Map<string, number>();

  reset(bp: Blueprint) {
    this.bp = bp;
    this.t = 0;
    this.n.clear();
    this.heat.clear();
    this.lux.clear();
    this.flow.clear();
    for (const node of bp.nodes) {
      if (!isSpace(node.kind)) continue;
      this.n.set(node.id, Math.max(0, node.params.people ?? (node.kind === "foyer" ? 2 : 4)));
      this.heat.set(node.id, 22);
      const a = areaOf(node);
      this.lux.set(node.id, ((node.params.windows ?? 1) * 420) / Math.max(a, 8));
    }
  }

  step(dt: number) {
    const dn = new Map<string, number>();
    for (const e of this.bp.edges) {
      if (e.kind === "in") continue;
      const a = this.bp.nodes.find((n) => n.id === e.from);
      const b = this.bp.nodes.find((n) => n.id === e.to);
      if (!a || !b || !isSpace(a.kind) || !isSpace(b.kind)) continue;
      const aa = areaOf(a);
      const ab = areaOf(b);
      const da = (this.n.get(a.id) ?? 0) / aa;
      const db = (this.n.get(b.id) ?? 0) / ab;
      const w = Math.max(0.8, e.params.width ?? 1.1);
      const i = (da - db) * w * 2.4;
      this.flow.set(e.id, i);
      dn.set(a.id, (dn.get(a.id) ?? 0) - i);
      dn.set(b.id, (dn.get(b.id) ?? 0) + i);
    }
    for (const node of this.bp.nodes) {
      if (!isSpace(node.kind)) continue;
      const next = Math.max(0, (this.n.get(node.id) ?? 0) + (dn.get(node.id) ?? 0) * dt);
      this.n.set(node.id, next);
      const a = areaOf(node);
      const lights = node.params.lights ?? 2;
      const q = next * 100 + lights * 12;
      const T = this.heat.get(node.id) ?? 22;
      const pack = this.bp.skin?.pack || "office";
      const leak = 8 + packAbsorbs(pack) * 6;
      this.heat.set(node.id, clamp(T + ((q / Math.max(a, 8) - leak * (T - 21)) * dt) / 40, 16, 38));
      this.lux.set(node.id, ((node.params.windows ?? 1) * 420) / Math.max(a, 8));
    }
    this.t += dt;
  }

  snapshot(): SimSnapshot {
    const nodeValues: Record<string, number> = {};
    const nodeHeat: Record<string, number> = {};
    const edgeValues: Record<string, number> = {};
    for (const n of this.bp.nodes) {
      nodeValues[n.id] = isSpace(n.kind) ? this.n.get(n.id) ?? 0 : n.params.desks ?? 0;
      nodeHeat[n.id] = Math.max(0, (this.heat.get(n.id) ?? 22) - 21);
    }
    for (const e of this.bp.edges) edgeValues[e.id] = this.flow.get(e.id) ?? 0;
    const rooms = this.bp.nodes.filter((n) => isSpace(n.kind));
    const dens = rooms.map((n) => (this.n.get(n.id) ?? 0) / areaOf(n));
    return {
      time: this.t,
      nodeValues,
      nodeHeat,
      edgeValues,
      extra: {
        people: rooms.reduce((s, n) => s + (this.n.get(n.id) ?? 0), 0),
        tmax: Math.max(0, ...rooms.map((n) => (this.heat.get(n.id) ?? 22) - 21)),
        density: dens.length ? dens.reduce((a, b) => a + b, 0) / dens.length : 0,
        lux: rooms.reduce((s, n) => s + (this.lux.get(n.id) ?? 0), 0) / Math.max(rooms.length, 1),
      },
    };
  }

  series(): SeriesKey[] {
    return this.bp.nodes
      .filter((n) => isSpace(n.kind))
      .slice(0, 6)
      .map((n) => ({ key: n.id, label: n.label }));
  }

  proof(): ProofMetric[] {
    const rooms = this.bp.nodes.filter((n) => isSpace(n.kind));
    const exits = rooms.filter((n) => n.kind === "foyer" || n.params.exit === 1);
    const dens = rooms.map((n) => (this.n.get(n.id) ?? 0) / areaOf(n));
    const peak = dens.length ? Math.max(...dens) : 0;
    const hops = this.egressHops(rooms, exits);
    const dead = rooms.filter((n) => {
      const deg = this.bp.edges.filter((e) => e.kind !== "in" && (e.from === n.id || e.to === n.id)).length;
      return n.kind !== "foyer" && deg < 2;
    }).length;
    const furniture = rooms.reduce((s, n) => s + (n.params.desks ?? 0) * 2.2 + (n.params.chairs ?? 0) * 0.6, 0);
    const floor = rooms.reduce((s, n) => s + areaOf(n), 0);
    const fill = floor > 0 ? furniture / floor : 0;
    const lux = rooms.reduce((s, n) => s + (this.lux.get(n.id) ?? 0), 0) / Math.max(rooms.length, 1);
    const tmax = Math.max(0, ...rooms.map((n) => this.heat.get(n.id) ?? 22));
    const pack = this.bp.skin?.pack || "office";
    return [
      {
        id: "density",
        label: "Peak density",
        value: peak,
        unit: "/m²",
        status: peak > 0.35 ? "fail" : peak > 0.22 ? "warn" : "pass",
        limit: 0.22,
        note: "people per floor area after circulation",
      },
      {
        id: "egress",
        label: "Egress hops",
        value: hops,
        unit: "doors",
        status: hops > 4 ? "fail" : hops > 3 ? "warn" : "pass",
        limit: 3,
        note: exits.length ? "longest walk to a foyer/exit" : "no foyer marked — add one",
      },
      {
        id: "dead",
        label: "Dead-end rooms",
        value: dead,
        unit: "",
        status: dead > 2 ? "fail" : dead > 0 ? "warn" : "pass",
        note: "rooms with a single door",
      },
      {
        id: "day",
        label: "Mean daylight",
        value: lux,
        unit: "lux/m²",
        status: lux < 8 ? "fail" : lux < 14 ? "warn" : "pass",
        limit: 14,
        note: "windows × 420 / area",
      },
      {
        id: "fill",
        label: "Furniture fill",
        value: fill * 100,
        unit: "%",
        status: fill > 0.45 ? "fail" : fill > 0.32 ? "warn" : "pass",
        limit: 32,
        note: "desk+chair footprint vs floor",
      },
      {
        id: "tj",
        label: "Peak room T",
        value: tmax,
        unit: "°C",
        status: tmax > 28 ? "fail" : tmax > 26 ? "warn" : "pass",
        limit: 26,
        note: "people + lights, pack absorption " + pack,
      },
    ];
  }

  private egressHops(rooms: Blueprint["nodes"], exits: Blueprint["nodes"]) {
    if (!rooms.length) return 0;
    if (!exits.length) return rooms.length;
    const ids = new Set(rooms.map((n) => n.id));
    const adj = new Map<string, string[]>();
    for (const id of ids) adj.set(id, []);
    for (const e of this.bp.edges) {
      if (e.kind === "in") continue;
      if (!ids.has(e.from) || !ids.has(e.to)) continue;
      adj.get(e.from)?.push(e.to);
      adj.get(e.to)?.push(e.from);
    }
    const dist = new Map<string, number>();
    const q = exits.map((e) => e.id);
    q.forEach((id) => dist.set(id, 0));
    while (q.length) {
      const cur = q.shift()!;
      const d = dist.get(cur) ?? 0;
      for (const nxt of adj.get(cur) || []) {
        if (dist.has(nxt)) continue;
        dist.set(nxt, d + 1);
        q.push(nxt);
      }
    }
    let max = 0;
    for (const n of rooms) max = Math.max(max, dist.get(n.id) ?? rooms.length);
    return max;
  }
}
