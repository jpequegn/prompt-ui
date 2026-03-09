import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ComponentSpec } from "./types.js";
import { evaluateComponent, buildFeedbackMessage } from "./evaluateComponent.js";
import type { EvaluationResult } from "./evaluateComponent.js";
import { extractCodeBlock } from "./generateComponent.js";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Details for a single generation attempt.
 */
export interface Attempt {
  /** 1-based attempt number. */
  attemptNumber: number;
  /** Raw generated component source code. */
  code: string;
  /** Evaluation of this attempt against the spec. */
  evaluation: EvaluationResult;
  /** The feedback message that was (or would be) sent to the next attempt. */
  feedback: string | null;
}

/**
 * The final result returned by GenerationLoop.run().
 */
export interface GenerationResult {
  /** The best component code across all attempts (highest score). */
  code: string;
  /** Evaluation of the best attempt. */
  evaluation: EvaluationResult;
  /** All attempts made during the loop, in order. */
  attempts: Attempt[];
  /** Whether the final result meets the threshold. */
  passed: boolean;
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert React component generator.
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

// ── Prompt builders ───────────────────────────────────────────────────────────

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

// ── LLM call ──────────────────────────────────────────────────────────────────

async function callLLM(messages: Array<{ role: "user" | "assistant"; content: string }>): Promise<string> {
  // ── Anthropic (direct) ────────────────────────────────────────────────
  if (process.env["ANTHROPIC_API_KEY"]) {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages,
    });
    return response.content[0]?.type === "text" ? response.content[0].text : "";
  }

  // ── OpenRouter (OpenAI-compatible proxy) ──────────────────────────────
  if (process.env["OPENROUTER_API_KEY"]) {
    const client = new OpenAI({
      apiKey: process.env["OPENROUTER_API_KEY"],
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/jpequegn/prompt-ui",
        "X-Title": "prompt-ui",
      },
    });
    const completion = await client.chat.completions.create({
      model: "anthropic/claude-opus-4-5",
      max_tokens: 4096,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages,
      ],
    });
    return completion.choices[0]?.message?.content ?? "";
  }

  throw new Error(
    "No API key found. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY."
  );
}

// ── GenerationLoop ────────────────────────────────────────────────────────────

/**
 * Orchestrates a self-critique loop for component generation:
 *
 *  attempt 1 → evaluate → if score < threshold → build feedback → retry
 *  attempt 2 → evaluate → if score ≥ threshold → done
 *  …up to max_attempts times
 *
 * Always returns the best attempt (highest score) even if no attempt passes.
 */
export class GenerationLoop {
  /**
   * Run the generation loop.
   *
   * @param spec         - ComponentSpec to generate from.
   * @param maxAttempts  - Maximum number of generation attempts (default 3).
   * @param threshold    - Score threshold required to stop early (default 0.8).
   * @param verbose      - When true, log progress to stdout.
   * @returns            A GenerationResult with the best code across all attempts.
   */
  async run(
    spec: ComponentSpec,
    maxAttempts = 3,
    threshold = 0.8,
    verbose = false
  ): Promise<GenerationResult> {
    const attempts: Attempt[] = [];
    let bestAttempt: Attempt | null = null;

    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
      if (verbose) {
        console.log(`\n── Attempt ${attemptNumber} / ${maxAttempts} ────────────────────────────`);
      }

      // ── Build the prompt ───────────────────────────────────────────────
      let userMessage: string;
      const prevAttempt = attempts[attempts.length - 1];
      if (attemptNumber === 1 || !prevAttempt) {
        userMessage = buildInitialUserMessage(spec);
      } else {
        const feedback = buildFeedbackMessage(prevAttempt.evaluation, prevAttempt.attemptNumber);
        userMessage = buildRetryUserMessage(spec, feedback);
      }

      // ── Call the LLM ───────────────────────────────────────────────────
      const messages: Array<{ role: "user" | "assistant"; content: string }> = [
        { role: "user", content: userMessage },
      ];

      const raw = await callLLM(messages);

      if (verbose) {
        console.log("Raw LLM response:");
        console.log(raw.slice(0, 500) + (raw.length > 500 ? "\n…(truncated)" : ""));
      }

      // ── Extract and evaluate ───────────────────────────────────────────
      const code = extractCodeBlock(raw);
      const evaluation = evaluateComponent(code, spec);

      if (verbose) {
        console.log(
          `Score: ${(evaluation.score * 100).toFixed(0)}%  ` +
          `(present: ${evaluation.present.length}, missing: ${evaluation.missing.length})`
        );
        if (evaluation.missing.length > 0) {
          console.log(`Missing: ${evaluation.missing.join(", ")}`);
        }
      }

      // ── Build feedback for potential next attempt ──────────────────────
      const feedback =
        attemptNumber < maxAttempts && evaluation.score < threshold
          ? buildFeedbackMessage(evaluation, attemptNumber)
          : null;

      const attempt: Attempt = {
        attemptNumber,
        code,
        evaluation,
        feedback,
      };
      attempts.push(attempt);

      // ── Track best attempt ─────────────────────────────────────────────
      if (bestAttempt === null || evaluation.score > bestAttempt.evaluation.score) {
        bestAttempt = attempt;
      }

      // ── Early exit if threshold met ────────────────────────────────────
      if (evaluation.score >= threshold) {
        if (verbose) {
          console.log(
            `✅ Threshold met on attempt ${attemptNumber} — score ${(evaluation.score * 100).toFixed(0)}% ≥ ${(threshold * 100).toFixed(0)}%`
          );
        }
        break;
      }

      // ── Log retry info ─────────────────────────────────────────────────
      if (verbose && attemptNumber < maxAttempts) {
        console.log(
          `⚠️  Score ${(evaluation.score * 100).toFixed(0)}% below threshold ${(threshold * 100).toFixed(0)}% — regenerating with feedback`
        );
      }
    }

    // bestAttempt is always set because maxAttempts ≥ 1
    const best = bestAttempt!;

    return {
      code: best.code,
      evaluation: best.evaluation,
      attempts,
      passed: best.evaluation.score >= threshold,
    };
  }
}
