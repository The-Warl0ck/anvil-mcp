/** Shared walk-rig input so the controls probe can drive WASD without DOM keys. */

export const walkInput = {
  keys: new Set<string>(),
  yaw: 0,
  pitch: 0,
  speed: 0,
  inject: null as string[] | null,
  held() {
    if (this.inject) return new Set(this.inject);
    return this.keys;
  },
};

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setKeys: (codes: string[]) => void;
    };
  }
}

export function bindWalkProbe() {
  if (typeof window === "undefined") return;
  window.__controlsTest = {
    getYaw: () => walkInput.yaw,
    getSpeed: () => walkInput.speed,
    setKeys: (codes) => {
      walkInput.inject = codes.length ? codes : null;
      if (!codes.length) walkInput.speed = 0;
    },
  };
}
