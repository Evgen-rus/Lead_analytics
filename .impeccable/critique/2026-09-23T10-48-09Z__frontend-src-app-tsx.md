---
target: all desktop workflow screens
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:D:\\My_dev_project\\Lead_analytics\\frontend\\src\\App.tsx"
target_fingerprint: "sha256:f88c99e4227c255caaea0c82e84da9cd5a92c2953a4d6ac0683c4e64b13bf173"
target_path: "D:\\My_dev_project\\Lead_analytics\\frontend\\src\\App.tsx"
timestamp: 2026-09-23T10-48-09Z
slug: frontend-src-app-tsx
---
# Desktop visual critique — Lead Analytics workflow

Method: dual-agent (A: visual_assessment · B: visual_detector)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Ready badge appears before required inputs are present |
| 2 | Match System / Real World | 3 | ЛКID and Полный источник assume domain familiarity |
| 3 | User Control and Freedom | 3 | File replacement resets results without strong visual cue |
| 4 | Consistency and Standards | 3 | Sheet tabs duplicate the sheet dropdown |
| 5 | Error Prevention | 2 | Project has no required marker; disabled actions lack prerequisites |
| 6 | Recognition Rather Than Recall | 3 | Selected mappings and samples are visible |
| 7 | Flexibility and Efficiency | 2 | Many mappings require serial scanning |
| 8 | Aesthetic and Minimalist Design | 2 | Panels have similar weight; mapping screen is dense |
| 9 | Error Recovery | 2 | Banner does not point to a specific field |
| 10 | Help and Documentation | 1 | No field-level explanation |
| **Total** | | **24/40** | **Acceptable** |

## Design Specificity

The workflow content is specific to Excel matching and lead analytics. The visual language is generic admin UI and does not yet foreground careful report verification. Detector found two warnings: `side-tab` at `frontend/src/styles.css:231`, a 4px red alert border, and `layout-transition` at `frontend/src/styles.css:781`, a width transition on progress. The first is a meaningful error cue but is flagged by the craft floor; the second is a subtle motion detail. No visible overlay: available browser controls were read-only.

## Evidence and Workflow

Desktop screens reviewed: upload, mapping, analytics setup, result and export history. Real files: `leads_2026-08-01_2026-09-22.xlsx` and `[LR189] Динсайд.xlsx`. Client phone was not auto-mapped; selecting `Номера` produced 284 matches from 10,183 LK rows. No unknown statuses occurred, so the status grouping modal was not reached during the live run; that screen was reviewed in source. Keyboard and mobile were out of scope.

## Cognitive Load and Emotional Journey

The mapping step combines multiple selectors for both files, sheet controls, and previews. Required and optional fields should be grouped. No more than four open options appear at once, but several separate decisions sit together. The upload screen is calm, though the ready badge and disabled actions create mixed signals. Mapping is the highest-effort point. The match summary communicates the outcome, but the matched rate does not stand apart visually. The final download is clear, while the result still feels like another generic panel.

## What's Working

- Stepper and back actions keep the workflow oriented.
- Mappings display selected columns, auto/manual status, and sample values.
- Match and analytics previews let users inspect output before download.

## Priority Issues

1. **P1 — Mapping screen requires too much scanning.** Required and optional selectors are mixed across two workbooks. Group required mappings first and collapse optional ones.
2. **P1 — Disabled actions hide prerequisites.** Mark project required and explain that project plus both files are needed before upload.
3. **P2 — Duplicate sheet controls.** Remove either tabs or dropdown from mapping panels; keep one visible control.
4. **P2 — Match summary lacks hierarchy.** Present matched count and percentage together, with unmatched and duplicate counts secondary. Do not imply a pass threshold.
5. **P2 — Preview cells truncate values.** Let mouse users inspect the full value, such as through a native tooltip or detail affordance.

## Minor Observations

Ready badge implies more readiness than the empty upload state; replacing a file resets downstream work with little emphasis. Detector warnings: red border on alert and progress width transition.

## Questions to Consider

- After matching, should the eye land first on matched percentage or on unmatched rows?
- Should the result feel like a reviewed handoff or simply a generated file?

## Implementation and Retest

- Grouped required columns separately; kept matching keys visible and collapsed remaining optional columns.
- Made the project requirement and upload prerequisites explicit; showed step-specific status.
- Removed the duplicate sheet tabs from mapping panels and added full-value mouse tooltips to preview cells.
- Emphasized matched count with its rate and fit all five analytics metrics on one desktop row.
- Replaced the thick alert accent with a thin border. Kept the short progress-width transition as deliberate progress feedback.
- Added only the phone-column alias `Номера`; the real client workbook now auto-selects it.
- Retested the full desktop flow with both supplied files: 284 matches of 10,183 (2.79%), followed by a successful analytics export. The real files had no unknown statuses, so the status-grouping modal was not triggered.
- Verification: 35 pytest tests passed, Ruff passed, frontend production build passed.
