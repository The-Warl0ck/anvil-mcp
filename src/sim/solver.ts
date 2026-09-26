import type { Blueprint, Solver } from "./types.ts";
import { applyGeometry } from "./trace-geom.ts";
import { SiliconSolver } from "./solvers/silicon.ts";
import { CellularSolver } from "./solvers/cellular.ts";
import { QuantumSolver } from "./solvers/quantum.ts";
import { NeuralSolver } from "./solvers/neural.ts";
import { MechanicalSolver } from "./solvers/mechanical.ts";
import { ChemistrySolver } from "./solvers/chemistry.ts";
import { ArchitectureSolver } from "./solvers/architecture.ts";
import { MetallurgySolver } from "./solvers/metallurgy.ts";
import { RoboticsSolver } from "./solvers/robotics.ts";
import { MachinesSolver } from "./solvers/machines.ts";
import { OpticsSolver } from "./solvers/optics.ts";
import { SkySolver } from "./solvers/sky.ts";

export function createSolver(bp: Blueprint): Solver {
  const net = applyGeometry(bp);
  let s: Solver;
  switch (net.domain) {
    case "silicon":
      s = new SiliconSolver();
      break;
    case "cellular":
      s = new CellularSolver();
      break;
    case "quantum":
      s = new QuantumSolver();
      break;
    case "neural":
      s = new NeuralSolver();
      break;
    case "chemistry":
      s = new ChemistrySolver();
      break;
    case "architecture":
      s = new ArchitectureSolver();
      break;
    case "metallurgy":
      s = new MetallurgySolver();
      break;
    case "robotics":
      s = new RoboticsSolver();
      break;
    case "machines":
      s = new MachinesSolver();
      break;
    case "optics":
      s = new OpticsSolver();
      break;
    case "sky":
      s = new SkySolver();
      break;
    default:
      s = new MechanicalSolver();
  }
  s.reset(net);
  return s;
}
