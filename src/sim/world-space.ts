import type { LabNode } from "./types.ts";

/** Orbit-camera schematic (matches the existing Viewport). */
export const ORBIT_SCALE = 0.078;
/** First-person walk / ROS rooms — same XY map, larger so a human fits. */
export const WALK_SCALE = 0.48;

export function nodeWorld(
  n: LabNode,
  scale = ORBIT_SCALE,
  amp = 0,
): [number, number, number] {
  if (scale === ORBIT_SCALE) {
    const lift = 0.32 + n.z * 0.55 + (n.kind === "pad" ? 0.08 : 0.2);
    return [(n.x - 50) * scale, lift + amp, (n.y - 50) * scale];
  }
  const y = 0.02 + n.z * 2.6;
  return [(n.x - 50) * scale, y + amp, (n.y - 50) * scale];
}

/** Inverse of orbit `nodeWorld` XZ — schematic 0–100, clamped. */
export function worldToSchematic(
  wx: number,
  wz: number,
  scale = ORBIT_SCALE,
): { x: number; y: number } {
  return {
    x: Math.max(1, Math.min(99, wx / scale + 50)),
    y: Math.max(1, Math.min(99, wz / scale + 50)),
  };
}

export function schematicToWalk(x: number, y: number, z = 0): [number, number, number] {
  return [(x - 50) * WALK_SCALE, z * 2.6, (y - 50) * WALK_SCALE];
}

export function walkRoomRadius(kind: string, node?: LabNode) {
  if (kind === "room" || kind === "foyer" || kind === "studio" || kind === "gallery") {
    const a = node?.params?.area || 24;
    return Math.max(2.2, Math.sqrt(a) * 0.42);
  }
  if (kind === "membrane") return 2.4;
  if (kind === "soma" || kind === "nucleus") return 1.55;
  if (kind === "inverter" || kind === "well") return 1.35;
  if (kind === "pad" || kind === "tap" || kind === "mass") return 1.15;
  return 1.05;
}
