# Design System — PriorArtPool

## Visual World & Surface Mode
- **Surface Mode:** Operate + Read (Defensive Patent Prosecution Dossier & Technical Prior-Art Claim-Chart Registry)
- **Visual Direction:** Daylight Archival Paper & Prussian Ink — inspired by patent examination dockets, IETF RFC archives, and Swiss editorial tables. High-contrast daylight surfaces, `1px` structural hairlines, whitespace grouping, zero nested card cages, zero decorative badge confetti, and zero neon glow halos.

## Stack
- framework: React 19 + Vite 6 + TypeScript
- styling: Tailwind CSS 3 + CSS custom properties (`src/styles/tokens.css`)
- components: Custom domain primitives (`DocketRail`, `ClaimChartDossier`, `AuditLedger`, `WalletWorkbench`, `TxMonitor`, `StatusTag`, `DossierSkeleton`)
- animation: CSS transitions (`150ms–200ms`, `cubic-bezier(0.22, 1, 0.36, 1)`) with `@media (prefers-reduced-motion: reduce)`
- icons: `lucide-react` (consistent `1.75` stroke weight)

## Tokens
- `--bg-canvas`: `#F7F8FA` (Archival paper background)
- `--bg-subtle`: `#EEF1F5` (Cool stone docket rail & toolbar layer)
- `--bg-surface`: `#FFFFFF` (Elevated active dossier sheet)
- `--bg-inset`: `#F3F5F8` (Quiet verbatim quote & technical metadata inset)
- `--text-primary`: `#0E1726` (Deep archival ink, 17.5:1 on white)
- `--text-secondary`: `#435066` (Secondary ink, 7.8:1 on white)
- `--text-muted`: `#556277` (Muted metadata ink, 5.7:1 on white — WCAG AA guaranteed)
- `--border-subtle`: `rgba(14, 23, 38, 0.09)`
- `--border-strong`: `rgba(14, 23, 38, 0.18)`
- `--accent`: `#1E40AF` (Prussian Cobalt primary action & active selection)
- `--accent-hover`: `#1E3A8A`
- `--accent-soft`: `#EFF4FF`
- `--status-pass-ink` / `--status-pass-bg`: `#14532D` / `#ECFDF3`
- `--status-fail-ink` / `--status-fail-bg`: `#881337` / `#FFF1F2`
- `--status-warn-ink` / `--status-warn-bg`: `#78350F` / `#FFFBEB`
- `--radius-sm`: `6px`, `--radius-md`: `10px`, `--radius-lg`: `12px`
- `--shadow-sheet`: `0 1px 2px rgba(14, 23, 38, 0.05), 0 8px 24px -12px rgba(14, 23, 38, 0.08)`

## Typography
- **Editorial Serif (`Newsreader`):** Masthead wordmark, primary dossier `<h1>`, and verbatim historical prior-art excerpts.
- **Product Sans (`Inter`):** All UI navigation, section headings, tables, buttons, and forms (`font-variant-numeric: tabular-nums` on every count, date, and wei amount).
- **Fixed Body Scale (strictly `>= 13px` everywhere):**
  - Dossier `<h1>`: `1.875rem` (`30px`, `-0.025em` tracking, `1.18` line-height)
  - Section `<h2>`: `1.125rem` (`18px`, `-0.015em` tracking, weight 600)
  - Body & Prose: `0.9375rem` (`15px`, `1.55` line-height, max `68ch` measure)
  - Compact Table / Metadata: `0.8125rem` (`13px`, `1.45` line-height)
- Sentence case for all UI labels and table headers (zero tracked ALL-CAPS kickers).

## Components Inventory
- `src/lib/utils.ts` — Class-name merge helper `cn()`
- `src/components/StatusTag.tsx` — Restrained semantic status marker (primitive; skeleton/empty N/A)
- `src/components/DossierSkeleton.tsx` — Geometry-matched loading skeleton for live StudioNet RPC fetches
- `src/components/DocketRail.tsx` — Persistent left patent docket selector, conservation summary, and deployed contract links
- `src/components/ClaimChartDossier.tsx` — Side-by-side § 102 patent claim-chart dossier sheet with verbatim excerpts and slice digests
- `src/components/AuditLedger.tsx` — Filterable StudioNet finalized transaction & `emit(on="finalized")` callback table
- `src/components/WalletWorkbench.tsx` — Operational StudioNet wallet form workspace with unified button/input hierarchy
- `src/components/TxMonitor.tsx` — Resumable localStorage 5-state transaction & GenLayer native appeal-window tracker

## Decisions
- 2026-11-20 — **Complete World Replacement**: Discarded initial dark-slate/neon-emerald card-cage layout (`4.5/10` audit) in favor of an archival paper-and-ink Patent Dossier workspace grounded in `demolab`, `impeccable`, and `ui-skill`. Eliminated all nested cards, side-stripe quote borders, ALL-CAPS eyebrows, sub-13px micro-labels, hardcoded hex colors, and rainbow pill walls.
- 2026-11-20 — **Structural Sidebar + Sheet Layout**: Replaced 4-card selector grid + 6-box hero-metric strip with a `300px` cool-stone docket rail (`lg:` sticky, collapsible on mobile) paired with a pure white editorial claim-chart sheet so reviewers immediately inspect real prior-art claim charts above the fold.
- 2026-11-20 — **Token & State Discipline**: Every color, border, radius, and shadow sourced from `src/styles/tokens.css` mapped into `tailwind.config.js`. All interactive controls implement `hover`, `active`, `focus-visible`, and `disabled` states with `prefers-reduced-motion` support.
