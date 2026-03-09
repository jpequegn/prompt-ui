import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ComponentSpec } from "./types.js";

const SYSTEM_PROMPT = `You are a UI component specification parser.
Your job is to analyse a natural-language description of a UI component and return a
structured JSON object that precisely captures the requirements.

Rules:
- component_name must be PascalCase and reflect the component purpose.
- elements: every distinct, visible UI element (inputs, buttons, labels, icons, etc.).
- interactions: dynamic behaviours (e.g. "show spinner on submit", "toggle password visibility").
- styling: a short phrase describing the overall layout/visual style (e.g. "standard form layout", "card with shadow").
- must_have: elements that are clearly required by the description.
- nice_to_have: elements mentioned as optional, secondary, or implied by a behaviour but not explicitly required.

Return ONLY a valid JSON object matching this TypeScript interface — no markdown fences, no extra text:
{
  "component_name": string,
  "elements": string[],
  "interactions": string[],
  "styling": string,
  "must_have": string[],
  "nice_to_have": string[]
}`;

const USER_MESSAGE = (prompt: string) =>
  `Parse this UI component description into a structured spec:\n\n"${prompt}"`;

/**
 * Call the LLM and return the raw text response.
 * Uses the Anthropic SDK when ANTHROPIC_API_KEY is set,
 * otherwise falls back to OpenRouter (OpenAI-compatible) via OPENROUTER_API_KEY.
 */
async function callLLM(prompt: string): Promise<string> {
  // ── Anthropic (direct) ────────────────────────────────────────────────
  if (process.env["ANTHROPIC_API_KEY"]) {
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: USER_MESSAGE(prompt) }],
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
      max_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: USER_MESSAGE(prompt) },
      ],
    });
    return completion.choices[0]?.message?.content ?? "";
  }

  throw new Error(
    "No API key found. Set ANTHROPIC_API_KEY or OPENROUTER_API_KEY."
  );
}

/**
 * Parse a natural-language UI prompt into a structured ComponentSpec.
 *
 * @param prompt  - The raw natural-language description from the user.
 * @param verbose - When true, print the raw LLM response to stdout.
 * @returns       A fully typed ComponentSpec object.
 */
export async function parseSpec(
  prompt: string,
  verbose = false
): Promise<ComponentSpec> {
  const rawText = await callLLM(prompt);

  if (verbose) {
    console.log("\n── Raw LLM response ──────────────────────────────────");
    console.log(rawText);
    console.log("──────────────────────────────────────────────────────\n");
  }

  // Strip potential markdown fences in case the model adds them anyway
  const jsonText = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let spec: ComponentSpec;
  try {
    spec = JSON.parse(jsonText) as ComponentSpec;
  } catch (err) {
    throw new Error(
      `Failed to parse LLM response as JSON.\nRaw response:\n${rawText}\nError: ${String(err)}`
    );
  }

  // Basic structural validation
  const requiredKeys: Array<keyof ComponentSpec> = [
    "component_name",
    "elements",
    "interactions",
    "styling",
    "must_have",
    "nice_to_have",
  ];
  for (const key of requiredKeys) {
    if (!(key in spec)) {
      throw new Error(`Parsed spec is missing required field: "${key}"`);
    }
  }

  return spec;
}
