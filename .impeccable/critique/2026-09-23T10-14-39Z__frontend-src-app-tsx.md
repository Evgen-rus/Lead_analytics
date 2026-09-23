---
target: desktop Lead Analytics workflow
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:D:\\My_dev_project\\Lead_analytics\\frontend\\src\\App.tsx"
target_fingerprint: "sha256:fd3e6ad791a9d74da5c7459b9f4a23039d3c71eac9c0ff487d74bd816a35a33a"
target_path: "D:\\My_dev_project\\Lead_analytics\\frontend\\src\\App.tsx"
timestamp: 2026-09-23T10-14-39Z
slug: frontend-src-app-tsx
---
# Desktop UX critique — frontend/src/App.tsx

Method: dual-agent (A: design_review · B: detector_evidence)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Progress visible; errors global |
| 2 | Match System / Real World | 3 | ЛК and LKID unexplained |
| 3 | User Control and Freedom | 2 | No job cancel |
| 4 | Consistency and Standards | 3 | Two step/progress systems |
| 5 | Error Prevention | 2 | Weak pre-run confirmation |
| 6 | Recognition Rather Than Recall | 2 | Mappings need manual cross-check |
| 7 | Flexibility and Efficiency | 2 | Repeated serial review |
| 8 | Aesthetic and Minimalist Design | 2 | Later steps overloaded |
| 9 | Error Recovery | 2 | Limited contextual guidance |
| 10 | Help and Documentation | 1 | Little field-level help |
| **Total** | | **22/40** | **Acceptable** |

## Design Specificity

Workflow and terminology belong to lead reconciliation, but generic cards and teal controls could serve many other applications. The UI does not yet signal confidence in the correctness of a report. Detector: two warnings in `frontend/src/styles.css`: `side-tab` at line 231 (likely false positive because it is an error accent), `layout-transition` at line 735 (real width animation on progress indicator). No user-visible overlay: browser mutation was unavailable.

## Overall Impression

The four-step route and previews establish a usable foundation. The biggest opportunity is to make critical mapping and status decisions verifiable without tedious manual comparison.

## What's Working

- Four labeled steps show the route through report preparation.
- Separate XLSX zones make file roles clear and constrain formats.
- Result summaries and workbook previews support review before download.

## Priority Issues

1. **P1 — Mapping confidence.** Required and inferred columns look alike; users must compare seven selects with source tables. Show source samples and flag uncertain assignments. Suggested command: `/impeccable harden`.
2. **P1 — Unknown status grouping lacks context.** The modal asks for decisions without frequency, sample or downstream effect. Provide counts/examples and group definitions. Suggested command: `/impeccable clarify`.
3. **P1 — Analysis step overload.** Periods, export metadata, seven mappings, preview and run action compete. Make review-and-run primary and detailed preview secondary. Suggested command: `/impeccable layout`.
4. **P2 — Initial screen competition.** Empty history and disabled report actions compete with file upload. Reduce emphasis until exports exist. Suggested command: `/impeccable distill`.
5. **P2 — Deletion consequence unclear.** Confirmation is detached from export row and does not explain effect on summary. Anchor and describe it. Suggested command: `/impeccable clarify`.

## Cognitive Load and Emotional Journey

Five checklist failures: single focus, chunking, minimal choices, working memory, progressive disclosure. Decision points with more than four options include mapping and analysis settings. Initial state is calm; mapping and status grouping create doubt; processing progress reassures; success offers downloads but limited provenance.

## Persona Red Flags

- **Alex, experienced analyst:** repeats serial review and seven-field mapping checks, even for known projects.
- **Sam, keyboard user:** custom project selection and status modal have uncertain keyboard/focus behavior; asynchronous status may not be announced.
- **Jordan, new analyst:** ЛК, LKID and source-column meaning lack contextual explanations.

## Minor Observations

English title in Russian UI; strong disabled controls; dense nine-column summary table.

## Questions to Consider

- What evidence would convince an analyst that auto mapping is safe before running?
- Can known-project runs focus only on changed mappings?
- Which report provenance belongs beside the final download action?
