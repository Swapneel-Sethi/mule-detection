# MuleGuard Swarm-36 R2 — Common Brief (READ FULLY FIRST)

Roots: OUTER = `C:/MISCELLANEOUS PROJECTS/SIH_2026/1` | APP = OUTER/`mule-detection` (Next 16.3.1 App Router, React 19.2, Tailwind v4, TS5 strict; inner app has its OWN git repo on branch `main`).

## STATE YOU MUST KNOW
A prior 36-swarm ran EARLIER TODAY (report: `OUTER/audit/07-SWARM36-MASTER.md`, plus `OUTER/audit/DEFECT_REGISTER.md`). It applied ~210 fixes IN PLACE. Those changes are LOCAL AND UNCOMMITTED — the working tree is the source of truth, NOT git HEAD. It left ~90 items "reported-only". Its verification: `npx tsc --noEmit` exit 0, `npx eslint src` exit 0.

## YOUR THREE DUTIES (do all three)
- R1 REGRESSION-VERIFY: for every prior fix touching YOUR scope (master report cites file:line), confirm the fix is present, correct, and did not break neighboring logic or contracts. A broken/incomplete/conflicting prior fix = finding (category discrepancy or bug).
- R2 ADJUDICATE: for each "reported-only" item in your scope, decide: safely fixable now (say what the fix is) vs genuine owner/product call (label severity + why). Do NOT just repeat the old verdict — re-examine current code.
- R3 HUNT: fresh exhaustive line-by-line review of your assigned files. Prior runs missed things; find them.

## METHOD
Read EVERY line of assigned code files (Read with offset/limit until EOF, ~600-line chunks). Huge data files (>5MB): validate via python one-liners through Bash — counts, ID uniqueness, FK integrity, ranges, null/NaN, enums, date windows, schema keys — plus sampled dumps. Hunt: logic bugs, off-by-one, wrong operators (< vs <=), dead code, unreachable branches, stale comments, naming drift, producer/consumer schema mismatches, snake/camel splits, unit/scale mismatches (0-1 vs 0-100, log-odds vs prob), timezone/date-window mismatches, hydration hazards, races, unclosed timers/listeners/RAF, unbounded memory, a11y gaps, O(n^2) over 105k rows, hardcoded values contradicting data, fetches of nonexistent files, stale doc claims.

## SEVERITY
critical = broken page/build / security hole / data corruption; high = wrong results / leaked secret / major UX break; medium = real mismatch / dead feature / perf issue; low = minor inconsistency; trivial = typo/formatting/naming.
CATEGORY (one): bug | data-mismatch | discrepancy | security | performance | ui-ux | dead-code | stale-doc | config | a11y | style | other.

## HARD RULES
1. AUDIT ONLY — modify nothing.
2. Never print .env*, *adminsdk*, token/secret VALUES; existence/tracked-status only.
3. Known-issue docs (APP/SIH_AUDIT_REPORT.md, OUTER/ml_audit.md, OUTER/ui_ux_flaws.md, OUTER/CODEBASE_MAP.md) are hypotheses — re-verify against current code; wrong claims = stale-doc findings.
4. Paths relative to OUTER in findings.
5. Evidence mandatory: quote the offending line/value you saw.

## TOOLING
"[Fact-Forcing Gate]" on Bash => state in visible text: (1) request = exhaustive MuleGuard audit; (2) this command = <what yours does>; then retry SAME command. Tool errors "temporarily unavailable" => retry shortly; prefer Read/Grep/Glob (no classifier). Python = `python`.

## OUTPUT (StructuredOutput)
{domain, coverage (one line), findings:[{file, line:int, title (specific sentence), severity, category, detail (wrong + consequence), evidence (quoted), fix (concrete minimal fix)}]}
Include even trivial findings — only REAL, evidenced ones. Tag R1/R2/R3 at the start of each title.
