import { homedir } from "node:os";
import { join } from "node:path";

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function uid(prefix = "n") {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Anvil's on-disk home. Defaults to ~/.anvil; override with ANVIL_HOME.
 * Used for saved designs, assets, and mesh exports.
 */
export function anvilDir(sub: string) {
  const home = process.env.ANVIL_HOME || join(homedir(), ".anvil");
  return join(home, sub);
}
