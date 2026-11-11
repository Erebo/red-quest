# AGENTS.md — Red Quest Rules & Data Integrity

## 1. NASA Data & Assets Rule
- **Never invent NASA data.** Every elevation, slope, spectral (CRISM), thermal (THEMIS), coordinate, sol number, and reference traverse point MUST come strictly from verified files in `public/data/`.
- Keep `data/raw/` and `data/processed/` read-only; browser code only reads from `public/data/` (or `src/game/levels/` generated directly from `public/data/`).

## 2. Value Provenance Tagging
- Every value displayed to the player MUST be tagged with its provenance:
  - **`measured`**: directly read or geometrically derived from NASA/PDS data files in `public/data/` (e.g., MOLA DEM elevation, slope angle, local/lon/lat coordinates, 3D route distance, cumulative ascent/net elevation, CRISM RGB/coverage, THEMIS brightness, Curiosity `route.json` points). Note slope safety tiers (<15° / 15°–25° / >25°) classify DEM-measured slopes using gameplay thresholds.
  - **`game`**: added or labeled for gameplay design (e.g., level title, briefing narrative, route blind labels `Route A / B / C`, strategy names, Best-For tags, slope threshold rules, objective/target roles, scoring rules).

## 3. Simulated Values Keep the `SIM` Tag
- All physics/environment estimates modeled by formulas in `docs/SIMULATED_DATA.md` (e.g., Estimated Drive Time, Energy Consumption, Cumulative Radiation Dose, Composite Risk Score, radiation dose rate, dust opacity, surface temperature, wind speed/direction, orbiter comm signal, traversability index) MUST display and retain the **`SIM`** tag whenever shown to the player.

## 4. Workflow & Git Hygiene
- **One feature per task, small commits.**
- Never commit or push automatically; wait for explicit user instructions.
