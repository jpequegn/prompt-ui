#!/usr/bin/env bun
/**
 * pui generate — generate a React component from a natural-language prompt.
 *
 * Usage:
 *   bun run src/cli.ts generate "<prompt>" [--verbose] [--serve] [--build]
 *                                          [--max-attempts=N] [--threshold=0.8]
 *
 * Steps executed:
 *   1. Parse natural-language prompt → ComponentSpec  (issue #1)
 *   2. Run self-critique generation loop              (issue #4)
 *      - Generate component, evaluate against spec, retry with feedback if below threshold
 *   3. Write temp workspace + serve / build           (issue #3)
 *
 * Flags:
 *   --verbose          Print raw LLM responses.
 *   --serve            After generating, start a local dev server (default when no --build).
 *   --build            After generating, produce a static bundle in temp/dist.
 *   --max-attempts=N   Maximum generation attempts (default 3).
 *   --threshold=0.8    Minimum quality score to accept (default 0.8, range 0–1).
 */

import { parseSpec } from "./parseSpec.js";
import { GenerationLoop } from "./generationLoop.js";
import { Renderer } from "./renderer.js";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const wantBuild = args.includes("--build");
const wantServe = args.includes("--serve") || !wantBuild;

// Parse --max-attempts=N
const maxAttemptsArg = args.find((a) => a.startsWith("--max-attempts="));
const maxAttempts = maxAttemptsArg
  ? parseInt(maxAttemptsArg.split("=")[1] ?? "3", 10)
  : 3;

// Parse --threshold=0.8
const thresholdArg = args.find((a) => a.startsWith("--threshold="));
const threshold = thresholdArg
  ? parseFloat(thresholdArg.split("=")[1] ?? "0.8")
  : 0.8;

const filteredArgs = args.filter(
  (a) =>
    !["--verbose", "--serve", "--build"].includes(a) &&
    !a.startsWith("--max-attempts=") &&
    !a.startsWith("--threshold=")
);

const [command, prompt] = filteredArgs;

if (command !== "generate" || !prompt) {
  console.error(
    [
      'Usage: pui generate "<prompt>" [--verbose] [--serve] [--build] [--max-attempts=N] [--threshold=0.8]',
      "",
      "Examples:",
      '  pui generate "a login form with email, password, and a submit button that shows a spinner"',
      '  pui generate "a search bar with autocomplete" --build',
      '  pui generate "a product card" --serve --verbose',
      '  pui generate "a settings panel" --max-attempts=3 --threshold=0.9',
    ].join("\n")
  );
  process.exit(1);
}

console.log(`Parsing spec for: "${prompt}"\n`);

const spec = await parseSpec(prompt, verbose);

if (verbose) {
  console.log("── Parsed ComponentSpec ──────────────────────────────");
  console.log(JSON.stringify(spec, null, 2));
  console.log("──────────────────────────────────────────────────────\n");
} else {
  console.log("Parsed spec:");
  console.log(JSON.stringify(spec, null, 2));
}

console.log(
  `\nRunning generation loop (max ${maxAttempts} attempts, threshold ${threshold})…\n`
);

const loop = new GenerationLoop();
const result = await loop.run(spec, maxAttempts, threshold, verbose);

console.log("\n── Generation Summary ────────────────────────────────");
console.log(`Attempts made : ${result.attempts.length}`);
console.log(`Best score    : ${(result.evaluation.score * 100).toFixed(0)}%`);
console.log(`Passed        : ${result.passed ? "✅ yes" : "❌ no"}`);

if (result.evaluation.missing.length > 0) {
  console.log(`Still missing : ${result.evaluation.missing.join(", ")}`);
}

for (const attempt of result.attempts) {
  console.log(
    `  Attempt ${attempt.attemptNumber}: score=${(attempt.evaluation.score * 100).toFixed(0)}%` +
      (attempt.feedback ? " → retried" : "")
  );
}

if (verbose) {
  console.log("\n── Generated component ───────────────────────────────");
  console.log(result.code);
  console.log("──────────────────────────────────────────────────────\n");
}

// ── Renderer (issue #3) ───────────────────────────────────────────────────────

const renderer = new Renderer();
const tempDir = renderer.setup(result.code);
console.log(`\n✅ Temp workspace written to: ${tempDir}`);

if (wantBuild) {
  console.log("\nBuilding static bundle…");
  const distDir = await renderer.build();
  console.log(`✅ Bundle written to: ${distDir}`);
}

if (wantServe) {
  const url = await renderer.serve();
  console.log(`✅ Component served at: ${url}`);
  // Keep process alive until Ctrl+C
  await new Promise(() => {});
}
