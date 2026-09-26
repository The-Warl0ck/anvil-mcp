# Anvil 12-Domain Verification — 2026-09-26

Question: do all the benches work as intended? Method: drove the published 0.1.3
over MCP stdio — every domain got a positive test (forge sensible intent → solve),
a sensitivity test (do proof values move with input?), and a negative test
(physically absurd params → must warn/fail, not vacuous-pass). Plus STL export validation.

## Verdict: the benches work. Two sharp edges found, fixes ready.

### Verified working (all 12 domains)
- forge → solve → proof metrics, zero errors, all 12.
- Proof metrics are genuinely computed from the simulation, not static.
- 10 of 12 domains fail loudly (warn/fail) on garbage input.
- Export: valid STL (`solid`/`endsolid`, 200 triangles on test part).

### Sharp edge 1: machines + mechanical solvers PASS non-physical input
`sf = sigma > 0 ? steel / sigma : 99` — zero/negative stress (physically impossible)
maps to safety factor 99 → "pass". Observed: a sensible gear design warned on Lewis
bending σ, while the same design with negated ×1e6 params PASSED. Garbage can grade
better than reality. 4 spots: machines.ts (engineProof, gearProof, partProof),
mechanical.ts (beam proof).
Fix: non-positive or NaN stress → status "fail", note "non-physical input".

### Sharp edge 2: domain router overrides explicit hints on substring accidents
`readIntent` scores naive substrings; any single hit (12 pts) beats the caller's
explicit domain hint. Observed:
- "a steel cantilever bracket" + hint mechanical → quantum ("ev" in "cantilever")
- "a salt water solution" + hint chemistry → cellular ("ion" in "solution")
- "a qubit in superposition" + hint quantum → cellular ("ion" in "superposition",
  tie broken by keyword-list order)
Fix options: (a) explicit hint wins ties; (b) explicit hint always wins.
Recommend (b): a named domain is an instruction, the scorer is the fallback.

### Checked, not issues
- optics/sky looked "insensitive" to ×1000 scaling — their proof metrics are
  dimensionless ratios, correctly scale-invariant. They fail properly on
  sign-flipped garbage. Test artifact, not a bug.
- robotics forge → 2 fails on "a two-joint robot arm": the iterate loop doing its
  job. Good demo material for the "it checks its own work" beat.

### Demo note
Avoid the word "cantilever" in the Anvil recording (routes to quantum). "a steel
beam" + mechanical hint routes clean.

---

## Addendum — 0.1.4 (2026-09-26)

Both sharp edges from the 0.1.3 verification are fixed and re-verified over stdio:

1. **Domain router** (`readIntent` / `forgeOffline` / MCP `anvil.forge`): an explicitly
   passed `domain` is now honored over keyword scoring. All three misfire cases from
   the 0.1.3 report now route correctly ("a steel cantilever bracket" → mechanical,
   "a 0.5 M sodium chloride solution" → chemistry, "a 5-qubit superposition circuit" →
   quantum). Without an explicit domain the old keyword behavior is unchanged
   (backwards compatible). Tool description updated to document the contract.

2. **Safety-factor guards** (`machines.ts` engine/gear/part proofs, `mechanical.ts`):
   non-positive or NaN stress now forces `fail` on the stress and safety-factor
   metrics with an explanatory note, instead of mapping to sf = 99 → "pass".
   Negative-torque gear and negative-force part blueprints fail loudly.

Full 12-domain sweep re-run on 0.1.4: all domains forge→solve correctly with
explicit hints, mutate path ("make it thicker") intact, STL export valid
(`solid MEMS_cantilever` … `endsolid`, 532 triangles).
