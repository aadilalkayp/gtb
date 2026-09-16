# Golden photo set

Real photos for the scan eval live in this directory but are **never committed**
(the whole directory is gitignored except this README and `manifest.json`) —
they are photos of real people.

To build the set:

1. Drop photos here with the exact filenames referenced in `manifest.json`
   (e.g. `groom-baseline-front.jpg`). Use photos you have permission to use —
   your own are ideal.
2. Tighten the `expect` ranges after your first real run: run
   `pnpm --filter @gtb/api eval:scan`, read the per-case means in
   `evals/reports/latest-scan.json`, and set each range to roughly mean ± 10.
   That turns the eval from "sane output" into a real regression tripwire.
3. Commit the updated `manifest.json` (ranges only, never photos) and copy
   `reports/latest-scan.json` to `evals/baselines/scan.json` to enable
   `eval:scan --check` drift gating.

Cases whose photo files are missing are reported as `skipped`, so the two
synthetic framing cases always run — including in CI, where no photos exist.
