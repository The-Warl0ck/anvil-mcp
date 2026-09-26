export type Domain =
  | "silicon"
  | "cellular"
  | "quantum"
  | "neural"
  | "mechanical"
  | "chemistry"
  | "architecture"
  | "metallurgy"
  | "robotics"
  | "machines"
  | "optics"
  | "sky";

export interface SkinAssetRef {
  id: string;
  role: "floor" | "wall" | "art" | "prop" | "fabric";
}

export interface BlueprintSkin {
  pack: string;
  assets?: SkinAssetRef[];
}

export type MetricStatus = "pass" | "warn" | "fail" | "info";

export interface LabNode {
  id: string;
  kind: string;
  label: string;
  x: number;
  y: number;
  z: number;
  params: Record<string, number>;
}

export interface LabEdge {
  id: string;
  from: string;
  to: string;
  kind: string;
  params: Record<string, number>;
  /** Interior corners on the schematic — turn angle is measured here. */
  waypoints?: { x: number; y: number }[];
}

export interface Blueprint {
  id: string;
  name: string;
  domain: Domain;
  description: string;
  nodes: LabNode[];
  edges: LabEdge[];
  /** meters per schematic unit (0–100 space) */
  scale: number;
  notes: string;
  /** Interior look — texture pack id + optional uploaded assets */
  skin?: BlueprintSkin;
}

export interface ProofMetric {
  id: string;
  label: string;
  value: number;
  unit: string;
  status: MetricStatus;
  limit?: number;
  note: string;
}

export interface TelemetryPoint {
  t: number;
  values: Record<string, number>;
}

export interface SeriesKey {
  key: string;
  label: string;
}

export interface SimSnapshot {
  time: number;
  nodeValues: Record<string, number>;
  nodeHeat: Record<string, number>;
  edgeValues: Record<string, number>;
  extra: Record<string, number>;
  wave?: { n: number; psiAbs: number[]; potential: number[] };
  field?: { nx: number; ny: number; values: number[] };
  bloch?: { x: number; y: number; z: number };
  pulses?: { edgeId: string; u: number }[];
}

export interface Solver {
  readonly domain: Domain;
  readonly recommendedDt: number;
  readonly realPerWall: number;
  reset(bp: Blueprint): void;
  step(dt: number): void;
  snapshot(): SimSnapshot;
  proof(): ProofMetric[];
  series(): SeriesKey[];
}

export const DOMAINS: { id: Domain; label: string; blurb: string }[] = [
  { id: "silicon", label: "Silicon", blurb: "Nets, delay, heat, electromigration" },
  { id: "cellular", label: "Cellular", blurb: "Membranes, ions, morphogens" },
  { id: "quantum", label: "Quantum", blurb: "Wells, tunneling, decoherence" },
  { id: "neural", label: "Neural", blurb: "Spikes, homology region flows, intent combos" },
  { id: "mechanical", label: "Mechanical", blurb: "Stress, modes, yield" },
  { id: "chemistry", label: "Chemistry", blurb: "Mass-action kinetics, ΔH, equilibrium" },
  { id: "architecture", label: "Architecture", blurb: "Plans, interiors, packs, circulation" },
  { id: "metallurgy", label: "Metallurgy", blurb: "Alloys, CE, melt, print window" },
  { id: "robotics", label: "Robotics", blurb: "Arms, torque, reach, payload" },
  { id: "machines", label: "Machines", blurb: "Engines, gears, printable parts" },
  { id: "optics", label: "Optics", blurb: "Geometry, gnomon, shadows, sundials" },
  { id: "sky", label: "Sky", blurb: "Live sun / Stellarium-style ephemeris" },
];
