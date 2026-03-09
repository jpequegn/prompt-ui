# Eval Results — 10 Diverse Component Prompts

**Run date**: 2026-03-09
**Config**: maxAttempts=3, threshold=0.8, model=claude-opus-4-5

## Summary

| Metric | Value |
|--------|-------|
| Components passing (≥80%) | **0 / 10** |
| Average final score | **0.0%** |
| Average attempts per component | **0.00** |
| Total eval time | **1.0s** |
| Acceptance criteria (≥7/10 at 0.8+) | ❌ FAILED |

## Score per component

| # | Component | Score | Attempts | Time | Pass | Missing elements |
|---|-----------|------:|---------:|-----:|------|-----------------|
| 1 | LoginForm              |    0% | 0 |    0.1s | ❌ | email, password, submit |
| 2 | SearchBar              |    0% | 0 |    0.1s | ❌ | input, dropdown, search |
| 3 | PricingCard            |    0% | 0 |    0.1s | ❌ | basic, pro, enterprise |
| 4 | ProgressBar            |    0% | 0 |    0.1s | ❌ | progress, percent |
| 5 | NavigationBar          |    0% | 0 |    0.1s | ❌ | logo, home, about, contact |
| 6 | ModalDialog            |    0% | 0 |    0.1s | ❌ | title, close, modal |
| 7 | DataTable              |    0% | 0 |    0.1s | ❌ | name, email, role |
| 8 | ToggleSwitch           |    0% | 0 |    0.1s | ❌ | toggle, label |
| 9 | FileUploadDropzone     |    0% | 0 |    0.1s | ❌ | upload, drop, file |
| 10 | ToastNotification      |    0% | 0 |    0.1s | ❌ | success, toast, dismiss |

## Passing components

none

## Failing components

LoginForm, SearchBar, PricingCard, ProgressBar, NavigationBar, ModalDialog, DataTable, ToggleSwitch, FileUploadDropzone, ToastNotification

## Patterns in failures

- **Pipeline errors** (10): LoginForm, SearchBar, PricingCard, ProgressBar, NavigationBar, ModalDialog, DataTable, ToggleSwitch, FileUploadDropzone, ToastNotification — check API key / network.

## Notes

- Scoring uses the `evaluateComponent` function: `must_have` items weighted ×2, `elements` weighted ×1.
- Matching is token-based and lenient (any significant word from the phrase found in code).
- Components are saved to `eval/components/<Name>.tsx`.
- Raw metrics in `eval/results.json`.
