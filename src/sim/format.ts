import type { Domain } from "./types.ts";

export function formatSi(value: number, unit: string, digits = 2): string {
  if (!Number.isFinite(value)) return `— ${unit}`;
  const abs = Math.abs(value);
  if (!unit) {
    if (abs === 0) return "0";
    if (abs >= 100) return value.toFixed(0);
    if (abs >= 1) return value.toFixed(digits);
    if (abs >= 0.01) return value.toFixed(3);
    return value.toExponential(2);
  }
  const rules: [number, string][] = [
    [1e12, "T"],
    [1e9, "G"],
    [1e6, "M"],
    [1e3, "k"],
    [1, ""],
    [1e-3, "m"],
    [1e-6, "µ"],
    [1e-9, "n"],
    [1e-12, "p"],
    [1e-15, "f"],
    [1e-18, "a"],
  ];
  if (abs === 0) return `0 ${unit}`;
  for (const [mag, prefix] of rules) {
    if (abs >= mag || mag === 1e-18) {
      const scaled = value / mag;
      const d = Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : digits;
      return `${scaled.toFixed(d)} ${prefix}${unit}`;
    }
  }
  return `${value.toExponential(2)} ${unit}`;
}

export function formatSimTime(domain: Domain, t: number): string {
  switch (domain) {
    case "silicon":
      return formatSi(t, "s");
    case "quantum":
      return formatSi(t, "s");
    case "neural":
    case "cellular":
      return formatSi(t, "s");
    case "mechanical":
      return formatSi(t, "s");
    case "chemistry":
      return formatSi(t, "s");
    case "architecture":
      return formatSi(t, "s");
    case "metallurgy":
      return formatSi(t, "s");
    case "robotics":
      return formatSi(t, "s");
    case "machines":
      return formatSi(t, "s");
    default:
      return formatSi(t, "s");
  }
}

export function domainUnits(domain: Domain): { field: string; fieldUnit: string } {
  switch (domain) {
    case "silicon":
      return { field: "Voltage", fieldUnit: "V" };
    case "cellular":
      return { field: "Membrane", fieldUnit: "V" };
    case "quantum":
      return { field: "|ψ|²", fieldUnit: "" };
    case "neural":
      return { field: "Vm", fieldUnit: "V" };
    case "mechanical":
      return { field: "Deflect", fieldUnit: "m" };
    case "chemistry":
      return { field: "Conc.", fieldUnit: "mol/L" };
    case "architecture":
      return { field: "People", fieldUnit: "" };
    case "metallurgy":
      return { field: "wt%", fieldUnit: "%" };
    case "robotics":
      return { field: "q", fieldUnit: "rad" };
    case "machines":
      return { field: "x / θ", fieldUnit: "" };
    default:
      return { field: "field", fieldUnit: "" };
  }
}

export function statusLabel(status: string) {
  if (status === "pass") return "PASS";
  if (status === "warn") return "WATCH";
  if (status === "fail") return "FAIL";
  return "NOTE";
}
