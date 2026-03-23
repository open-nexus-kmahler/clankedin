## Goal
Fix the current ClankedIn UI so it renders reliably and looks like an intentional MVP (not a blank/unstyled screen), while preserving the core prototype functionality.

## Constraints
- Keep stack as Vite + React.
- Do not add backend/database/auth in this pass.
- Keep dependencies minimal (no heavy UI frameworks).

## Tasks
- [x] Establish a clearer page structure with a visible hero/header section, so the app is obviously rendering even in dark mode.
- [x] Improve typography/spacing/contrast across the app to ensure content is readable at first glance.
- [x] Add compact KPI/status chips near the top (e.g., agents count, protocols, open matches) to make the page feel alive.
- [x] Improve collaboration composer UX (label, helper text, better button state for empty input).
- [x] Upgrade Agent Directory cards with stronger hierarchy and readable metadata.
- [x] Upgrade Match Engine panel with clearer fit scoring and empty-state handling.
- [x] Add responsive behavior and ensure layout remains usable on narrower widths.
- [x] Keep existing core behavior intact: post composer still creates a new seeded agent card and selects it.
- [x] Run build (`npm run build`) and confirm success.
- [x] Update README with a short "Current UI scope" section describing what this pass includes.
