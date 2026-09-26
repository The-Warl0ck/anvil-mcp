/** Texture packs ANVIL can assign to a bench. Stable pack ids for interior and exterior looks. */
export const TEXTURE_PACKS = [
  { id: "office", label: "Futuristic office", blurb: "Concrete · glass · aluminum", tags: ["office", "desk"] },
  { id: "boardroom", label: "Executive boardroom", blurb: "Carpet · marble · dark glass", tags: ["meeting", "pitch"] },
  { id: "executive", label: "Executive suite", blurb: "Walnut · leather · marble", tags: ["vip", "lounge"] },
  { id: "corp", label: "Corporate tower", blurb: "Curtain wall · lobby", tags: ["hq", "lobby"] },
  { id: "lab", label: "Clean lab", blurb: "Frosted glass · benches", tags: ["lab", "clinic"] },
  { id: "cozy", label: "Cozy interior", blurb: "Walnut · warm fabric", tags: ["cabin", "loft"] },
  { id: "forest", label: "Forest / wood", blurb: "Timber · soil", tags: ["cabin", "nature"] },
  { id: "ops", label: "Ops / cyber", blurb: "Metal · neon", tags: ["command"] },
  { id: "resonance", label: "Resonance hub", blurb: "Indigo neural", tags: ["cast"] },
  { id: "forge", label: "Foundry", blurb: "Metal · heat", tags: ["industrial"] },
  { id: "scifi", label: "Sci-fi corridor", blurb: "Panels · holos", tags: ["ship"] },
  { id: "void", label: "Void / crystal", blurb: "Dark stone", tags: ["void"] },
  { id: "sacred", label: "Sacred hall", blurb: "Stone · gold", tags: ["temple"] },
  { id: "plaza", label: "Night plaza", blurb: "Wet stone · colonnade", tags: ["plaza"] },
] as const;

export type PackId = (typeof TEXTURE_PACKS)[number]["id"];

export function listPacks() {
  return TEXTURE_PACKS.map((p) => ({ ...p }));
}

export function inferPack(text: string): string {
  const t = String(text || "").toLowerCase();
  let best = "";
  let score = 0;
  for (const p of TEXTURE_PACKS) {
    let s = 0;
    if (t.includes(p.id)) s += 24;
    if (p.tags.some((tag) => t.includes(tag))) s += 8;
    if (s >= score && s > 0) {
      score = s;
      best = p.id;
    }
  }
  if (score > 0) return best;
  if (/cabin|loft|apartment|home|warm/.test(t)) return "cozy";
  if (/gallery|museum|hall/.test(t)) return "sacred";
  if (/office|meeting|desk/.test(t)) return "office";
  return "office";
}

export function packAbsorbs(pack: string) {
  if (pack === "cozy" || pack === "forest" || pack === "boardroom") return 0.55;
  if (pack === "lab" || pack === "corp" || pack === "scifi") return 0.22;
  if (pack === "sacred" || pack === "void") return 0.18;
  return 0.35;
}
