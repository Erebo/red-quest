# Red Quest - Data Sources Inventory

This document tracks all raw data assets collected for the Red Quest 3D Mars mapping and exploration project.

| Layer | File Name | Size | Format | Source / Dataset Name | Download Date | Range |
|---|---|---|---|---|---|---|
| Elevation (DEM) | `MSL_Gale_DEM_Mosaic_1m_v3.tif` | 3.60 GB (3,868,256,546 B) | GeoTIFF (32-bit Float) | | | |
| Hi-Res Imagery | `MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif` | 982.88 MB (1,030,625,379 B) | Cloud-Optimized GeoTIFF (RGB) | | | |
| Regional Basemap | `THEMIS_DayIR_ControlledMosaic_Aeolis_30S135E_100mpp.tif` | 452.51 MB (474,486,633 B) | GeoTIFF (8-bit Grayscale) | | | |
| Mineralogy (Hydrated) | `t0902_mrrhyd_05s138_0327_4.png` | 3.42 MB (3,590,609 B) | PNG (RGBA Browse Image) | | | |
| Mineralogy (Hydrated Label) | `t0902_mrrhyd_05s138_0327_4.lbl.txt` | 7.81 KB (8,002 B) | PDS3 Label (ASCII Text) | | | |
| Mineralogy (Phyllosilicates) | `t0902_mrrphy_05s138_0327_4.png` | 1.87 MB (1,959,353 B) | PNG (RGBA Browse Image) | | | |
| Mineralogy (Phyllosilicates Label) | `t0902_mrrphy_05s138_0327_4.lbl.txt` | 7.68 KB (7,863 B) | PDS3 Label (ASCII Text) | | | |
| Rover Traverse | `localized_interp.csv` | 11.21 MB (11,755,643 B) | CSV (Comma-Separated Values) | | | |
| Rover Traverse Label | `localized_interp.lbl` | 8.38 KB (8,576 B) | PDS3 Label (ASCII Text) | | | |
| Radiation Data | `RAD_RDR_2015_087_09_11_0939_V00.TXT` | 27.31 MB (28,638,714 B) | ASCII Table / Text | | | |
| Radiation Data Label | `RAD_RDR_2015_087_09_11_0939_V00.LBL` | 1.24 MB (1,299,040 B) | PDS3 Label (ASCII Text) | | | |
| Atmospheric Data (REMS) | *(Missing / Not yet acquired)* | — | — | | | |


---

## Processed 5 km × 5 km Exploration Area (Web Engine Assets)

### Selected Crop Box (Centered on Boxwork Science Campaign)
- **Selection Rationale:** The Boxwork campaign (Sols 4534–4868, core Sols 4600–4805) was shifted toward the southwest quadrant in Candidate 1. Centering on the Boxwork centroid ($8,143,250\text{ m}, -284,875\text{ m}$) provides balanced ~2.0–2.35 km margins on all sides while remaining fully inside both the DEM and HiRISE footprints, containing 100% of Sols 4000–4868.
- **Center:** Easting $8,143,250.0\text{ m}$, Northing $-284,875.0\text{ m}$ ($137.381484^\circ\text{ E}, -4.806032^\circ\text{ S}$)
- **Projected Bounds:**
  - Easting: $[8,140,750.0\text{ m}, 8,145,750.0\text{ m}]$ (Width: $5,000\text{ m}$)
  - Northing: $[-287,375.0\text{ m}, -282,375.0\text{ m}]$ (Height: $5,000\text{ m}$)
- **Geographic Bounds:**
  - Longitude: $[137.339376^\circ\text{ E}, 137.423730^\circ\text{ E}]$
  - Latitude: $[-4.848190^\circ\text{ S}, -4.763837^\circ\text{ S}]$
- **Elevation Range:** $-4,131.74\text{ m}$ to $-3,078.41\text{ m}$ (Relief: $1,053.33\text{ m}$)

### Processed Datasets Inventory (`data/processed/`)
| File Name | Size | Dimensions | Resolution | Description |
|---|---|---|---|---|
| `dem_crop.tif` | 67.92 MB | 5,000 × 5,000 px | 1.0 m/px | Native 1 m DEM cropped to the 5 km box (32-bit Float GeoTIFF) |
| `hirise_crop.tif` | 125.45 MB | 20,000 × 20,000 px | 0.25 m/px | Native 0.25 m HiRISE color orthomosaic (Tiled JPEG GeoTIFF) |
| `hirise_crop_2500.tif` | 15.89 MB | 2,500 × 2,500 px | 2.0 m/px | 8x downsampled HiRISE color GeoTIFF |
| `hirise_crop_2500.png` | 12.31 MB | 2,500 × 2,500 px | 2.0 m/px | 8x downsampled HiRISE RGB PNG |
| `themis_crop.tif` | 3.24 KB | 50 × 50 px | 100.0 m/px | Native 100 m THEMIS daytime IR mosaic cropped to the box |
| `crism_hyd_crop.png` | 2.00 KB | 27 × 28 px | ~181.3 m/px | Native resolution CRISM hydrated minerals browse crop |
| `crism_phy_crop.png` | 1.23 KB | 27 × 28 px | ~181.3 m/px | Native resolution CRISM phyllosilicates browse crop |
| `route_crop.csv` | 2.40 MB | 10,581 rows | Waypoints | Full localization CSV filtered to waypoints inside the 5 km box |

### Web Engine Ready Assets (`data/processed/web/`)
| File Name | Size | Dimensions / Format | Resolution | Description |
|---|---|---|---|---|
| `terrain_height.bin` | 4.01 MB (4,202,500 B) | 1,025 × 1,025 (Float32) | ~4.88 m/px | Raw binary elevation grid (row-major, north row first) for WebGL/Three.js |
| `terrain_height_preview.png` | 139.29 KB | 1,025 × 1,025 (8-bit Grayscale) | ~4.88 m/px | Normalized heightmap visual preview |
| `terrain_texture.png` | 12.31 MB | 2,500 × 2,500 (RGB PNG) | 2.0 m/px | Color surface texture map for 3D terrain rendering |
| `slope.bin` | 4.01 MB (4,202,500 B) | 1,025 × 1,025 (Float32) | ~4.88 m/px | Raw binary surface slope angles in degrees |
| `slope_classified.png` | 251.93 KB | 1,025 × 1,025 (RGB PNG) | ~4.88 m/px | Color-coded traversability map (Green < 15°, Yellow 15°–25°, Red > 25°) |
| `slope_5m.bin` | 4.01 MB (4,202,500 B) | 1,025 × 1,025 (Float32) | ~4.88 m/px | Raw binary surface slope angles in degrees (5 m baseline, capped at 60°) |
| `slope_5m_classified.png` | 159.77 KB | 1,025 × 1,025 (RGB PNG) | ~4.88 m/px | Traversability map using 5 m baseline slope (Green < 15°, Yellow 15°–25°, Red > 25°) |
| `route.json` | 278.2 KB | 1,819 waypoints | ~5.0 m step | Thinned ROVER route with local box coordinates (0 to 5,000 m) |
| `preview_check.png` | 2.05 MB | 2,400 × 2,400 (RGB PNG) | Map | High-resolution hillshade verification map with route and Boxwork campaign outline |
| `manifest.json` | 5.01 KB | JSON Metadata | — | Comprehensive bounding box, projection, and asset index |

### Processing Notes & Disclaimers
1. **DEM Resampling & Slope Extraction:** The 1 m DEM was smoothed with a Gaussian filter ($\sigma \approx 2.5\text{ px}$) and gradients calculated over a 5 m step baseline to capture realistic vehicle-scale terrain gradients, capped at 60°.
2. **Slope Classification Disclaimer:** The slope categories (< 15° Easy, 15°–25° Moderate, > 25° Hazardous) are **gameplay design thresholds** for rover navigation challenge, NOT NASA operational vehicle limits.
3. **Route Thinning:** Only rows with `frame == 'ROVER'` were included to represent the actual physical rover motion. Points were sampled along the traverse at ~5 m increments while strictly preserving the opening and closing waypoints of each sol.

---

## Science Targets Provenance (`src/main.js`)

The sol numbers and titles used for Level 1 science targets (`src/game/levels/level01.json`) and scene markers are sourced from `SCIENCE_TARGETS` in `src/main.js` (originally provided by user/Curiosity blog notes) and their coordinates are matched to the nearest waypoint in `public/data/route.json`:

| Level 1 Usage | Sol / Range Label | Description | Code Reference | Verification Status |
|---|---|---|---|---|
| **Level 1 Target 1** | `Sol 4534` (`4534`) | Boxwork campaign begins (Phase 1) | `src/main.js:529` | **to verify against NASA** |
| **Level 1 Target 2** | `Sols 4602-4603` (`4602`) | Top of the ridge, start of the main boxwork region | `src/main.js:530` | **to verify against NASA** |
| *(Scene marker / Debrief)* | `Sols 4604-4606` (`4604`) | Main exposure of boxwork structures | `src/main.js:531` | **to verify against NASA** |
| **Level 1 Target 3** | `Sols 4716-4722` (`4716`, mapped to nearest thinned waypoint `sol: 4711` in `route.json`) | Nevado Sajama drill | `src/main.js:532` | **to verify against NASA** |
| *(Scene marker / Debrief)* | `Sols 4804-4811` (`4804`, mapped to nearest thinned waypoint `sol: 4805` in `route.json`) | Nevado Sajama 2 drill | `src/main.js:533` | **to verify against NASA** |
