#!/usr/bin/env bun
/**
 * eval/run.ts — Run all 10 eval prompts through the full pipeline.
 *
 * For each prompt:
 *   1. Parse the natural-language prompt → ComponentSpec
 *   2. Run the GenerationLoop (up to 3 attempts, threshold 0.8)
 *   3. Record: attempts needed, final score, time taken
 *   4. Save the best component to eval/components/<name>.tsx
 *   5. Write eval/results.json with all metrics
 *   6. Print a RESULTS.md summary to stdout (also written to repo root)
 *
 * Usage:
 *   bun run eval/run.ts [--verbose]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import prompts from "./prompts.json";
import { parseSpec } from "../src/parseSpec.js";
import { GenerationLoop } from "../src/generationLoop.js";
import { evaluateComponent } from "../src/evaluateComponent.js";
import type { ComponentSpec } from "../src/types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PromptEntry {
  id: number;
  name: string;
  prompt: string;
  must_have: string[];
}

interface ComponentResult {
  id: number;
  name: string;
  prompt: string;
  /** Milliseconds taken for the full pipeline */
  timeTakenMs: number;
  /** Number of generation attempts made */
  attemptsNeeded: number;
  /** Final best score (0–1) */
  finalScore: number;
  /** Whether the component passed the 0.8 threshold */
  passed: boolean;
  /** Elements present in final code */
  present: string[];
  /** Elements still missing from final code */
  missing: string[];
  /** Path where the component was saved */
  savedTo: string;
  /** Error message if the pipeline threw */
  error: string | null;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

const VERBOSE = process.argv.includes("--verbose");
const MAX_ATTEMPTS = 3;
const THRESHOLD = 0.8;

const evalDir = path.resolve(import.meta.dir);
const componentsDir = path.join(evalDir, "components");
fs.mkdirSync(componentsDir, { recursive: true });

// ── Pipeline for a single prompt ──────────────────────────────────────────────

async function runOne(entry: PromptEntry): Promise<ComponentResult> {
  const startMs = Date.now();
  const savedTo = path.join(componentsDir, `${entry.name}.tsx`);

  try {
    if (VERBOSE) {
      console.log(`\n${"═".repeat(60)}`);
      console.log(`[${entry.id}/10] ${entry.name}`);
      console.log(`Prompt: "${entry.prompt}"`);
      console.log("═".repeat(60));
    } else {
      process.stdout.write(`[${entry.id}/10] ${entry.name.padEnd(22)} `);
    }

    // ── Step 1: parse spec ────────────────────────────────────────────────
    const rawSpec = await parseSpec(entry.prompt, VERBOSE);

    // Merge the eval's must_have into the parsed spec so the evaluator
    // checks the exact items listed in prompts.json.
    const spec: ComponentSpec = {
      ...rawSpec,
      must_have: [
        ...new Set([...rawSpec.must_have, ...entry.must_have]),
      ],
    };

    // ── Step 2: generation loop ───────────────────────────────────────────
    const loop = new GenerationLoop();
    const result = await loop.run(spec, MAX_ATTEMPTS, THRESHOLD, VERBOSE);

    // ── Step 3: re-evaluate against the eval's must_have list ────────────
    // (The loop evaluated against the merged spec; we use that result directly)
    const evalSpec: ComponentSpec = {
      ...spec,
      elements: [...new Set([...spec.elements, ...entry.must_have])],
    };
    const finalEval = evaluateComponent(result.code, evalSpec);

    const timeTakenMs = Date.now() - startMs;
    const attemptsNeeded = result.attempts.length;
    const finalScore = finalEval.score;
    const passed = finalScore >= THRESHOLD;

    // ── Step 4: save component ─────────────────────────────────────────────
    fs.writeFileSync(savedTo, result.code, "utf-8");

    if (!VERBOSE) {
      const icon = passed ? "✅" : "❌";
      console.log(
        `${icon}  score=${(finalScore * 100).toFixed(0).padStart(3)}%  ` +
          `attempts=${attemptsNeeded}  ` +
          `time=${(timeTakenMs / 1000).toFixed(1)}s`
      );
    }

    return {
      id: entry.id,
      name: entry.name,
      prompt: entry.prompt,
      timeTakenMs,
      attemptsNeeded,
      finalScore,
      passed,
      present: finalEval.present,
      missing: finalEval.missing,
      savedTo: path.relative(path.resolve("."), savedTo),
      error: null,
    };
  } catch (err) {
    const timeTakenMs = Date.now() - startMs;
    const message = err instanceof Error ? err.message : String(err);

    if (!VERBOSE) {
      console.log(`💥  ERROR: ${message.slice(0, 80)}`);
    } else {
      console.error(`\n[${entry.id}/10] ${entry.name} FAILED:\n${message}`);
    }

    return {
      id: entry.id,
      name: entry.name,
      prompt: entry.prompt,
      timeTakenMs,
      attemptsNeeded: 0,
      finalScore: 0,
      passed: false,
      present: [],
      missing: entry.must_have,
      savedTo,
      error: message,
    };
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("prompt-ui eval — 10 diverse component prompts");
console.log(`${"─".repeat(60)}`);
console.log(`Config: maxAttempts=${MAX_ATTEMPTS}, threshold=${THRESHOLD}`);
console.log(`${"─".repeat(60)}\n`);

const allResults: ComponentResult[] = [];

for (const entry of prompts as PromptEntry[]) {
  const result = await runOne(entry);
  allResults.push(result);
}

// ── Write results.json ────────────────────────────────────────────────────────

const resultsPath = path.join(evalDir, "results.json");
fs.writeFileSync(resultsPath, JSON.stringify(allResults, null, 2), "utf-8");
console.log(`\n✅ Results saved to: ${resultsPath}`);

// ── Compute summary stats ─────────────────────────────────────────────────────

const passed = allResults.filter((r) => r.passed);
const failed = allResults.filter((r) => !r.passed);
const totalTime = allResults.reduce((s, r) => s + r.timeTakenMs, 0);
const avgScore =
  allResults.reduce((s, r) => s + r.finalScore, 0) / allResults.length;
const avgAttempts =
  allResults.reduce((s, r) => s + r.attemptsNeeded, 0) / allResults.length;

// ── Generate RESULTS.md ───────────────────────────────────────────────────────

const scoreTable = allResults
  .map((r) => {
    const icon = r.passed ? "✅" : "❌";
    const score = `${(r.finalScore * 100).toFixed(0)}%`;
    const time = `${(r.timeTakenMs / 1000).toFixed(1)}s`;
    const missing =
      r.missing.length > 0 ? r.missing.join(", ") : "—";
    return (
      `| ${r.id} | ${r.name.padEnd(22)} | ${score.padStart(5)} | ` +
      `${r.attemptsNeeded} | ${time.padStart(7)} | ${icon} | ${missing} |`
    );
  })
  .join("\n");

// Identify patterns in failures
const failurePatterns: string[] = [];
if (failed.length > 0) {
  const multiAttemptFails = failed.filter((r) => r.attemptsNeeded > 1);
  const firstAttemptFails = failed.filter((r) => r.attemptsNeeded === 1);
  const errors = failed.filter((r) => r.error !== null);

  if (errors.length > 0) {
    failurePatterns.push(
      `- **Pipeline errors** (${errors.length}): ${errors.map((r) => r.name).join(", ")} — check API key / network.`
    );
  }
  if (firstAttemptFails.length > 0) {
    const commonMissing = firstAttemptFails
      .flatMap((r) => r.missing)
      .reduce<Record<string, number>>((acc, m) => {
        acc[m] = (acc[m] ?? 0) + 1;
        return acc;
      }, {});
    const top = Object.entries(commonMissing)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `"${k}" (${v}×)`)
      .join(", ");
    failurePatterns.push(
      `- **Missed on first attempt** (${firstAttemptFails.length}): most common missing elements — ${top}.`
    );
  }
  if (multiAttemptFails.length > 0) {
    failurePatterns.push(
      `- **Retry did not recover** (${multiAttemptFails.length}): ${multiAttemptFails.map((r) => r.name).join(", ")} — feedback loop was insufficient.`
    );
  }
} else {
  failurePatterns.push("- No failures — all components passed the 0.8 threshold. 🎉");
}

const passingComponents = passed.map((r) => r.name).join(", ") || "none";
const failingComponents = failed.map((r) => r.name).join(", ") || "none";

const markdown = `# Eval Results — 10 Diverse Component Prompts

**Run date**: ${new Date().toISOString().slice(0, 10)}
**Config**: maxAttempts=${MAX_ATTEMPTS}, threshold=${THRESHOLD}, model=claude-opus-4-5

## Summary

| Metric | Value |
|--------|-------|
| Components passing (≥80%) | **${passed.length} / 10** |
| Average final score | **${(avgScore * 100).toFixed(1)}%** |
| Average attempts per component | **${avgAttempts.toFixed(2)}** |
| Total eval time | **${(totalTime / 1000).toFixed(1)}s** |
| Acceptance criteria (≥7/10 at 0.8+) | ${passed.length >= 7 ? "✅ PASSED" : "❌ FAILED"} |

## Score per component

| # | Component | Score | Attempts | Time | Pass | Missing elements |
|---|-----------|------:|---------:|-----:|------|-----------------|
${scoreTable}

## Passing components

${passingComponents}

## Failing components

${failingComponents}

## Patterns in failures

${failurePatterns.join("\n")}

## Notes

- Scoring uses the \`evaluateComponent\` function: \`must_have\` items weighted ×2, \`elements\` weighted ×1.
- Matching is token-based and lenient (any significant word from the phrase found in code).
- Components are saved to \`eval/components/<Name>.tsx\`.
- Raw metrics in \`eval/results.json\`.
`;

const resultsMarkdownPath = path.resolve("RESULTS.md");
fs.writeFileSync(resultsMarkdownPath, markdown, "utf-8");
console.log(`✅ RESULTS.md written to: ${resultsMarkdownPath}`);

// ── Print summary to stdout ───────────────────────────────────────────────────

console.log("\n" + "═".repeat(60));
console.log("EVAL SUMMARY");
console.log("═".repeat(60));
console.log(`Passing (≥80%): ${passed.length} / 10`);
console.log(`Average score : ${(avgScore * 100).toFixed(1)}%`);
console.log(`Avg attempts  : ${avgAttempts.toFixed(2)}`);
console.log(`Total time    : ${(totalTime / 1000).toFixed(1)}s`);
console.log(
  `Acceptance    : ${passed.length >= 7 ? "✅ PASSED (≥7/10)" : "❌ FAILED (<7/10)"}`
);
console.log("═".repeat(60));

process.exit(passed.length >= 7 ? 0 : 1);
