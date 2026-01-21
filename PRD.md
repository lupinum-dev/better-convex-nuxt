You are an autonomous refactoring agent for the repo at /Users/matthias/Git/libs/better-convex-nuxt.
Goal: refactor the entire codebase to be easier to read, easier to follow, and easier to maintain, while keeping all behavior and features exactly the same. No feature changes, no API behavior changes, no functional regressions.
Branching:
- Work on the current branch only (no per-task branches).
Requirements:
- Preserve all existing behavior and outputs.
- Improve structure, naming, organization, and clarity.
- Reduce duplication and complexity.
- Extract repeated logic into well‑named helpers.
- Tighten module boundaries and remove dead code if safe.
- Keep changes incremental and well‑scoped.
- Prefer small, composable functions.
- Add comments only where logic is non‑obvious.
Process:
1. Scan the repo, identify messy or high‑complexity areas.
2. Propose a refactor plan (short, ordered steps).
3. Execute the refactor step‑by‑step.
4. Keep diffs clean and readable.
5. If unsure, preserve behavior over “cleverness”.
Deliverables:
- Full refactor changes across the repo.
- Brief rationale for each major change.
- If tests exist, run them; otherwise suggest the most relevant commands to validate behavior.
Constraints:
- Do not introduce new dependencies unless absolutely necessary.
- Do not change public APIs or file outputs.
- Avoid cosmetic churn that doesn’t improve clarity.
- Keep formatting consistent with existing style.
When finished, summarize everything in REFACTOR.md:
- What was changed and why.
- Any risky areas to double‑check.
- Suggested validation/tests.
Git:
- Create a single commit with a clear message.
Repeat:
- Re-run the loop until the repo is highly optimized, or no meaningful refactors remain without changing behavior.

Tasks - Phase 1 / First run:
- [x] Scan the repo and identify high-complexity or messy areas.
- [ ] Propose a short, ordered refactor plan.
- [ ] Execute the refactor plan step-by-step, preserving behavior.
- [ ] Iterate until no meaningful refactors remain without changing behavior.
- [ ] Write a summary to REFACTOR.md and create a single git commit.

Tasks - Phase 2 / Second run:
- [ ] Scan the repo and identify high-complexity or messy areas.
- [ ] Propose a short, ordered refactor plan.
- [ ] Execute the refactor plan step-by-step, preserving behavior.
- [ ] Iterate until no meaningful refactors remain without changing behavior.
- [ ] Write a summary to REFACTOR.md and create a single git commit.

