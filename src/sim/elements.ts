/** Pure-element handbook values (SI). Mixing uses mass-weighted rules + stated empirics — not a CALPHAD phase diagram. */
export interface ElementRec {
  id: string;
  Z: number;
  M: number;
  rho: number;
  Tm: number;
  k: number;
  E: number;
  label: string;
}

export const ELEMENTS: Record<string, ElementRec> = {
  Fe: { id: "Fe", Z: 26, M: 55.85, rho: 7874, Tm: 1811, k: 80, E: 2.11e11, label: "Iron" },
  C: { id: "C", Z: 6, M: 12.01, rho: 2267, Tm: 3823, k: 140, E: 1.05e11, label: "Carbon" },
  Cr: { id: "Cr", Z: 24, M: 52.0, rho: 7190, Tm: 2180, k: 94, E: 2.79e11, label: "Chromium" },
  Ni: { id: "Ni", Z: 28, M: 58.69, rho: 8908, Tm: 1728, k: 91, E: 2.0e11, label: "Nickel" },
  Mn: { id: "Mn", Z: 25, M: 54.94, rho: 7470, Tm: 1519, k: 7.8, E: 1.98e11, label: "Manganese" },
  Si: { id: "Si", Z: 14, M: 28.09, rho: 2329, Tm: 1687, k: 150, E: 1.6e11, label: "Silicon" },
  Mo: { id: "Mo", Z: 42, M: 95.95, rho: 10280, Tm: 2896, k: 138, E: 3.29e11, label: "Molybdenum" },
  Al: { id: "Al", Z: 13, M: 26.98, rho: 2700, Tm: 933, k: 237, E: 7.0e10, label: "Aluminium" },
  Cu: { id: "Cu", Z: 29, M: 63.55, rho: 8960, Tm: 1358, k: 401, E: 1.3e11, label: "Copper" },
  Ti: { id: "Ti", Z: 22, M: 47.87, rho: 4507, Tm: 1941, k: 22, E: 1.16e11, label: "Titanium" },
  Zn: { id: "Zn", Z: 30, M: 65.38, rho: 7140, Tm: 693, k: 116, E: 1.08e11, label: "Zinc" },
  Mg: { id: "Mg", Z: 12, M: 24.31, rho: 1740, Tm: 923, k: 156, E: 4.5e10, label: "Magnesium" },
  W: { id: "W", Z: 74, M: 183.8, rho: 19300, Tm: 3695, k: 174, E: 4.11e11, label: "Tungsten" },
  Co: { id: "Co", Z: 27, M: 58.93, rho: 8900, Tm: 1768, k: 100, E: 2.09e11, label: "Cobalt" },
  V: { id: "V", Z: 23, M: 50.94, rho: 6110, Tm: 2183, k: 31, E: 1.28e11, label: "Vanadium" },
};

export function elementOf(kind: string, Z?: number): ElementRec {
  const k = String(kind || "");
  if (ELEMENTS[k]) return ELEMENTS[k];
  if (Z && Number.isFinite(Z)) {
    const hit = Object.values(ELEMENTS).find((e) => e.Z === Z);
    if (hit) return hit;
  }
  return ELEMENTS.Fe;
}
