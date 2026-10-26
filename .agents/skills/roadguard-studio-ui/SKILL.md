---
name: roadguard-studio-ui
description: Designs and refactors the production RoadGuard CAD & GIS Studio React workspace into a premium, accessible, responsive engineering UI without changing GIS calculations, DXF parsing, API contracts, exports, or regression behavior. Use for Phase 2 Studio UI/UX tasks.
---

# RoadGuard Studio UI/UX Skill — Phase 2

## Context and constraints
- Standalone CAD/GIS engineering tool, not the main RoadGuard system. No account system, pricing plans, fake data, non-working demo actions, or needless backend additions.
- Preserve current React + Vite frontend, existing styling approach, MapLibre GL Worker setup, dxf-viewer/Three.js rendering, Recharts, Excel/GeoJSON exports, and API integration.
- Respect Phase 1 data logic: `roadEngineeringBuilder.js` is the shared frontend source of derived engineering features. Do not fork it, rewrite algorithms in React components, or reinterpret `roadWidth`.
- Preserve the four actual tabs: `map`, `cad`, `profile`, `json`. Don't bring back obsolete tab names.
- Phase 2 only: DO NOT implement Landing Page unless separately approved for Phase 3. You may prepare design tokens that Phase 3 can reuse.

## Visual design direction
- Premium desktop engineering workstation. Confident, precise, restrained—not a marketing dashboard, gamer neon interface, or dense debug console.
- Brand: Hoàng Hải's supplied original logo (orange + deep navy), complemented by clean neutral/cyan GIS accents. Keep recognizable original artwork unchanged; do not recreate lettering or imply unsupported certifications.
- Suggested semantic tokens (adjust to current theme with adequate contrast): canvas `#0B1220`, surface `#111D2E`, raised surface `#17263C`, border `#27384E`, primary text `#E8EEF6`, secondary text `#A9B9CE`, construction orange `#F06421`, GIS cyan `#22B7C9`, positive `#39B58A`. Never communicate state by color alone.
- Use one consistent font stack already in project; body normally 13–14px+ (readable at 100% zoom), headings 16–24px by hierarchy, form labels >=12px, consistent 4/8px spacing scale. Avoid 9px text everywhere.
- Controls: consistent radii, contrast, visible hover/focus/disabled/processing states, tooltips for compact icons, meaningful grouped card titles.
- Microinteractions ≤200ms where motion helps, respect prefers-reduced-motion; avoid heavy glassmorphism, excessive gradients and animation in map.

## Target workspace architecture
- Header ~52–64px: product identity and selected file/status on left, the 4 view tabs clearly separated and legible, restrained action cluster on right.
- Left `Input & Configuration` panel (~300–360px desktop; adjustable if existing stack allows): DXF or coordinate input, reference system, axis and projection, road geometry, action to process. Compact accordions and progressive disclosure; don't crowd all controls at once.
- Center workspace: largest region, minimum feasible width, full-height map/CAD/profile/JSON. Preserve controls. `map.resize()` or equivalent on panel resizing/tab visibility and maintain camera/selection state.
- Right `Inspector & Export` (~280–340px, collapsible): separate tabs or grouped sections for GIS layers, CAD layers/search, segments, metrics and exports. Keep information scannable and independent scroll.
- Bottom small status strip: actual CRS/coordinates/processing state and clear warnings, not a giant string of tiny labels.
- At <=1280px collapse right inspector by default, at <=900px expose panels as drawers/tabs, center workspace retains priority. Do not pretend full desktop engineering tools are usable at 320px: ensure responsive navigation and basic file actions without overflow.
- Never forcibly reset uploaded file, processed data, active tab, visibility selection, viewport, or expanded panels solely because navigating UI.

## Specific pain points from original screenshots
1. Extremely dense 360px left sidebar full of import, CRS, geometry, layers, 8 drone segments, 112 CAD layers, KPI and exports; split responsibilities.
2. Tiny text, crowded icons, excessive bright blue strokes; introduce a calm hierarchy.
3. CAD viewer shows a tiny drawing within huge blank canvas; investigate Fit to Drawing and whether model extents include title blocks/stray entities. Offer `Fit all` and `Fit road corridor` rather than silently deleting entities or redefining extents.
4. Profile view has awkward empty viewport and what may be default elevations. Distinguish authentic drawing data from default/configured illustration; clearly label unknown elevation instead of implying surveyed elevation.
5. GeoJSON view needs readable syntax panel, copy/download feedback, validation and sensible huge JSON performance.
6. The original Hoàng Hải logo should be present without overshadowing RoadGuard. On Studio header use a tasteful small icon and readable RoadGuard wordmark; on Phase 3 landing show full company logo prominently.

## Execution protocol
1. Read `App.jsx`, `Sidebar.jsx`, `CadMap.jsx`, `CadViewer.jsx`, `CrossSectionProfile.jsx`, `excelExporter.js`, and `roadEngineeringBuilder.js`. Confirm actual files, branches and business-critical states.
2. Record a before screenshot at desktop widths. Create backup commit/branch without discarding uncommitted edits. Preserve backend unchanged during this phase.
3. Refactor minimally, extract presentational panels while hoisting/sharing existing state carefully; do not introduce Redux, router or a new design framework unless justified.
4. Preserve MapLibre Worker and source/layer lifecycle exactly; no remount of CAD/Map unless required; test camera and worker after panel collapse.
5. Add empty/loading/error/ambiguous-axis/not-yet-recomputed states; prevent export of stale approximate results or explicitly mark approximate and require validated recompute. Never invent successful geodetic validation.
6. Manual verification with actual DXF from baseline and coordinate entry: map, cad, profile, JSON, layer toggles, segment focus, CRS settings, toolbar, both exports, the 3.5m road-width case and return navigation.
7. Run `npm run build`, Backend build if touched, `tests/phase1_regression_suite.py`, `scripts/verify-phase1-ssot.mjs` (adjust paths to repos), and report pass/fail verbatim.
8. Capture at least desktop 1920x1080 and 1440x900, laptop 1280x800, narrower 1024px screenshots, inspect text clipping and independent scrolling. Recheck network console errors and WebGL worker.
9. Report changed files, screenshots, tests, unresolved defects and rollback steps. STOP before Phase 3 and before production deployment unless explicitly approved.

## Red lines
- No placeholder/mock engineering results; no hardcoded elevations, CRS output or fabricated CAD layer stats.
- No modified business logic, coordinate conversions, or numerical tolerances under cover of UI refactoring.
- No stale `surfaceAreaSqm` exported as authoritative after changing roadWidth without recomputation / clear safeguards.
- No broken keyboard focus, inaccessible icon-only buttons or 9px typography.
- No deleted company logo text, recoloring or low-quality generative replacement for the actual supplied image.
