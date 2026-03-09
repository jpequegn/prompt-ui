#!/usr/bin/env bun
/**
 * pui generate — generate a React component from a natural-language prompt.
 *
 * Usage:
 *   bun run src/cli.ts generate "<prompt>" [--verbose]
 *
 * Currently implemented:
 *   - Spec parsing (issue #1)
 *
 * Future steps (issues #2–#7):
 *   - Component generation
 *   - Vite rendering
 *   - Self-critique loop
 *   - Playwright eval
 */

import { parseSpec } from "./parseSpec.js";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const filteredArgs = args.filter((a) => a !== "--verbose");

const [command, prompt] = filteredArgs;

if (command !== "generate" || !prompt) {
  console.error(
    'Usage: pui generate "<prompt>" [--verbose]\n\nExample:\n  pui generate "a login form with email, password, and a submit button that shows a spinner" --verbose'
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
