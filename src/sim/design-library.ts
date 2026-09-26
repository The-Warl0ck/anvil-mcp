import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { anvilDir } from "../lib/utils.ts";
import type { Blueprint } from "./types.ts";

const DIR = anvilDir("anvil-designs");

export interface SavedDesign {
  id: string;
  name: string;
  domain: string;
  description: string;
  updatedAt: string;
  createdAt: string;
  blueprint: Blueprint;
}

function ensure() {
  mkdirSync(DIR, { recursive: true });
}

function pathFor(id: string) {
  return join(DIR, id.replace(/[^a-zA-Z0-9._-]/g, "_") + ".json");
}

export function listDesigns(): SavedDesign[] {
  try {
    ensure();
    return readdirSync(DIR)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(join(DIR, f), "utf8")) as SavedDesign;
        } catch {
          return null;
        }
      })
      .filter((x): x is SavedDesign => !!x && !!x.blueprint)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  } catch {
    return [];
  }
}

export function getDesign(id: string): SavedDesign | null {
  const p = pathFor(id);
  if (!existsSync(p)) {
    const hit = listDesigns().find((d) => d.id === id || d.name.toLowerCase() === id.toLowerCase());
    return hit || null;
  }
  try {
    return JSON.parse(readFileSync(p, "utf8")) as SavedDesign;
  } catch {
    return null;
  }
}

export function saveDesign(bp: Blueprint, extra?: { id?: string; name?: string; description?: string }): SavedDesign {
  ensure();
  const id = extra?.id || bp.id || "d_" + Date.now().toString(36);
  const prev = getDesign(id);
  const rec: SavedDesign = {
    id,
    name: extra?.name || bp.name || "Untitled",
    domain: bp.domain,
    description: extra?.description || bp.description || "",
    createdAt: prev?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    blueprint: { ...bp, id, name: extra?.name || bp.name },
  };
  writeFileSync(pathFor(id), JSON.stringify(rec, null, 2), "utf8");
  return rec;
}

export function updateDesign(id: string, patch: { name?: string; description?: string; blueprint?: Blueprint }): SavedDesign {
  const prev = getDesign(id);
  if (!prev) throw new Error("Design not found: " + id);
  const bp = patch.blueprint ? { ...patch.blueprint, id } : prev.blueprint;
  if (patch.name) bp.name = patch.name;
  if (patch.description != null) bp.description = patch.description;
  return saveDesign(bp, { id, name: bp.name, description: bp.description });
}

export function deleteDesign(id: string) {
  const rec = getDesign(id);
  if (!rec) return { ok: false, error: "not found" };
  try {
    unlinkSync(pathFor(rec.id));
  } catch {
    /* ignore */
  }
  return { ok: true, id: rec.id };
}
