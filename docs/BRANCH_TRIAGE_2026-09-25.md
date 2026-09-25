# Branch triage — 25 September 2026 (M0-3)

Authority: `DR-2026-09-25-M0-CONSOLIDATION`. Every remote branch on `origin` at the time of M0 has
exactly one row here. Nothing is deleted silently: each row names what absorbed the branch.

**Deletion order (binding).**
1. Run nothing below until PR #1 (`claude/github-account-migration-0abchc`) and the M0 PR are both
   merged into `main`. Before then, "merged" can only be checked against this PR's branch, not
   against `main`.
2. For **every** branch in the SUPERSEDE rows, push the tag `archive/<branch>` first. That covers
   squash-landed branches whose PR mapping below is inferred from the title and date: the tag
   keeps the exact commits, so a wrong mapping loses nothing.
3. Then delete the branch.

MERGE rows are ancestors of the M0 PR head, so deleting them after step 1 loses nothing. `agent/*`
and `beta-branch-audit-*` are tagged anyway (directive M0-3).

## KEEP

| Branch | Why |
|---|---|
| `main` | default branch |
| `claude/github-account-migration-0abchc` | PR #1; delete only after it merges |
| `claude/friendly-franklin-irr9bb` | this M0 PR |
| `gh-pages` | GitHub Pages deploy target; the owner decides its fate with the Pages set-up (D6) |

## MERGE — contained in the M0 PR head

| Branch | Absorbed by |
|---|---|
| `claude/consolidation-phase15-multiview-decision` | M0-1 merge (old PR #62) |
| `claude/owner-decisions-launch-v1-5700wu` | M0-1 merge (`73995fd`), palace conflict reconciled |
| `claude/immersive-capture-screen` | M0-3 merge; the capture-screen choice (see "Capture-screen decision" below) |
| `claude/live-pose-feedback` | contained in `immersive-capture-screen` |
| `claude/production-face-guide-parity` | contained in `immersive-capture-screen` |
| `claude/mien-shiang-architecture-agxp7l-hardening-review` | M0-3 merge (heritage CSV/dossier fail-closed fixes; merged clean, tests green) |
| `claude/bash-environment-setup-nlqdhz` | content already present (merge adds nothing); PR #33 |
| `claude/beta-screen-light-fix` | content already present; PR #59 |
| `claude/capture-controller-rebuild-hw1pdf` | content already present; PR #60 |
| `codex/personalised-reading-principles` | content already present; PR #28 |
| Ancestors of `main`'s pre-migration history | `codex/beta-scanner-ui`, `copilot/optimise-k-factor`, `claude/new-session-su5jz7`, `copilot/refactor-os-path-demo`, `claude/tier2-personal-context-d1`, `agent/fix-pages-live-verification`, `agent/complete-camera-and-12-palaces`, `claude/mien-shiang-architecture-agxp7l`, `beta-branch-audit-and-deployment-4a377`, `agent/canonical-project-operating-model`, `claude/lighting-consistency-initiatives`, `claude/beta-scanner-real-pipeline-q3poi1`, `claude/heritage-connector-relationships-d2` |

## SUPERSEDE — M0-2 (the four newer parallel branches)

| Branch | Outcome |
|---|---|
| `claude/phase-0-blocker-report-av61wn` | Superseded by Phase 0 of `docs/MONETISATION_AUDIT_2026-09.md`. It was written on 4 September against a pre-#58 tree, and its verified state is stale. |
| `claude/phase-0-light-probe-harden-wvfnnr` | Superseded (parked research). It is a stand-alone screen-lamp SNR instrument outside `src/` that never ships. No milestone needs it, and the release gate measures the production scanner itself on Capacitor builds. The archive tag keeps it for a future colour-science pass. |
| `claude/customer-engagement-optimization-qlwm10` | Superseded. It targets the 12 August palace model (`toneGloss`), which no longer exists. Its ideas carry into the D3 spec: "one region stood out today", a per-palace keynote on the closed card, and "a different region leads next time". |
| `claude/prompt-audit-corrections-6s9mtl` | Superseded. Its e2e suite, the synthetic y4m and the generator landed via `38adaf4` and PR #57/#58; the branch lacks every later fix. |

## SUPERSEDE — carried into a milestone

| Branch | Carried into |
|---|---|
| `vibe/fullscreen-camera-fix` | Loses the capture-screen decision. Its vendor precache becomes M1a fix (d), with a test. Its Module B file deletion is superseded by M1b store-artefact flags: deleting the stubbed files breaks `ui.js` imports in the entertainment build. |
| `codex/scanner-single-face` | M1a fix (a) generalises its `selectSingleFace` to the live, selfie and beta paths. |
| `codex/og-share-card` | D3 / M3: social preview card for share deep links. It also carries the beta lane and the classic single-face fix, both superseded. |
| `codex/beta-release-lane` | Superseded by the proposed `DR-2026-09-25-STORE-ARTEFACT-SCOPE` (`/beta/` excluded from store builds). |
| `copilot/dual-face-compatibility-loop` | Prior art for the M1 two-face compatibility flagship. It is rebuilt under the derive-and-discard privacy contract, not merged: it encoded reading data into shareable URLs on the classic path. |
| `codex/tier2-reading-repair` | Tier 2 context landed via PR #45. Its heritage hardening landed via the hardening-review merge. Its service-worker daily reminder is superseded by `DR-2026-09-25-RETENTION-STREAK-REMINDER` (an opt-in `.ics` now; Capacitor local notifications are the M3 option). |
| `claude/autoringflash-scanner-audit-5fjpyt` | The "dual-store goal" is now `DR-2026-09-25-DUAL-STORE-REVENUECAT`. The native Android ring-flash proposal becomes a post-M1c option once a native shell exists. |
| `claude/twelve-regions-aesthetic-qdxixh` | D3 "lead palace" idea, rebuilt on the current palace model. |
| `claude/camera-detection-lighting-2g9c7j` | Its execution brief for the beta capture deadlock was resolved by PR #58, #59 and #60. |
| `claude/plugin-marketplace-setup-q8jmlk` | Not merged. It registers a third-party plugin marketplace in project settings, and no DR authorises that. The owner can re-add it with a DR. |
| `codex/conversation-idea-audit` | Its historical product-ideas ledger is superseded by the monetisation audit. |
| `codex/option-b-b020-evidence-review` | Its B-020 state sync is superseded by `DR-2026-09-09-B020-CLASS-BC-R3-R6-R8-R9` (all 14 rows closed). |

## SUPERSEDE — squash-landed or overtaken

These are historical. The PR mapping is inferred from the title, the date and the files touched, which is why every one is tagged before it is deleted.

| Branch | Landed or overtaken by |
|---|---|
| `claude/scanner-capture-correction` | PR #58 |
| `research/project-owned-kanripo-evidence` | PR #41 |
| `feature/heritage-stage3-reflection-integration` | PR #40 |
| `port/pr11-classic-capture-flow-fixes` | PR #38 |
| `feature/heritage-connectors` | PR #37 |
| `feature/claude-heritage-review`, `feature/heritage-infrastructure`, `claude/pr35-heritage-reconciliation-881epx`, `agent/claude-handoff-recovery-20260818-r2` | PR #32/#34/#37 heritage line; reconciliation archived in `docs/archive/HERITAGE_RECONCILIATION_2026-08-24.md` |
| `codex/option-b-015` | PR #27 and #31 |
| `codex/option-b-010` | PR #26 |
| `codex/option-b-program` | PR #25 |
| `codex/secure-cloud-agent-foundation` | PR #22 |
| `agent/raise-claude-review-limit` | commit subject present in `main` history |
| `agent/capture-screen-flash` | PR #14 |
| `codex/qise-scanner-share-flow`, `claude/camera-flash-dim-diagnosis-5qax2g` | PR #12 |
| `claude/repo-audit-app-flow-a1lrd1` | PR #14 / #38 (capture signposting) |
| `claude/engine-optimization-on1zjr` | engine work in `main` (items 45–49); README count long superseded |
| `claude/repo-login-requests-szf2r4` | PR #7 |
| `claude/aesthetic-harmony-calibration-v2aawv`, `copilot/fix-9-calibration-bl` | PR #6 |
| `copilot/add-aesthetic-harmony-score` | PR #4; its share gate is since deleted (L-04) |
| `feature/results-redesign` | PR #3 |
| `matthewcarlhogan-netizen-dark-theme-ui-redesign` | PR #2 |
| `matthewcarlhogan-netizen-github-pages-deploy` | Pages workflow in `main` |
| `claude/selfies-wlsci3` | PR #1 (old repo) and later selfie path |

## Capture-screen decision

- **Merged:** `claude/immersive-capture-screen`.
  - The face guide is derived from `faceGuideRect()`, so it represents the same buffer fraction the `distance` gate measures (CLAUDE.md item 57).
  - It adds live pose feedback that reuses the pose gate's own thresholds.
  - It adds an e2e test (`e2e/qise-capture-finalisation.spec.js`).
- **Superseded:** `vibe/fullscreen-camera-fix`.
  - It reintroduces a static CSS oval with no relationship to `DISTANCE_MIN_FRACTION`, which is the exact defect of item 57.
  - It adds a `contrast(1.05)` preview filter, which misrepresents the frame being measured. VISUAL_DIRECTION.md §post-scan requires the display to expose the system's real care, not flatter it.
  - It has no tests.
