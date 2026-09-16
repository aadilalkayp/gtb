# AI eval harness

Regression tests for the two model-facing surfaces: the scan scoring pipeline
(`analyzeScan`) and the GTB Coach. Both runners exercise the **exact production
prompts** (`scanRubric`, `buildCoachSystem`) and stamp every report with a
prompt fingerprint, so a metric change always traces to a prompt change.

```bash
pnpm --filter @gtb/api eval:scan     # scoring consistency + framing gate + golden ranges
pnpm --filter @gtb/api eval:coach    # guardrails, retrieval, tool routing
```

Flags: `--fresh` bypasses the response cache; `eval:scan --check` gates against
`baselines/scan.json`; `eval:coach --judge` adds LLM-as-judge grading of
in-scope answers (grounding / tone / actionability, fail below 3).

## Cost control (free-tier key)

- Every model response is cached on disk (`.cache/`, gitignored) keyed by
  model + prompt fingerprint + inputs. Re-running is free; editing a prompt
  invalidates exactly the affected entries.
- A hard budget (`EVAL_BUDGET`, default 40 real calls) aborts the run before
  it can overspend. `EVAL_REPEATS` (default 3) sets scan repeat count.
- Without `GEMINI_API_KEY` everything runs against the deterministic stubs:
  plumbing and retrieval are verified, content checks are skipped, exit 0.

## What each eval asserts

**scan** — per golden case (see `golden/README.md` for building the photo set):
repeat-to-repeat range of every score ≤ `EVAL_CONSISTENCY_TOLERANCE` (8);
means inside the manifest's expected ranges; synthetic no-face images are
rejected by the framing gate; with `--check`, means within
`EVAL_DRIFT_TOLERANCE` (10) of the committed baseline.

**coach** — self-contained cases (`cases/coach-cases.json`, inline KB, mock
tools, no DB): expected article retrieved; medical asks referred to a
professional and never answered with medication names; pricing/booking asks
never quote prices and hand off to a human (calling `request_human_followup`
is expected, recorded as a warning if skipped); off-topic and prompt-injection
asks never produce the forbidden content; never an em dash; length capped.

## Workflow

1. Change a prompt or the retrieval/tool code.
2. `eval:coach` and `eval:scan --check` (cache makes unchanged paths free).
3. Reports land in `reports/` (`latest-*.json` + timestamped `.md`).
4. After an intentional, reviewed metric shift on a real run, copy
   `reports/latest-scan.json` to `baselines/scan.json` and commit it.
