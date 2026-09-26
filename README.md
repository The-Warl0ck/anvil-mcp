# anvil-mcp

**Anvil — a local physics/chemistry bench as an MCP server.**

No cloud. No Bridge. No API key. No LLM.

Type plain words → Anvil's offline intent kernel forges a simulation blueprint →
12-domain physics solvers run it → you get back a simulation snapshot plus proof
metrics (pass / warn / fail).

## 30 seconds

```
you:    anvil.forge  { intent: "5-stage CMOS ring oscillator at 7nm" }
anvil:  blueprint: silicon · 8 nodes · "Offline kernel: 5-stage ring at 7 nm, VDD 0.75 V."

you:    anvil.solve  { blueprint }
anvil:  [pass] Joule power = 0.0089 W — I²R on the extracted net.
        [pass] Junction temperature = 21.85 °C — lumped thermal node per device, 300 K ambient.
        [pass] EM MTTF (Black) = 1.58e15 yr — Black's equation, Ea = 0.9 eV, worst via.

you:    anvil.export { blueprint, format: "stl" }
anvil:  532 triangles of ASCII STL, ready for a slicer.
```

## Install

Requires Node ≥ 20. No build step needed for use:

```sh
npx github:The-Warl0ck/anvil-mcp
```

Or clone and run:

```sh
git clone https://github.com/The-Warl0ck/anvil-mcp
cd anvil-mcp
npm install
npm run build
npm start
```

## Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "anvil": {
      "command": "npx",
      "args": ["github:The-Warl0ck/anvil-mcp"]
    }
  }
}
```

## Tools

| Tool | Input | Output |
|---|---|---|
| `anvil.domains` | `{}` | The 12 domains and what each simulates |
| `anvil.forge` | `{ intent, domain? }` | Blueprint JSON + rationale (offline, no LLM) |
| `anvil.solve` | `{ blueprint, steps? }` | SimSnapshot + ProofMetric[] with real numbers |
| `anvil.export` | `{ blueprint, format }` | STL (ASCII) or OBJ text for 3D printing / CAD |

## The 12 domains

silicon (nets, delay, heat, electromigration) · cellular (membranes, ions,
morphogens) · quantum (wells, tunneling, decoherence) · neural (spikes, region
flows) · mechanical (stress, modes, yield) · chemistry (mass-action kinetics,
ΔH, equilibrium) · architecture (plans, interiors, circulation) · metallurgy
(alloys, CE, melt, print window) · robotics (arms, torque, reach, payload) ·
machines (engines, gears, printable parts) · optics (geometry, gnomon, shadows,
sundials) · sky (sun position / ephemeris)

## How it works

1. **`anvil.forge`** — `readIntent` scores your words against per-domain keyword
   sets, picks a domain, and `forgeOffline` builds a schematic graph (nodes,
   edges, physical params) from templates plus your numbers (e.g. "7nm",
   "5-stage", "0.75 V"). Pure local compute.
2. **`anvil.solve`** — `createSolver` dispatches to the domain solver
   (Kirchhoff MNA for silicon, Euler–Bernoulli for mechanical, mass-action for
   chemistry, …), steps it, and returns a snapshot plus proof metrics — checks
   with real tolerances and statuses.
3. **`anvil.export`** — blueprint geometry meshed to ASCII STL or OBJ text.

Everything runs in-process. There is no network call anywhere in the default
path.

## Config

Optional — nothing is required to run:

```sh
ANVIL_HOME=~/.anvil   # where saved designs / assets / exports live (default ~/.anvil)
```

## Notes

- Any OpenAI-compatible "mouth" (LM Studio, etc.) is a **future opt-in**, not
  part of v1. The kernel speaks blueprints, not prose, and that's the point.
- `anvil.solve` returns a deterministic snapshot after N steps of the solver's
  recommended dt — no wall-clock randomness.
- Apache-2.0. See [LICENSE](LICENSE).
