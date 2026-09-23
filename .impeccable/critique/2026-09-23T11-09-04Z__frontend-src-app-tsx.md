---
target: all desktop workflow screens
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
target_identity: "file:D:\\My_dev_project\\Lead_analytics\\frontend\\src\\App.tsx"
target_fingerprint: "sha256:25b44c8c869b6ad0a79f2bb97d3b7ecdb913b660f2f32e91c775ae2347e050fa"
target_path: "D:\\My_dev_project\\Lead_analytics\\frontend\\src\\App.tsx"
timestamp: 2026-09-23T11-09-04Z
slug: frontend-src-app-tsx
closed: true
---
Method: dual-agent (A: /root/critique_visual_assessment · B: /root/critique_detector_assessment)

# Desktop visual critique — Lead Analytics workflow, retest

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3/4 | Disabled history actions still read as available buttons. |
| 2 | Match System / Real World | 3/4 | Labels such as ЛК, CRM, and LKID assume domain vocabulary. |
| 3 | User Control and Freedom | 3/4 | Refresh loses an in-progress setup. |
| 4 | Consistency and Standards | 3/4 | Imperative wording varies across screens. |
| 5 | Error Prevention | 3/4 | Invalid or missing periods block launch without a nearby explanation. |
| 6 | Recognition Rather Than Recall | 3/4 | Auto/manual notes and sample values help; key definitions are absent. |
| 7 | Flexibility and Efficiency | 2/4 | Column review remains field-by-field. |
| 8 | Aesthetic and Minimalist Design | 3/4 | Empty history competes on the first screen; analytics setup is long. |
| 9 | Error Recovery | 2/4 | Global errors do not always identify the field to correct. |
| 10 | Help and Documentation | 2/4 | No contextual help for LKID or date distinctions. |
| **Total** | | **27/40** | **Acceptable (68%).** |

## Design Specificity Verdict

The product purpose is legible from the file roles, column mapping, analysis period, status grouping, workbook preview, and saved history. The interface still uses a category-familiar white-card admin style; most product character comes from workflow labels and data examples, not the visual language.

The deterministic detector returned an empty JSON array: 0 findings, no rule IDs or locations. Browser review separately spotted that the disabled “Загрузить и проверить” button retains a saturated teal fill. The detector did not report this as a violation. No formal detector false positives were produced.

## Overall Impression

The core desktop sequence is much clearer after separating required columns and surfacing matching keys. The first screen and the analysis page still leave avoidable questions: what remains before the action is enabled, and what exactly blocks analytics. The next improvement should add precise local feedback without changing the established step order.

## What's Working

- The four-step indicator makes the main workflow easy to follow.
- Mapping fields show auto/manual status and sample values; the client header “Номера” is visibly auto-selected.
- The match summary puts matched count and percentage first, and the completed report has clear download and preview actions.

## Priority Issues

1. **P1 — Invalid period silently blocks analytics.**
   - **Why it matters:** A user can complete mapping and still not know why “Сделать аналитику” is disabled when dates are empty or reversed.
   - **Fix:** Show the missing or invalid requirement beside the affected “От / До” pair, and a brief explanation beside the disabled run button.
   - **Suggested command:** `$impeccable clarify`

2. **P2 — Empty history presents false affordances.**
   - **Why it matters:** “Скачать сводку” and “Сравнить” look like actions before there is anything to download or compare; their links point to `#`.
   - **Fix:** In the empty state, replace those links with concise explanatory text or visibly disabled controls that state when the actions become available.
   - **Suggested command:** `$impeccable clarify`

3. **P2 — Analytics setup has a long scan path.**
   - **Why it matters:** Match summary, periods, analytics mapping, optional preview, and launch are vertically separated; the final recap is easy to lose while scrolling.
   - **Fix:** Preserve the user's current step order, but repeat a compact period/run recap near the launch action or keep that action visible on desktop.
   - **Suggested command:** `$impeccable layout`

4. **P2 — Field terminology is unexplained for first-time use.**
   - **Why it matters:** “ЛК”, “CRM”, and “LKID” can stop a new analyst who otherwise understands the file examples.
   - **Fix:** Add one-line contextual explanations beside only the unfamiliar fields; avoid adding a help screen or glossary.
   - **Suggested command:** `$impeccable clarify`

5. **P2 — Disabled upload action still looks active.**
   - **Why it matters:** The teal-filled “Загрузить и проверить” button is visually prominent before the project and both files are selected.
   - **Fix:** Give disabled primary actions a distinctly muted fill while keeping their labels readable; retain the adjacent prerequisites hint.
   - **Suggested command:** `$impeccable polish`

## Cognitive Load and Emotional Journey

The upload step has a clear next action and no more than four open options. The mapping step now groups required columns first and leaves matching keys visible; remaining options are collapsed. The analysis step still combines several decisions in one long screen, making it the main point where attention can drift. The initial empty history and inactive action buttons add visual competition. Success ends clearly with report metrics, preview tabs, and download.

## Persona Red Flags

- **Alex, regular analyst:** Matching keys and examples speed up checking, but every field still requires individual inspection; the disabled history actions look like available shortcuts.
- **Jordan, first-time analyst:** The file roles are clear. “LKID,” “ЛК,” “CRM,” and the distinction between “Дата анализа” and the data period remain unexplained.
- **Riley, stress tester:** Refreshing during mapping or period entry appears to lose the setup. This is a workflow-state issue beyond the requested visual-only scope; it was not submitted as a visual fix.

## Minor Observations

- Button and field copy shifts between “Выбери,” “Введите,” and “Выберите.”
- The first screen's empty history occupies a substantial part of the viewport before the first report exists.
- The unknown-status modal was not reached because the supplied workbooks had no unknown statuses.
- Mobile layout and keyboard operation were not assessed per user instruction.

## Questions to Consider

- Should the disabled analytics action name the exact missing date condition, or should the date fields carry the only validation message?
- Should empty history actions disappear until they are useful, or remain visible with a clear availability condition?
