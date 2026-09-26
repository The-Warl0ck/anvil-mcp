import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { anvilDir } from "../lib/utils.ts";
import { uid } from "../lib/utils.ts";

export interface AnvilAsset {
  id: string;
  name: string;
  role: "floor" | "wall" | "art" | "prop" | "fabric";
  file: string;
  mime: string;
  bytes: number;
  createdAt: string;
}

const DIR = anvilDir("anvil-assets");
const INDEX = join(DIR, "index.json");

function ensure() {
  mkdirSync(DIR, { recursive: true });
}

function loadIndex(): AnvilAsset[] {
  ensure();
  try {
    if (existsSync(INDEX)) {
      const j = JSON.parse(readFileSync(INDEX, "utf8"));
      if (Array.isArray(j)) return j as AnvilAsset[];
    }
  } catch {
    /* ignore */
  }
  return [];
}

function saveIndex(rows: AnvilAsset[]) {
  ensure();
  writeFileSync(INDEX, JSON.stringify(rows, null, 2), "utf8");
}

export function listAssets() {
  return loadIndex().map((a) => ({
    ...a,
    url: "/api/anvil/assets/" + encodeURIComponent(a.id) + "/file",
  }));
}

export function saveAsset(body: {
  name?: string;
  role?: AnvilAsset["role"];
  dataUrl?: string;
  base64?: string;
  mime?: string;
}) {
  ensure();
  const data = String(body.dataUrl || body.base64 || "");
  let buf: Buffer | null = null;
  let mime = body.mime || "image/png";
  if (data.includes("base64,")) {
    const m = data.match(/^data:([^;]+);base64,/);
    if (m) mime = m[1];
    buf = Buffer.from(data.split("base64,")[1], "base64");
  } else if (data.length > 80) {
    buf = Buffer.from(data, "base64");
  }
  if (!buf || !buf.length) {
    const err = new Error("dataUrl / base64 required");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }
  const id = uid("tex");
  const ext = /webp/.test(mime) ? ".webp" : /jpeg|jpg/.test(mime) ? ".jpg" : ".png";
  const file = id + ext;
  writeFileSync(join(DIR, file), buf);
  const rec: AnvilAsset = {
    id,
    name: String(body.name || "texture").slice(0, 64),
    role: body.role === "wall" || body.role === "art" || body.role === "prop" || body.role === "fabric" ? body.role : "floor",
    file,
    mime,
    bytes: buf.length,
    createdAt: new Date().toISOString(),
  };
  const rows = [rec, ...loadIndex().filter((a) => a.id !== id)].slice(0, 64);
  saveIndex(rows);
  return { ok: true, asset: { ...rec, url: "/api/anvil/assets/" + id + "/file" } };
}

export function assetFile(id: string) {
  const rec = loadIndex().find((a) => a.id === id);
  if (!rec) return null;
  const fp = join(DIR, rec.file);
  if (!existsSync(fp)) return null;
  return { rec, path: fp, buf: readFileSync(fp) };
}

export function removeAsset(id: string) {
  const rows = loadIndex();
  const rec = rows.find((a) => a.id === id);
  if (!rec) return { ok: false, error: "not found" };
  try {
    unlinkSync(join(DIR, rec.file));
  } catch {
    /* ignore */
  }
  saveIndex(rows.filter((a) => a.id !== id));
  return { ok: true };
}
