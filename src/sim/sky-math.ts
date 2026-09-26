/** NOAA-style solar position. No Stellarium install required; optional HTTP overlay. */

export interface SunPos {
  altitudeDeg: number;
  azimuthDeg: number;
  up: boolean;
}

export function sunPosition(latDeg: number, lonDeg: number, when: Date): SunPos {
  const lat = (latDeg * Math.PI) / 180;
  const d = toJulian(when) - 2451545;
  const g = ((357.529 + 0.98560028 * d) * Math.PI) / 180;
  const q = (280.459 + 0.98564736 * d) * (Math.PI / 180);
  const L = q + ((1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI) / 180;
  const e = ((23.439 - 0.00000036 * d) * Math.PI) / 180;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const lst = ((gmst + lonDeg / 15) % 24) * 15 * (Math.PI / 180);
  const ha = lst - ra;
  const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAz =
    (Math.sin(dec) - Math.sin(alt) * Math.sin(lat)) / (Math.cos(alt) * Math.cos(lat) || 1e-9);
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (Math.sin(ha) > 0) az = 2 * Math.PI - az;
  return {
    altitudeDeg: (alt * 180) / Math.PI,
    azimuthDeg: (az * 180) / Math.PI,
    up: alt > 0,
  };
}

function toJulian(d: Date) {
  return d.getTime() / 86400000 + 2440587.5;
}

export async function stellariumSun(base?: string): Promise<SunPos | null> {
  if (!base) return null;
  try {
    const u = String(base).replace(/\/$/, "") + "/api/objects/info?name=Sun&format=json";
    const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = setTimeout(() => ac?.abort(), 1200);
    const r = await fetch(u, { signal: ac?.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const j = (await r.json()) as { altitude?: number; azimuth?: number };
    if (typeof j.altitude !== "number") return null;
    return { altitudeDeg: j.altitude, azimuthDeg: j.azimuth ?? 0, up: j.altitude > 0 };
  } catch {
    return null;
  }
}
