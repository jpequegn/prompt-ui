import type { ComponentSpec } from "./types.js";

/**
 * The result of evaluating a generated component against its spec.
 */
export interface EvaluationResult {
  /** Fraction of must-have + element requirements present in the code (0–1). */
  score: number;
  /** Elements / requirements from the spec that appear to be absent. */
  missing: string[];
  /** Elements / requirements that were found in the code. */
  present: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise a spec keyword into a list of search tokens.
 * "password input" → ["password", "input"] (short words like "a" are dropped)
 */
function tokenise(phrase: string): string[] {
  return phrase
    .toLowerCase()
    .split(/[\s\-_/]+/)
    .filter((t) => t.length > 2);
}

/**
 * Return true when at least one token from the phrase is present in the code.
 * We keep the matching deliberately lenient: if any significant word from the
 * phrase appears in the (lower-cased) code, we count the element as present.
 */
function presentInCode(phrase: string, codeLower: string): boolean {
  const tokens = tokenise(phrase);
  if (tokens.length === 0) return false;
  return tokens.some((t) => codeLower.includes(t));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate a generated React component string against a ComponentSpec.
 *
 * Scoring strategy:
 *  - Each item in `must_have` counts for 2 points.
 *  - Each item in `elements` counts for 1 point.
 *  - Score = points_earned / max_points, clamped to [0, 1].
 *
 * @param code - The generated component source code.
 * @param spec - The original ComponentSpec the component was generated from.
 * @returns    An EvaluationResult with score, missing, and present lists.
 */
export function evaluateComponent(
  code: string,
  spec: ComponentSpec
): EvaluationResult {
  const codeLower = code.toLowerCase();

  // De-duplicate: track items we've already checked so we don't double-count.
  const checked = new Set<string>();
  const missing: string[] = [];
  const present: string[] = [];

  let earned = 0;
  let maxPoints = 0;

  // ── must_have (weight 2) ────────────────────────────────────────────────
  for (const item of spec.must_have) {
    const key = item.toLowerCase();
    if (checked.has(key)) continue;
    checked.add(key);

    maxPoints += 2;
    if (presentInCode(item, codeLower)) {
      earned += 2;
      present.push(item);
    } else {
      missing.push(item);
    }
  }

  // ── elements (weight 1, skip if already handled by must_have) ──────────
  for (const item of spec.elements) {
    const key = item.toLowerCase();
    if (checked.has(key)) continue;
    checked.add(key);

    maxPoints += 1;
    if (presentInCode(item, codeLower)) {
      earned += 1;
      present.push(item);
    } else {
      missing.push(item);
    }
  }

  // ── interactions (weight 1, skip already checked) ──────────────────────
  for (const item of spec.interactions) {
    const key = item.toLowerCase();
    if (checked.has(key)) continue;
    checked.add(key);

    maxPoints += 1;
    if (presentInCode(item, codeLower)) {
      earned += 1;
      present.push(item);
    } else {
      missing.push(item);
    }
  }

  const score = maxPoints === 0 ? 1 : Math.min(1, earned / maxPoints);

  return { score, missing, present };
}

/**
 * Build a human-readable feedback message to pass back to the LLM when a
 * generation attempt falls below the quality threshold.
 *
 * @param evaluation - Result from evaluateComponent.
 * @param attempt    - The 1-based attempt number that produced this evaluation.
 * @returns          A feedback string ready for inclusion in the next prompt.
 */
export function buildFeedbackMessage(
  evaluation: EvaluationResult,
  attempt: number
): string {
  if (evaluation.missing.length === 0) {
    return `Attempt ${attempt} scored ${(evaluation.score * 100).toFixed(0)}%. Please regenerate with higher fidelity.`;
  }

  const missingList = evaluation.missing.map((m) => `- ${m}`).join("\n");
  return (
    `Previous attempt (attempt ${attempt}) scored ${(evaluation.score * 100).toFixed(0)}% and was missing:\n` +
    `${missingList}\n\n` +
    `Regenerate the component ensuring ALL of the above elements are present and clearly implemented.`
  );
}
