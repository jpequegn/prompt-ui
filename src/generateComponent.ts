import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ComponentSpec } from "./types.js";

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

// ── User message ──────────────────────────────────────────────────────────────

const USER_MESSAGE = (spec: ComponentSpec): string => `
Generate a React component from this specification:

Component name: ${spec.component_name}

Elements: ${spec.elements.join(", ")}
Interactions: ${spec.interactions.length ? spec.interactions.join(", ") : "none"}
Styling: ${spec.styling}
Must have: ${spec.must_have.join(", ")}
Nice to have: ${spec.nice_to_have.length ? spec.nice_to_have.join(", ") : "none"}

Produce a single-file TypeScript React component following the system prompt rules exactly.
`.trim();

// ── Code extraction ───────────────────────────────────────────────────────────

/**
 * Strip ```tsx … ``` (or ```ts / ```jsx / ```) fences from the LLM response.
 * Returns only the code inside the fence, or the raw text if no fence is found.
 */
export function extractCodeBlock(raw: string): string {
  // Match optional language tag after the opening fence
  const fenceMatch = raw.match(/```(?:tsx?|jsx?)?\s*\n([\s\S]*?)```/);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }
  // Fallback: return trimmed raw text
  return raw.trim();
}

// ── Syntax heuristics ─────────────────────────────────────────────────────────

/**
 * Very lightweight check for obvious structural issues.
 * Returns an array of problem descriptions (empty → looks OK).
 */
export function detectSyntaxIssues(code: string): string[] {
  const issues: string[] = [];

  // Unbalanced JSX angle brackets (rough check via tag counting)
  const openTags = (code.match(/<[A-Za-z][A-Za-z0-9]*/g) ?? []).length;
  const closeTags = (code.match(/<\/[A-Za-z]/g) ?? []).length;
  const selfClose = (code.match(/\/>/g) ?? []).length;
  // Each open tag is either self-closed or has a closing tag
  if (openTags > closeTags + selfClose + 5) {
    issues.push(
      `Likely missing closing tags (open=${openTags}, close=${closeTags}, self=${selfClose})`
    );
  }

  // Unbalanced curly braces
  const opens = (code.match(/\{/g) ?? []).length;
  const closes = (code.match(/\}/g) ?? []).length;
  if (Math.abs(opens - closes) > 2) {
    issues.push(`Unbalanced curly braces (open=${opens}, close=${closes})`);
  }

  // Must have a default export
  if (!/export\s+default\s+/.test(code)) {
    issues.push("Missing default export");
  }

  return issues;
}

// ── LLM call ─────────────────────────────────────────────────────────────────

async function callLLM(spec: ComponentSpec): Promise<string> {
  const userMsg = USER_MESSAGE(spec);

  // ── Anthropic (direct) ────────────────────────────────────────────────
  if (process.env["ANTHROPIC_API_KEY"]) {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    });
    return message.content[0]?.type === "text" ? message.content[0].text : "";
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
        { role: "user", content: userMsg },
      ],
    });
    return completion.choices[0]?.message?.content ?? "";
  }

  throw new Error(
    "No API key found. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY."
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a complete, renderable React component string from a ComponentSpec.
 *
 * - Calls Claude with a strict system prompt (single-file, TS, Tailwind, no imports).
 * - Extracts the code block from the response.
 * - Retries once if obvious syntax issues are detected.
 *
 * @param spec    - Structured component specification (from parseSpec).
 * @param verbose - When true, logs raw LLM responses to stdout.
 * @returns       The TypeScript React component source code as a string.
 */
export async function generateComponent(
  spec: ComponentSpec,
  verbose = false
): Promise<string> {
  // ── First attempt ─────────────────────────────────────────────────────
  const raw1 = await callLLM(spec);

  if (verbose) {
    console.log("\n── Raw LLM response (attempt 1) ──────────────────────");
    console.log(raw1);
    console.log("──────────────────────────────────────────────────────\n");
  }

  const code1 = extractCodeBlock(raw1);
  const issues1 = detectSyntaxIssues(code1);

  if (issues1.length === 0) {
    return code1;
  }

  // ── Retry ─────────────────────────────────────────────────────────────
  console.warn(
    `⚠️  Syntax issues detected on attempt 1 — retrying:\n  ${issues1.join("\n  ")}`
  );

  const retrySpec: ComponentSpec = {
    ...spec,
    // Append a note so the model understands what went wrong
    nice_to_have: [
      ...spec.nice_to_have,
      `(Previous attempt had issues: ${issues1.join("; ")} — please fix)`,
    ],
  };

  const raw2 = await callLLM(retrySpec);

  if (verbose) {
    console.log("\n── Raw LLM response (attempt 2 / retry) ─────────────");
    console.log(raw2);
    console.log("──────────────────────────────────────────────────────\n");
  }

  const code2 = extractCodeBlock(raw2);
  const issues2 = detectSyntaxIssues(code2);

  if (issues2.length > 0) {
    console.warn(
      `⚠️  Syntax issues still present after retry:\n  ${issues2.join("\n  ")}`
    );
  }

  return code2;
}
