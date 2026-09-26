/**
 * anvil-mcp — Anvil physics/chemistry bench as an MCP server (stdio).
 *
 * Fully offline. No cloud, no Bridge, no API key, no LLM:
 * plain words -> offline intent kernel -> blueprint -> 12-domain solvers -> proof metrics.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";

import type { Blueprint, Domain } from "../sim/types.ts";
import { DOMAINS } from "../sim/types.ts";
import { forgeOffline, readIntent } from "../ai/offline-kernel.ts";
import { blankBlueprint } from "../sim/blueprints.ts";
import { normalizeBlueprint } from "../ai/schema.ts";
import { createSolver } from "../sim/solver.ts";
import { buildMesh, toObj, toStlAscii } from "../sim/mesh.ts";

const DOMAIN_IDS = DOMAINS.map((d) => d.id);

const BLUEPRINT_SCHEMA = {
  type: "object",
  description: "Anvil blueprint: a schematic graph for one domain.",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    domain: { type: "string", enum: DOMAIN_IDS },
    description: { type: "string" },
    notes: { type: "string" },
    scale: { type: "number", description: "meters per schematic unit" },
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string" },
          label: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          z: { type: "number" },
          params: { type: "object", additionalProperties: { type: "number" } },
        },
        additionalProperties: true,
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
          kind: { type: "string" },
          params: { type: "object", additionalProperties: { type: "number" } },
        },
        additionalProperties: true,
      },
    },
    skin: { type: "object", additionalProperties: true },
  },
  additionalProperties: true,
} as const;

function ok(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

function fail(message: string): never {
  throw new McpError(ErrorCode.InvalidParams, message);
}

const server = new Server(
  { name: "anvil-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "anvil.domains",
      description:
        "List the 12 simulation domains Anvil supports and what each one simulates.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
    },
    {
      name: "anvil.forge",
      description:
        "Forge a simulation blueprint from a plain-language intent. Fully offline — an intent kernel maps your words to a domain schematic (nodes, edges, params), no LLM involved.",
      inputSchema: {
        type: "object",
        properties: {
          intent: {
            type: "string",
            minLength: 1,
            description: 'Plain words, e.g. "a simple RC low-pass filter" or "alloy of copper and tin".',
          },
          domain: {
            type: "string",
            enum: DOMAIN_IDS,
            description: "Optional domain hint; otherwise the kernel picks from the intent text.",
          },
        },
        required: ["intent"],
        additionalProperties: false,
      },
    },
    {
      name: "anvil.solve",
      description:
        "Run the 12-domain physics solver on a blueprint and return a simulation snapshot plus proof metrics (pass/warn/fail).",
      inputSchema: {
        type: "object",
        properties: {
          blueprint: BLUEPRINT_SCHEMA,
          steps: {
            type: "integer",
            minimum: 1,
            maximum: 5000,
            default: 200,
            description: "Solver steps of recommended dt to run before snapshotting.",
          },
        },
        required: ["blueprint"],
        additionalProperties: false,
      },
    },
    {
      name: "anvil.export",
      description:
        "Export a blueprint's geometry as STL (ASCII) or OBJ text for 3D printing / CAD.",
      inputSchema: {
        type: "object",
        properties: {
          blueprint: BLUEPRINT_SCHEMA,
          format: { type: "string", enum: ["stl", "obj"], default: "stl" },
        },
        required: ["blueprint", "format"],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args ?? {}) as Record<string, unknown>;
  try {
    switch (name) {
      case "anvil.domains":
        return ok({ domains: DOMAINS });

      case "anvil.forge": {
        const intent = a.intent;
        if (typeof intent !== "string" || !intent.trim()) fail("intent must be a non-empty string");
        const hint = typeof a.domain === "string" && (DOMAIN_IDS as string[]).includes(a.domain)
          ? (a.domain as Domain)
          : "mechanical";
        const read = readIntent(intent as string, hint);
        const current: Blueprint = blankBlueprint(read.domain);
        const { blueprint, rationale } = forgeOffline(intent as string, current);
        return ok({
          intent: {
            domain: read.domain,
            scores: read.scores,
            stages: read.stages,
            nm: read.nm,
            eV: read.eV,
            hz: read.hz,
            voltage: read.voltage,
            count: read.count,
          },
          blueprint,
          rationale,
        });
      }

      case "anvil.solve": {
        if (typeof a.blueprint !== "object" || a.blueprint === null) fail("blueprint must be an object");
        const bp = normalizeBlueprint(a.blueprint as Record<string, unknown>, "mechanical");
        const solver = createSolver(bp);
        const steps = typeof a.steps === "number" && Number.isFinite(a.steps)
          ? Math.max(1, Math.min(5000, Math.floor(a.steps)))
          : 200;
        const dt = solver.recommendedDt;
        for (let i = 0; i < steps; i++) solver.step(dt);
        return ok({
          blueprint: { id: bp.id, name: bp.name, domain: bp.domain },
          solver: { domain: solver.domain, dt, steps, simulatedTime: dt * steps },
          snapshot: solver.snapshot(),
          proof: solver.proof(),
          series: solver.series(),
        });
      }

      case "anvil.export": {
        if (typeof a.blueprint !== "object" || a.blueprint === null) fail("blueprint must be an object");
        const format = a.format === "obj" ? "obj" : "stl";
        const bp = normalizeBlueprint(a.blueprint as Record<string, unknown>, "mechanical");
        const tris = buildMesh(bp);
        const text = format === "obj" ? toObj(bp, tris) : toStlAscii(bp, tris);
        return ok({
          format,
          triangles: tris.length,
          bytes: Buffer.byteLength(text, "utf8"),
          text,
        });
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `unknown tool: ${name}`);
    }
  } catch (err) {
    if (err instanceof McpError) throw err;
    throw new McpError(ErrorCode.InternalError, err instanceof Error ? err.message : String(err));
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("anvil-mcp fatal:", err);
  process.exit(1);
});
