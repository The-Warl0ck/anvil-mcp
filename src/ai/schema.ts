import type { Blueprint, Domain, LabEdge, LabNode } from "../sim/types.ts";
import { uid } from "../lib/utils.ts";

export const BLUEPRINT_SCHEMA = `{
  "name": string,
  "domain": "silicon" | "cellular" | "quantum" | "neural" | "mechanical" | "chemistry" | "architecture" | "metallurgy" | "robotics" | "machines",
  "skin": { "pack": string, "assets"?: [{ "id": string, "role": "floor"|"wall"|"art"|"prop"|"fabric" }] },
  "description": string,
  "notes": string,
  "scale": number,
  "nodes": [{ "id": string, "kind": string, "label": string, "x": 0-100, "y": 0-100, "z": number, "params": Record<string, number> }],
  "edges": [{ "id": string, "from": string, "to": string, "kind": string, "params": Record<string, number> }]
}

Valid node kinds:
- silicon: inverter, pad, tap, resistor
- cellular: membrane, nucleus, mitochondrion, channel, organelle
- quantum: well, barrier, source, qubit
- neural: soma
- mechanical: anchor, joint, mass
- chemistry: species, reaction, reactor
- architecture: room, foyer, studio, gallery
- metallurgy: melt, Fe, C, Cr, Ni, Al, Si, Cu, Ti, element
- robotics: base, joint, ee
- machines: crank, piston, rod, gear, part, shaft

Valid edge kinds: trace, rail, load, cytosol, tunnel, synapse, beam, reactant, product, door, mix, link, rod, mesh, shaft.

Prefer 6–14 nodes. Coordinates in 0–100 schematic space. Numeric params a solver can integrate.`;

const DOMAINS: Domain[] = ["silicon", "cellular", "quantum", "neural", "mechanical", "chemistry", "architecture", "metallurgy", "robotics", "machines"];

export function extractJson(text: string): Record<string, unknown> | null {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function normalizeBlueprint(raw: Record<string, unknown>, fallback: Domain): Blueprint {
  const domain = DOMAINS.includes(raw.domain as Domain) ? (raw.domain as Domain) : fallback;
  const nodes = Array.isArray(raw.nodes) ? (raw.nodes as LabNode[]) : [];
  const edges = Array.isArray(raw.edges) ? (raw.edges as LabEdge[]) : [];
  const seen = new Set<string>();
  const cleanNodes: LabNode[] = nodes.slice(0, 24).map((n, i) => {
    let id = String(n.id ?? `n${i}`).replace(/[^\w-]/g, "") || `n${i}`;
    if (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    return {
      id,
      kind: String(n.kind ?? defaultKind(domain)),
      label: String(n.label ?? `N${i + 1}`).slice(0, 32),
      x: clampNum(n.x, 8, 92, 20 + (i % 5) * 16),
      y: clampNum(n.y, 8, 92, 24 + Math.floor(i / 5) * 22),
      z: Number.isFinite(Number(n.z)) ? Number(n.z) : 0,
      params: toNumMap(n.params),
    };
  });
  const ids = new Set(cleanNodes.map((n) => n.id));
  const cleanEdges: LabEdge[] = edges
    .filter((e) => ids.has(String(e.from)) && ids.has(String(e.to)))
    .slice(0, 40)
    .map((e, i) => ({
      id: String(e.id ?? `e${i}`),
      from: String(e.from),
      to: String(e.to),
      kind: String(e.kind ?? defaultEdge(domain)),
      params: toNumMap(e.params),
    }));

  return {
    id: uid("ai"),
    name: String(raw.name ?? "Forged bench").slice(0, 64),
    domain,
    description: String(raw.description ?? "Mapped from intent.").slice(0, 400),
    notes: String(raw.notes ?? "").slice(0, 400),
    scale: Number(raw.scale) > 0 ? Number(raw.scale) : defaultScale(domain),
    nodes: cleanNodes,
    edges: cleanEdges,
    skin: raw.skin && typeof raw.skin === "object"
      ? {
          pack: String((raw.skin as { pack?: string }).pack || "office"),
          assets: Array.isArray((raw.skin as { assets?: unknown }).assets)
            ? ((raw.skin as { assets: { id: string; role: string }[] }).assets).map((a) => ({
                id: String(a.id),
                role: (a.role === "wall" || a.role === "art" || a.role === "prop" || a.role === "fabric" ? a.role : "floor") as "floor" | "wall" | "art" | "prop" | "fabric",
              }))
            : undefined,
        }
      : undefined,
  };
}

export function defaultKind(domain: Domain) {
  if (domain === "silicon") return "inverter";
  if (domain === "cellular") return "organelle";
  if (domain === "quantum") return "well";
  if (domain === "neural") return "soma";
  if (domain === "chemistry") return "species";
  if (domain === "architecture") return "room";
  if (domain === "metallurgy") return "Fe";
  if (domain === "robotics") return "joint";
  if (domain === "machines") return "part";
  if (domain === "optics") return "gnomon";
  if (domain === "sky") return "sky";
  return "joint";
}

export function defaultEdge(domain: Domain) {
  if (domain === "silicon") return "trace";
  if (domain === "neural") return "synapse";
  if (domain === "mechanical") return "beam";
  if (domain === "quantum") return "tunnel";
  if (domain === "chemistry") return "reactant";
  if (domain === "architecture") return "door";
  if (domain === "metallurgy") return "mix";
  if (domain === "robotics") return "link";
  if (domain === "machines") return "shaft";
  return "cytosol";
}

export function defaultScale(domain: Domain) {
  if (domain === "silicon") return 2e-7;
  if (domain === "cellular") return 1e-6;
  if (domain === "quantum") return 1e-9;
  if (domain === "neural") return 5e-5;
  if (domain === "chemistry") return 1;
  if (domain === "architecture") return 0.45;
  if (domain === "metallurgy") return 1;
  if (domain === "robotics") return 0.01;
  if (domain === "machines") return 0.001;
  return 2e-6;
}

function toNumMap(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const n = Number(val);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

function clampNum(v: unknown, lo: number, hi: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}
