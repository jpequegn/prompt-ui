import { describe, it, expect, mock, beforeEach } from "bun:test";
import { evaluateComponent, buildFeedbackMessage } from "./evaluateComponent.js";
import { GenerationLoop } from "./generationLoop.js";
import type { ComponentSpec } from "./types.js";

// ── Unit tests: evaluateComponent ────────────────────────────────────────────

const LOGIN_SPEC: ComponentSpec = {
  component_name: "LoginForm",
  elements: ["email input", "password input", "submit button", "spinner"],
  interactions: ["show spinner on submit", "disable button while loading"],
  styling: "centered card with shadow",
  must_have: ["email input", "password input", "submit button"],
  nice_to_have: ["spinner", "remember me checkbox"],
};

describe("evaluateComponent", () => {
  it("scores 1.0 when all must_have and elements are present", () => {
    const code = `
export function LoginForm() {
  return (
    <div className="card shadow">
      <input type="email" placeholder="email" />
      <input type="password" placeholder="password" />
      <button type="submit" disabled={loading}>Submit</button>
      {loading && <div className="spinner" />}
      {/* show spinner on submit, disable button while loading */}
    </div>
  );
}
export default LoginForm;
    `.trim();

    const result = evaluateComponent(code, LOGIN_SPEC);
    expect(result.score).toBeGreaterThanOrEqual(0.8);
    expect(result.missing.length).toBeLessThan(result.present.length);
  });

  it("scores low when critical elements are absent", () => {
    // Code only has a submit button — deliberately missing email and password
    const code = `
export function LoginForm() {
  return (
    <div className="card">
      <button type="submit">Login</button>
    </div>
  );
}
export default LoginForm;
    `.trim();

    const result = evaluateComponent(code, LOGIN_SPEC);
    expect(result.score).toBeLessThan(0.8);
    expect(result.missing).toContain("email input");
    expect(result.missing).toContain("password input");
  });

  it("lists missing items correctly", () => {
    const minimalCode = `
export function LoginForm() {
  return <div><button>Submit</button></div>;
}
export default LoginForm;
    `.trim();

    const result = evaluateComponent(minimalCode, LOGIN_SPEC);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(result.present.length).toBeGreaterThan(0);
  });

  it("returns score between 0 and 1", () => {
    const code = "export default function C() { return <div />; }";
    const result = evaluateComponent(code, LOGIN_SPEC);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("returns score 1 for an empty spec", () => {
    const emptySpec: ComponentSpec = {
      component_name: "Empty",
      elements: [],
      interactions: [],
      styling: "",
      must_have: [],
      nice_to_have: [],
    };
    const result = evaluateComponent("export default function C() { return null; }", emptySpec);
    expect(result.score).toBe(1);
  });
});

// ── Unit tests: buildFeedbackMessage ─────────────────────────────────────────

describe("buildFeedbackMessage", () => {
  it("includes missing element names", () => {
    const evaluation = {
      score: 0.5,
      missing: ["password input", "loading spinner"],
      present: ["email input", "submit button"],
    };
    const msg = buildFeedbackMessage(evaluation, 1);
    expect(msg).toContain("password input");
    expect(msg).toContain("loading spinner");
  });

  it("includes the attempt number", () => {
    const evaluation = {
      score: 0.6,
      missing: ["spinner"],
      present: ["email input"],
    };
    const msg = buildFeedbackMessage(evaluation, 2);
    expect(msg).toContain("2");
  });

  it("includes the score percentage", () => {
    const evaluation = {
      score: 0.6,
      missing: ["spinner"],
      present: ["email input"],
    };
    const msg = buildFeedbackMessage(evaluation, 1);
    expect(msg).toContain("60%");
  });

  it("handles zero missing elements gracefully", () => {
    const evaluation = {
      score: 0.75,
      missing: [],
      present: ["email input", "password input"],
    };
    const msg = buildFeedbackMessage(evaluation, 1);
    expect(msg.length).toBeGreaterThan(0);
  });
});

// ── Integration test: GenerationLoop with real API ────────────────────────────
// This test intentionally under-prompts the first attempt by omitting the
// loading spinner and password input from the prompt, then verifies that the
// loop catches the deficit and improves on retry.

describe("GenerationLoop – acceptance criteria", () => {
  it(
    "catches missing elements and improves on retry with a real API call",
    async () => {
      // Deliberately under-specified spec (missing password + spinner in elements list)
      const underspecifiedSpec: ComponentSpec = {
        component_name: "LoginForm",
        elements: ["email input", "submit button"],          // <-- password & spinner missing
        interactions: ["show spinner on submit"],
        styling: "centered card",
        must_have: ["email input", "password input", "submit button", "spinner"], // <-- but required!
        nice_to_have: [],
      };

      const loop = new GenerationLoop();
      const result = await loop.run(underspecifiedSpec, 3, 0.8, true);

      // ── Must always return something ───────────────────────────────────
      expect(typeof result.code).toBe("string");
      expect(result.code.length).toBeGreaterThan(50);

      // ── Must have made at least one attempt ────────────────────────────
      expect(result.attempts.length).toBeGreaterThanOrEqual(1);

      // ── Each attempt object must be well-formed ────────────────────────
      for (const attempt of result.attempts) {
        expect(attempt.attemptNumber).toBeGreaterThan(0);
        expect(typeof attempt.code).toBe("string");
        expect(attempt.evaluation.score).toBeGreaterThanOrEqual(0);
        expect(attempt.evaluation.score).toBeLessThanOrEqual(1);
      }

      // ── Attempts are in order ──────────────────────────────────────────
      result.attempts.forEach((a, i) => {
        expect(a.attemptNumber).toBe(i + 1);
      });

      // ── Best code is the highest-scoring attempt ───────────────────────
      const bestScore = Math.max(...result.attempts.map((a) => a.evaluation.score));
      expect(result.evaluation.score).toBe(bestScore);

      // ── If the loop had to retry, at least one feedback message exists ─
      if (result.attempts.length > 1) {
        const firstAttempt = result.attempts[0]!;
        // The first attempt should have feedback (it triggered a retry)
        expect(firstAttempt.feedback).not.toBeNull();
        expect(firstAttempt.feedback).toContain("password input");
      }

      // ── The final score should be better than or equal to attempt 1 ───
      const attempt1Score = result.attempts[0]!.evaluation.score;
      expect(result.evaluation.score).toBeGreaterThanOrEqual(attempt1Score);
    },
    180_000 // 3 min for up to 3 API calls
  );

  it(
    "returns best attempt even when threshold is never reached",
    async () => {
      // An impossibly strict threshold (1.01 is above maximum)
      const spec: ComponentSpec = {
        component_name: "SimpleButton",
        elements: ["button"],
        interactions: [],
        styling: "plain",
        must_have: ["button"],
        nice_to_have: [],
      };

      const loop = new GenerationLoop();
      // Use threshold of 1.01 so it's never satisfied → all 2 attempts run
      const result = await loop.run(spec, 2, 1.01, false);

      expect(result.attempts.length).toBe(2);
      expect(result.passed).toBe(false);

      // Result code should be the highest-scoring attempt's code
      const bestScore = Math.max(...result.attempts.map((a) => a.evaluation.score));
      expect(result.evaluation.score).toBe(bestScore);
    },
    120_000
  );
});
