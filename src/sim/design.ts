import type { Blueprint, ProofMetric } from "./types.ts";
import { exportMesh } from "./mesh.ts";
import { ELEMENTS, elementOf } from "./elements.ts";

export interface BomRow {
  id: string;
  kind: string;
  label: string;
  qty: number;
  mass_kg?: number;
  material?: string;
  note?: string;
}

function methods(domain: Blueprint["domain"]) {
  if (domain === "silicon") return "Modified nodal / inverter RC, Joule heating, Black’s EM MTTF.";
  if (domain === "mechanical") return "Lumped Euler–Bernoulli beam, M ü + C u̇ + K u = F, von Mises vs yield.";
  if (domain === "chemistry") return "Mass-action kinetics, Arrhenius k(T), energy balance ρCpV dT = −ΔH · rate.";
  if (domain === "architecture") return "Occupancy diffusion through doors, daylight = windows·420/area, egress BFS.";
  if (domain === "metallurgy") return "Mass-weighted ROM of handbook elements; IIW carbon equivalent; Al–Si LPBF window.";
  if (domain === "robotics") return "Planar serial FK, static gravity torques, PD toward qdes, actuator margin.";
  if (domain === "machines") return "Slider-crank kinematics + P·A gas load; Lewis tooth bending; FDM wall/overhang + 6FL/bt².";
  if (domain === "quantum") return "1D well / WKB-style tunneling proxies on the schematic.";
  if (domain === "neural") return "Izhikevich somas, delayed synapses.";
  if (domain === "cellular") return "FitzHugh–Nagumo / ion + morphogen field.";
  return "Domain solver on the live net.";
}

function assumptions(bp: Blueprint) {
  const lines = [
    "This is a first-principles / handbook workbench, not a certified FEA or CALPHAD run.",
    "PASS means the implemented model is within the stated limits — confirm with coupons, dyno, or lab before manufacture.",
    `Domain: ${bp.domain}. Scale: ${bp.scale}.`,
  ];
  if (bp.domain === "metallurgy") lines.push("Linear mixing of melting points is not a phase diagram.");
  if (bp.domain === "machines") lines.push("Engine gas load is a cosine pulse, not a measured indicator diagram. Gears omit AGMA K factors.");
  if (bp.domain === "robotics") lines.push("Planar arm, no collision world, no motor electrical model.");
  if (bp.domain === "mechanical") lines.push("MEMS print STLs are scaled up for handling; do not treat millimetres as wafer microns.");
  return lines;
}

function bom(bp: Blueprint): BomRow[] {
  return bp.nodes.map((n) => {
    let material: string | undefined;
    let mass: number | undefined;
    if (ELEMENTS[n.kind] || n.kind === "element") {
      const el = elementOf(n.kind, n.params.Z);
      material = el.label;
      mass = (n.params.wt ?? n.params.mass ?? 1) / 100;
    }
    if (n.params.m) mass = n.params.m;
    if (n.kind === "part") {
      const L = n.params.L ?? 0.06, b = n.params.b ?? 0.018, t = n.params.t ?? 0.004;
      mass = 1240 * L * b * t;
      material = material || "polymer (PLA-ish)";
    }
    return {
      id: n.id,
      kind: n.kind,
      label: n.label,
      qty: 1,
      mass_kg: mass,
      material,
      note: n.kind,
    };
  });
}

export function designPack(bp: Blueprint, metrics: ProofMetric[], verdict: string) {
  const mesh = exportMesh(bp, "stl");
  const rows = bom(bp);
  const report = [
    `ANVIL DESIGN PACK — ${bp.name}`,
    `Verdict: ${verdict}`,
    bp.description,
    "",
    "METHODS",
    methods(bp.domain),
    "",
    "ASSUMPTIONS",
    ...assumptions(bp).map((l) => "- " + l),
    "",
    "PROOF",
    ...metrics.map((m) => `${m.status.toUpperCase().padEnd(6)} ${m.label}: ${m.value} ${m.unit}${m.limit != null ? "  limit " + m.limit : ""}  — ${m.note}`),
    "",
    "BOM",
    ...rows.map((r) => `${r.id}\t${r.kind}\t${r.label}\tqty ${r.qty}${r.mass_kg != null ? "\t" + r.mass_kg + " kg" : ""}${r.material ? "\t" + r.material : ""}`),
    "",
    `MESH  ${mesh.triangles} triangles, units mm, ${mesh.file}`,
    bp.notes || "",
  ].join("\n");
  return {
    ok: true,
    verdict,
    name: bp.name,
    domain: bp.domain,
    methods: methods(bp.domain),
    assumptions: assumptions(bp),
    metrics,
    bom: rows,
    mesh: {
      format: "stl",
      triangles: mesh.triangles,
      bytes: mesh.bytes,
      units: "mm",
      url: mesh.url,
      file: mesh.file,
    },
    report,
    blueprint: { id: bp.id, name: bp.name, domain: bp.domain, nodes: bp.nodes.length, edges: bp.edges.length },
    note: "STL is millimetres, origin at schematic centre. Print only after a PASS you accept — this is a workbench confirmation, not a stamp.",
  };
}
