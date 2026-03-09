#!/usr/bin/env bun
/**
 * pui — CLI for prompt-ui component generation.
 *
 * Usage:
 *   pui generate '<prompt>' [options]
 *
 * Options:
 *   --no-eval            Skip Playwright evaluation (faster iteration).
 *   --max-attempts=N     Maximum generation attempts (default: 3).
 *   --threshold=0.8      Minimum score to accept (default: 0.8).
 *   --output=<dir>       Output directory (default: output).
 *
 * Examples:
 *   pui generate 'a data table with sortable columns and pagination'
 *   pui generate 'a login form' --no-eval
 *   pui generate 'a product card' --max-attempts=2 --threshold=0.9
 */

import { defineCommand, runMain } from "citty";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { mkdirSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type { ComponentSpec } from "./types.js";
import { parseSpec } from "./parseSpec.js";
import { extractCodeBlock } from "./generateComponent.js";
import { buildFeedbackMessage, evaluateComponent } from "./evaluateComponent.js";
import { Renderer } from "./renderer.js";
import { Evaluator } from "./evaluator.js";

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

/** Print a status line. */
function printStatus(label: string, detail: string): void {
  const padded = label.padEnd(24);
  process.stdout.write(`${DIM}#${RESET} ${padded} ${detail}\n`);
}

/** Move one line up and rewrite the status line. */
function updateStatus(label: string, detail: string): void {
  process.stdout.write(`\x1b[1A\r\x1b[K${DIM}#${RESET} ${label.padEnd(24)} ${detail}\n`);
}

function ok(msg: string): string {
  return `${GREEN}✓${RESET} ${msg}`;
}

// ── System prompt for component generation ────────────────────────────────────

const GENERATION_SYSTEM_PROMPT = `You are an expert React component generator.
Your job is to turn a structured UI component specification into a complete, working React component.

Rules (MUST follow all of them):
1. Single file — no import statements whatsoever (not even React). The component will be
   executed in a scope where React is already available as a global.
2. Use Tailwind CSS utility classes for ALL styling — no inline style objects, no CSS files.
3. TypeScript with explicit prop types (define a Props interface or type alias).
4. The component must render without runtime errors.
5. Use a named export AND a default export for the component.
6. Do NOT include any import or require statements.
7. Do NOT include any export { } named-export lists at the bottom — only inline exports.
8. Wrap the entire output in a single \`\`\`tsx code fence — nothing outside the fence.

Output format:
\`\`\`tsx
// component code here
\`\`\``;

function buildInitialUserMessage(spec: ComponentSpec): string {
  return `Generate a React component from this specification:

Component name: ${spec.component_name}

Elements: ${spec.elements.join(", ")}
Interactions: ${spec.interactions.length ? spec.interactions.join(", ") : "none"}
Styling: ${spec.styling}
Must have: ${spec.must_have.join(", ")}
Nice to have: ${spec.nice_to_have.length ? spec.nice_to_have.join(", ") : "none"}

Produce a single-file TypeScript React component following the system prompt rules exactly.`.trim();
}

function buildRetryUserMessage(spec: ComponentSpec, feedback: string): string {
  return `${buildInitialUserMessage(spec)}

---

IMPORTANT — FEEDBACK FROM PREVIOUS ATTEMPT:
${feedback}

Please address all of the above before producing your answer.`.trim();
}

// ── Streaming LLM call ────────────────────────────────────────────────────────

/**
 * Call Claude with streaming and invoke onChunk for each text delta.
 * Returns the full accumulated response text.
 */
async function callLLMStreaming(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  onChunk: (text: string) => void
): Promise<string> {
  if (!process.env["ANTHROPIC_API_KEY"]) {
    throw new Error(
      "ANTHROPIC_API_KEY is required. Set it in your environment or a .env file."
    );
  }

  const client = new Anthropic();
  let fullText = "";

  const stream = client.messages.stream({
    model: "claude-opus-4-5",
    max_tokens: 4096,
    system: GENERATION_SYSTEM_PROMPT,
    messages,
  });

  for await (const event of stream) {
    if (
      event.type === "content_block_delta" &&
      event.delta.type === "text_delta"
    ) {
      const chunk = event.delta.text;
      fullText += chunk;
      onChunk(chunk);
    }
  }

  return fullText;
}

// ── Inline server for evaluation (no side-effects on Renderer singleton) ───────

/**
 * Spin up a temporary Bun HTTP server that serves the component bundle.
 * Returns the URL and a stop function.
 */
async function serveComponent(
  renderer: Renderer,
  code: string,
  port: number
): Promise<{ url: string; stop: () => void }> {
  const tempDir = renderer.setup(code);
  const srcDir = path.join(tempDir, "src");
  const entrypoint = path.join(srcDir, "main.tsx");

  const server = Bun.serve({
    port,
    async fetch(req) {
      const { pathname } = new URL(req.url);

      if (pathname === "/" || pathname === "/index.html") {
        const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>prompt-ui preview</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/bundle.js"></script>
  </body>
</html>`;
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      if (pathname === "/bundle.js") {
        const result = await Bun.build({
          entrypoints: [entrypoint],
          target: "browser",
          format: "esm",
          define: { "process.env.NODE_ENV": JSON.stringify("development") },
        });
        if (!result.success) {
          const msg = result.logs.map((l) => l.message).join("\n");
          return new Response(`console.error(${JSON.stringify(msg)})`, {
            headers: { "Content-Type": "application/javascript" },
          });
        }
        const output = result.outputs[0];
        if (!output) {
          return new Response("// no output", {
            headers: { "Content-Type": "application/javascript" },
          });
        }
        return new Response(await output.text(), {
          headers: { "Content-Type": "application/javascript; charset=utf-8" },
        });
      }

      return new Response("Not found", { status: 404 });
    },
  });

  const url = `http://localhost:${server.port}`;
  return { url, stop: () => server.stop() };
}

// ── generate command ──────────────────────────────────────────────────────────

const generateCmd = defineCommand({
  meta: {
    name: "generate",
    description: "Generate a React component from a natural-language prompt.",
  },
  args: {
    prompt: {
      type: "positional",
      description: "Natural-language description of the component to generate.",
      required: true,
    },
    eval: {
      type: "boolean",
      description: "Run Playwright evaluation. Use --no-eval to skip.",
      default: true,
    },
    "max-attempts": {
      type: "string",
      description: "Maximum generation/retry attempts (default: 3).",
      default: "3",
    },
    threshold: {
      type: "string",
      description: "Minimum score to accept (default: 0.8).",
      default: "0.8",
    },
    output: {
      type: "string",
      description: "Output directory for .tsx and .png files (default: output).",
      default: "output",
    },
  },

  async run({ args }) {
    const prompt = args.prompt as string;
    const runEval = args.eval !== false;
    const maxAttempts = Math.max(1, parseInt(args["max-attempts"] as string, 10) || 3);
    const threshold = parseFloat(args.threshold as string) || 0.8;
    const outputDir = path.resolve(process.cwd(), args.output as string);

    console.log(
      `\n${BOLD}${CYAN}pui generate${RESET}  ${DIM}»${RESET}  ${prompt}\n`
    );

    // ── Step 1: Parse spec ─────────────────────────────────────────────────
    printStatus("Parsing spec...", `${DIM}thinking...${RESET}`);
    let spec: ComponentSpec;
    try {
      spec = await parseSpec(prompt);
    } catch (err) {
      updateStatus("Parsing spec...", `${YELLOW}✗ failed${RESET}`);
      console.error(`\nError parsing spec:\n${String(err)}`);
      process.exit(1);
    }

    const elementCount = spec.elements.length;
    const interactionCount = spec.interactions.length;
    updateStatus(
      "Parsing spec...",
      ok(`${elementCount} elements, ${interactionCount} interactions`)
    );

    // ── Generation + eval loop ─────────────────────────────────────────────
    let bestCode = "";
    let bestScore = 0;
    let bestScreenshot: Buffer | undefined;
    let passedThreshold = false;
    let lastEvalLabel = "";

    // Port base — use a different port per attempt to avoid EADDRINUSE
    const BASE_PORT = 5173;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // ── Generate (with streaming) ────────────────────────────────────────
      const genLabel =
        attempt === 1 ? "Generating code..." : `Retrying (attempt ${attempt})...`;
      printStatus(genLabel, `${DIM}streaming...${RESET}`);

      let userMessage: string;
      if (attempt === 1 || bestCode === "") {
        userMessage = buildInitialUserMessage(spec);
      } else {
        const prevEval = evaluateComponent(bestCode, spec);
        const feedback = buildFeedbackMessage(prevEval, attempt - 1);
        userMessage = buildRetryUserMessage(spec, feedback);
      }

      const messages: Array<{ role: "user" | "assistant"; content: string }> = [
        { role: "user", content: userMessage },
      ];

      let charCount = 0;
      let raw = "";
      try {
        raw = await callLLMStreaming(messages, (chunk) => {
          charCount += chunk.length;
          process.stdout.write(
            `\x1b[1A\r\x1b[K${DIM}#${RESET} ${genLabel.padEnd(24)} ${DIM}streaming... ${charCount} chars${RESET}\n`
          );
        });
      } catch (err) {
        updateStatus(genLabel, `${YELLOW}✗ LLM error${RESET}`);
        console.error(`\nError calling Claude:\n${String(err)}`);
        process.exit(1);
      }

      const code = extractCodeBlock(raw);
      updateStatus(genLabel, ok(`${charCount} chars streamed`));

      // ── Render ────────────────────────────────────────────────────────────
      printStatus("Rendering...", `${DIM}building bundle...${RESET}`);
      const renderer = new Renderer();
      const port = BASE_PORT + attempt - 1;
      let serveUrl: string;
      let stopServer: () => void;

      try {
        ({ url: serveUrl, stop: stopServer } = await serveComponent(renderer, code, port));
      } catch (err) {
        updateStatus("Rendering...", `${YELLOW}✗ render error${RESET}`);
        console.error(`\nError rendering component:\n${String(err)}`);
        // Keep best code and exit loop
        if (bestCode === "") bestCode = code;
        break;
      }
      updateStatus("Rendering...", ok(serveUrl));

      // ── Evaluate ──────────────────────────────────────────────────────────
      if (!runEval) {
        lastEvalLabel = "Evaluating...";
        printStatus(lastEvalLabel, `${DIM}skipped (--no-eval)${RESET}`);
        bestCode = code;
        bestScore = 1.0;
        passedThreshold = true;
        stopServer();
        break;
      }

      lastEvalLabel = "Evaluating...";
      printStatus(lastEvalLabel, `${DIM}launching browser...${RESET}`);
      const evalInstance = new Evaluator();
      try {
        const evalResult = await evalInstance.run(serveUrl, spec);
        await evalInstance.close();

        const found = evalResult.checks.filter((c) => c.found).length;
        const total = evalResult.checks.length;
        const score = evalResult.score;

        updateStatus(
          lastEvalLabel,
          ok(
            `${found}/${total} elements found ${DIM}(score: ${score.toFixed(2)})${RESET}`
          )
        );

        if (score > bestScore || bestCode === "") {
          bestScore = score;
          bestCode = code;
          bestScreenshot = Buffer.from(evalResult.screenshot);
        }

        stopServer();

        if (score >= threshold) {
          passedThreshold = true;
          break;
        }
      } catch (err) {
        updateStatus(lastEvalLabel, `${YELLOW}✗ eval error${RESET}`);
        console.error(`\nError during evaluation:\n${String(err)}`);
        if (bestCode === "") bestCode = code;
        stopServer();
        break;
      }
    }

    // ── Save outputs ─────────────────────────────────────────────────────────
    printStatus("Saving...", `${DIM}writing files...${RESET}`);
    mkdirSync(outputDir, { recursive: true });

    // Derive filename from component name
    const componentFilename =
      (spec.component_name ?? "Component").replace(/[^A-Za-z0-9]/g, "") || "Component";
    const tsxPath = path.join(outputDir, `${componentFilename}.tsx`);
    const pngPath = path.join(outputDir, `${componentFilename}.png`);

    await fs.writeFile(tsxPath, bestCode, "utf-8");
    updateStatus("Saving...", ok(`output/${componentFilename}.tsx`));

    if (bestScreenshot && runEval) {
      await fs.writeFile(pngPath, bestScreenshot);
      printStatus("Screenshot:", `output/${componentFilename}.png`);
    }

    // ── Final summary ─────────────────────────────────────────────────────────
    if (!runEval) {
      console.log(`\n${GREEN}✓ Done.${RESET} (eval skipped)\n`);
    } else {
      const scoreStr = `${(bestScore * 100).toFixed(0)}%`;
      if (passedThreshold) {
        console.log(
          `\n${GREEN}✓ Done.${RESET} Score: ${BOLD}${scoreStr}${RESET}\n`
        );
      } else {
        console.log(
          `\n${YELLOW}⚠ Done.${RESET} Score: ${BOLD}${scoreStr}${RESET}` +
            ` ${DIM}(below threshold ${(threshold * 100).toFixed(0)}%)${RESET}\n`
        );
      }
    }
  },
});

// ── Root command ──────────────────────────────────────────────────────────────

const main = defineCommand({
  meta: {
    name: "pui",
    version: "0.1.0",
    description: "prompt-ui — generate React components from natural language.",
  },
  subCommands: {
    generate: generateCmd,
  },
});

runMain(main);
