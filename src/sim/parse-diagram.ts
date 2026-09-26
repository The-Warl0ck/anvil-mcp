import { uid } from "../lib/utils.ts";
import type { Blueprint, Domain, LabEdge, LabNode } from "./types.ts";
import { extractSvgPolylines } from "./path-geom.ts";
import { mapPathToBlueprint } from "./map-path.ts";

function domainFromName(name: string, fallback: Domain): Domain {
  const n = name.toLowerCase();
  if (/chip|silic|cmos|inverter|netlist|die/.test(n)) return "silicon";
  if (/cell|bio|mito|membrane|organ/.test(n)) return "cellular";
  if (/quant|qubit|tunnel|well|wave/.test(n)) return "quantum";
  if (/brain|neur|synap|axon|cortex/.test(n)) return "neural";
  if (/beam|mems|stress|truss|mech/.test(n)) return "mechanical";
  return fallback;
}

export function parseJsonBlueprint(text: string, fallback: Domain): Blueprint {
  const raw = JSON.parse(text) as Partial<Blueprint>;
  if (!raw.nodes || !raw.edges) throw new Error("JSON is missing nodes/edges");
  return {
    id: raw.id ?? uid("bp"),
    name: raw.name ?? "Imported blueprint",
    domain: (raw.domain as Domain) ?? fallback,
    description: raw.description ?? "Imported from JSON.",
    nodes: raw.nodes as LabNode[],
    edges: raw.edges as LabEdge[],
    scale: raw.scale ?? 1e-6,
    notes: raw.notes ?? "",
  };
}

export function parseSvgBlueprint(svg: string, fallback: Domain, filename: string): Blueprint {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const root = doc.documentElement;
  const vb = (root.getAttribute("viewBox") ?? "0 0 100 100").split(/[\s,]+/).map(Number);
  const ox = vb[0] || 0;
  const oy = vb[1] || 0;
  const vw = vb[2] || 100;
  const vh = vb[3] || 100;
  const toX = (x: number) => ((x - ox) / vw) * 100;
  const toY = (y: number) => ((y - oy) / vh) * 100;

  const nodes: LabNode[] = [];
  const shapes = root.querySelectorAll("circle, ellipse, rect");
  shapes.forEach((el, i) => {
    let x = 0;
    let y = 0;
    if (el.tagName === "rect") {
      x = Number(el.getAttribute("x") ?? 0) + Number(el.getAttribute("width") ?? 0) / 2;
      y = Number(el.getAttribute("y") ?? 0) + Number(el.getAttribute("height") ?? 0) / 2;
    } else {
      x = Number(el.getAttribute("cx") ?? 0);
      y = Number(el.getAttribute("cy") ?? 0);
    }
    const label = el.getAttribute("id") || el.getAttribute("data-label") || `N${i + 1}`;
    nodes.push({
      id: uid("n"),
      kind: guessKind(fallback),
      label,
      x: toX(x),
      y: toY(y),
      z: 0,
      params: defaultParams(fallback),
    });
  });

  const edges: LabEdge[] = [];
  root.querySelectorAll("line").forEach((el) => {
    const x1 = toX(Number(el.getAttribute("x1") ?? 0));
    const y1 = toY(Number(el.getAttribute("y1") ?? 0));
    const x2 = toX(Number(el.getAttribute("x2") ?? 0));
    const y2 = toY(Number(el.getAttribute("y2") ?? 0));
    const a = nearest(nodes, x1, y1);
    const b = nearest(nodes, x2, y2);
    if (a && b && a.id !== b.id) {
      edges.push({
        id: uid("e"),
        from: a.id,
        to: b.id,
        kind: defaultEdge(fallback),
        params: defaultEdgeParams(fallback),
      });
    }
  });

  const paths = extractSvgPolylines(svg);
  if (nodes.length < 2 && paths.length) {
    return mapPathToBlueprint({
      paths,
      svg,
      name: filename.replace(/\.[^.]+$/, "") || "SVG path",
      domain: domainFromName(filename, fallback),
    });
  }
  if (nodes.length < 2) {
    throw new Error("SVG had no usable circles/rects/paths — try a PNG or the Grok reader.");
  }
  if (paths.length && edges.length === 0) {
    const mapped = mapPathToBlueprint({
      paths,
      name: filename.replace(/\.[^.]+$/, "") || "SVG path",
      domain: domainFromName(filename, fallback),
    });
    return mapped;
  }
  return {
    id: uid("bp"),
    name: filename.replace(/\.[^.]+$/, "") || "SVG import",
    domain: domainFromName(filename, fallback),
    description: "Reconstructed from SVG primitives.",
    nodes,
    edges,
    scale: defaultScale(fallback),
    notes: "Imported SVG. Tune parameters in the inspector.",
  };
}

export async function parseImageBlueprint(
  file: File,
  fallback: Domain,
): Promise<Blueprint> {
  const bmp = await loadImage(file);
  const size = 140;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("No 2D context");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bmp, 0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  const bin = threshold(img);
  const blobs = connected(bin, size, size);
  const nodes: LabNode[] = blobs
    .filter((b) => b.area >= 18 && b.area < 2400)
    .slice(0, 28)
    .map((b, i) => ({
      id: uid("n"),
      kind: guessKind(fallback),
      label: `N${i + 1}`,
      x: (b.cx / size) * 100,
      y: (b.cy / size) * 100,
      z: 0,
      params: defaultParams(fallback),
    }));

  const edges: LabEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const d = Math.hypot(dx, dy);
      if (d < 28 && lineInk(bin, size, nodes[i], nodes[j])) {
        edges.push({
          id: uid("e"),
          from: nodes[i].id,
          to: nodes[j].id,
          kind: defaultEdge(fallback),
          params: defaultEdgeParams(fallback),
        });
      }
    }
  }
  if (nodes.length < 2) throw new Error("Could not find components in that image.");
  if (edges.length === 0) {
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        id: uid("e"),
        from: nodes[i].id,
        to: nodes[i + 1].id,
        kind: defaultEdge(fallback),
        params: defaultEdgeParams(fallback),
      });
    }
  }
  return {
    id: uid("bp"),
    name: file.name.replace(/\.[^.]+$/, "") || "Diagram",
    domain: domainFromName(file.name, fallback),
    description: "3D-mapped from a raster diagram via blob extraction.",
    nodes,
    edges,
    scale: defaultScale(fallback),
    notes: "Local vision pass. Use Read diagram if the net looks wrong.",
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image failed to load"));
    };
    img.src = url;
  });
}

function threshold(img: ImageData): Uint8Array {
  const n = img.width * img.height;
  const out = new Uint8Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) {
    const r = img.data[i * 4];
    const g = img.data[i * 4 + 1];
    const b = img.data[i * 4 + 2];
    const y = (r + g + b) / 3;
    mean += y;
    out[i] = y;
  }
  mean /= n;
  const invert = mean < 110;
  const cut = mean * 0.72;
  for (let i = 0; i < n; i++) {
    const ink = invert ? out[i] > cut : out[i] < cut;
    out[i] = ink ? 1 : 0;
  }
  return out;
}

function connected(bin: Uint8Array, w: number, h: number) {
  const seen = new Uint8Array(bin.length);
  const blobs: { cx: number; cy: number; area: number }[] = [];
  const qx: number[] = [];
  const qy: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!bin[i] || seen[i]) continue;
      qx.length = 0;
      qy.length = 0;
      qx.push(x);
      qy.push(y);
      seen[i] = 1;
      let area = 0;
      let sx = 0;
      let sy = 0;
      while (qx.length) {
        const cx = qx.pop()!;
        const cy = qy.pop()!;
        area += 1;
        sx += cx;
        sy += cy;
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!bin[ni] || seen[ni]) continue;
          seen[ni] = 1;
          qx.push(nx);
          qy.push(ny);
        }
      }
      blobs.push({ cx: sx / area, cy: sy / area, area });
    }
  }
  blobs.sort((a, b) => b.area - a.area);
  return blobs;
}

function lineInk(bin: Uint8Array, size: number, a: LabNode, b: LabNode) {
  const x0 = (a.x / 100) * size;
  const y0 = (a.y / 100) * size;
  const x1 = (b.x / 100) * size;
  const y1 = (b.y / 100) * size;
  const steps = Math.max(8, Math.hypot(x1 - x0, y1 - y0) | 0);
  let hit = 0;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    if (bin[y * size + x]) hit += 1;
  }
  return hit / steps > 0.28;
}

function nearest(nodes: LabNode[], x: number, y: number) {
  let best: LabNode | null = null;
  let d = 1e9;
  for (const n of nodes) {
    const dd = Math.hypot(n.x - x, n.y - y);
    if (dd < d) {
      d = dd;
      best = n;
    }
  }
  return d < 18 ? best : null;
}

function guessKind(domain: Domain) {
  if (domain === "silicon") return "inverter";
  if (domain === "cellular") return "organelle";
  if (domain === "quantum") return "well";
  if (domain === "neural") return "soma";
  return "joint";
}

function defaultEdge(domain: Domain) {
  if (domain === "silicon") return "trace";
  if (domain === "cellular") return "cytosol";
  if (domain === "quantum") return "tunnel";
  if (domain === "neural") return "synapse";
  return "beam";
}

function defaultParams(domain: Domain): Record<string, number> {
  if (domain === "silicon") return { gain: 12, rout: 200, C: 5e-16 };
  if (domain === "cellular") return { g: 0.6, E: 0 };
  if (domain === "quantum") return { V_eV: 0.15, w_nm: 4 };
  if (domain === "neural") return { a: 0.02, b: 0.2, c: -65, d: 8, Ibias: 4 };
  return { m: 2e-13 };
}

function defaultEdgeParams(domain: Domain): Record<string, number> {
  if (domain === "silicon") return { R: 40, w_nm: 20, L_nm: 300 };
  if (domain === "cellular") return { g: 0.4 };
  if (domain === "quantum") return { coupling: 0.05 };
  if (domain === "neural") return { w: 8, delay: 0.002 };
  return { L: 2e-5, w: 2e-5, t: 2e-6, E: 1.6e11 };
}

function defaultScale(domain: Domain) {
  if (domain === "silicon") return 2e-7;
  if (domain === "quantum") return 1e-9;
  if (domain === "neural") return 5e-5;
  if (domain === "mechanical") return 2e-6;
  return 1e-6;
}

export async function parseDroppedFile(file: File, fallback: Domain): Promise<Blueprint> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json") || file.type === "application/json") {
    return parseJsonBlueprint(await file.text(), fallback);
  }
  if (name.endsWith(".svg") || file.type === "image/svg+xml") {
    return parseSvgBlueprint(await file.text(), fallback, file.name);
  }
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(name)) {
    return parseImageBlueprint(file, fallback);
  }
  throw new Error("Use JSON, SVG, PNG, or JPG.");
}
