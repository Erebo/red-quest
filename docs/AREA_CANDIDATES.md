# Red Quest - Candidate 5 km × 5 km Exploration Area Analysis

This document evaluates the late-mission Curiosity rover traverse (Sols 3500–4868 and Sols 4000–4868) using `data/raw/localized_interp.csv` to identify and characterize the optimal 5 km × 5 km map areas for the 3D Mars browser game.

---

## 1. Traverse Analysis: Sols 3500 to 4868 (100-Sol Bins)

Coordinates use the equirectangular projection centered on $(0^\circ, 0^\circ)$ on the Mars 2000 Sphere ($R = 3,396,190\text{ m}$), matching the spatial reference system of `MSL_Gale_DEM_Mosaic_1m_v3.tif` and `MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif`.

*Distance driven is calculated along the chronological vehicle traverse (ROVER frame waypoints).*

| Bin | Sols Range | Mean Easting (m) | Mean Northing (m) | Longitude (°E) | Latitude (°S) | Mean Elevation (m) | Distance Driven (m) | Waypoints |
|---|---|---|---|---|---|---|---|---|
| **Bin 1** | Sols 3500–3599 | 8,144,231.62 | -282,036.96 | 137.3981° | -4.7581° | -3,893.33 | 557.07 | 885 |
| **Bin 2** | Sols 3600–3699 | 8,144,143.82 | -282,208.48 | 137.3966° | -4.7610° | -3,863.25 | 529.35 | 864 |
| **Bin 3** | Sols 3700–3799 | 8,144,213.94 | -282,412.92 | 137.3978° | -4.7645° | -3,854.40 | 675.95 | 950 |
| **Bin 4** | Sols 3800–3899 | 8,144,320.19 | -282,668.11 | 137.3996° | -4.7688° | -3,817.42 | 571.37 | 911 |
| **Bin 5** | Sols 3900–3999 | 8,144,447.61 | -282,946.20 | 137.4018° | -4.7735° | -3,780.47 | 609.86 | 919 |
| **Bin 6** | Sols 4000–4099 | 8,144,683.67 | -283,227.97 | 137.4057° | -4.7782° | -3,751.21 | 343.75 | 558 |
| **Bin 7** | Sols 4100–4199 | 8,144,829.23 | -283,535.55 | 137.4082° | -4.7834° | -3,705.45 | 583.37 | 881 |
| **Bin 8** | Sols 4200–4299 | 8,144,864.58 | -283,734.33 | 137.4088° | -4.7868° | -3,679.97 | 289.99 | 452 |
| **Bin 9** | Sols 4300–4399 | 8,144,609.34 | -283,600.39 | 137.4045° | -4.7845° | -3,709.26 | 1,054.80 | 1,442 |
| **Bin 10** | Sols 4400–4499 | 8,143,934.49 | -283,814.12 | 137.3931° | -4.7881° | -3,716.25 | 961.65 | 1,262 |
| **Bin 11** | Sols 4500–4599 | 8,143,444.09 | -284,435.41 | 137.3848° | -4.7986° | -3,658.52 | 1,132.69 | 1,458 |
| **Bin 12** | Sols 4600–4699 | 8,143,165.18 | -284,919.46 | 137.3801° | -4.8068° | -3,613.03 | 672.12 | 1,005 |
| **Bin 13** | Sols 4700–4799 | 8,143,219.09 | -284,989.28 | 137.3810° | -4.8079° | -3,609.30 | 63.29 | 126 |
| **Bin 14** | Sols 4800–4868 | 8,143,273.20 | -285,120.66 | 137.3819° | -4.8102° | -3,599.02 | 704.56 | 961 |
| **Total** | **Sols 3500–4868** | — | — | — | — | — | **8,749.83 m** | **12,674** |

### Key Observations
1. **Steady Uphill Climb:** Elevation climbed from $-3,893.33\text{ m}$ (Sol 3500) to $-3,599.02\text{ m}$ (Sol 4868), a net ascent of nearly $300\text{ m}$ over this period.
2. **Southwest Migration:** The rover migrated systematically southwest from Easting $8,144,231\text{ m}$, Northing $-282,037\text{ m}$ ($137.40^\circ\text{E}, -4.76^\circ$) toward Easting $8,143,273\text{ m}$, Northing $-285,121\text{ m}$ ($137.38^\circ\text{E}, -4.81^\circ$).
3. **Driving Activity Peaks:** Peak drive distances occurred in Bin 9 (Sols 4300–4399: $1,054.80\text{ m}$), Bin 10 (Sols 4400–4499: $961.65\text{ m}$), and Bin 11 (Sols 4500–4599: $1,132.69\text{ m}$) as the rover traversed the Gediz Vallis channel.

---

## 2. 5 km × 5 km Candidate Area Selection (Sols 4000–4868)

### Geospatial Extent of Sols 4000–4868
- **Total Points:** 8,145 waypoints
- **Easting Extent:** $8,143,105.59\text{ m}$ to $8,144,902.70\text{ m}$ ($\Delta X = 1,797.11\text{ m} \approx 1.80\text{ km}$)
- **Northing Extent:** $-285,364.23\text{ m}$ to $-283,124.09\text{ m}$ ($\Delta Y = 2,240.15\text{ m} \approx 2.24\text{ km}$)
- **Center of Bounding Box:** Easting $8,144,004.15\text{ m}$, Northing $-284,244.16\text{ m}$ ($137.39428^\circ\text{E}, -4.79537^\circ$)

Because the entire route across Sols 4000–4868 spans only $1.80\text{ km} \times 2.24\text{ km}$, a single $5\text{ km} \times 5\text{ km}$ box can enclose **100% of all 8,145 route points**. The top candidates represent strategic choices in how to position the 5 km window to balance spatial margin, historical traverse coverage, and terrain relief.

---

### Candidate 1: Centroid & Maximum Margin Box (Recommended Default)
*Positioned at the geometric center of the Sols 4000–4868 traverse to provide symmetrical ~1.4–1.6 km exploration margin around the entire late-mission route.*

- **Center Coordinates:**
  - Easting / Northing: $8,144,000.0\text{ m}$, $-284,250.0\text{ m}$
  - Longitude / Latitude: $137.39421^\circ\text{ E}$, $-4.79547^\circ\text{ S}$
- **Bounding Box (5,000 m × 5,000 m):**
  - Easting: $[8,141,500.0\text{ m}, 8,146,500.0\text{ m}]$
  - Northing: $[-286,750.0\text{ m}, -281,750.0\text{ m}]$
  - Geographic: $[137.35203^\circ\text{ E}, 137.43638^\circ\text{ E}]$, $[-4.83765^\circ\text{ S}, -4.75329^\circ\text{ S}]$
- **Route & Mission Coverage:**
  - Points (Sols 4000–4868): **8,145 / 8,145 (100.0%)**
  - Total Points Inside Box: **12,978 waypoints**
  - Mission Sol Range Inside: **Sol 3478 to Sol 4868** (nearly 1,400 sols of mission history)
  - Route Length (Sols 4000–4868): $5,806.23\text{ m}$ ($5.81\text{ km}$)
  - Total Route Length Inside: **8,945.06 m** ($8.95\text{ km}$)
- **Topographic Range (from DEM):**
  - Elevation Minimum: **-4,143.72 m**
  - Elevation Maximum: **-3,172.81 m**
  - Elevation Relief: **970.91 m**
- **Raster Footprint & NoData Verification:**
  - Inside DEM Footprint: **Yes** (Margins: East/West $\ge 13.5\text{ km}$, North/South $\ge 15.5\text{ km}$)
  - Inside HiRISE Footprint: **Yes** (Margins: East/West $= 1.5\text{ km}$, North/South $\ge 2.25\text{ km}$)
  - DEM NoData: **0.000%** (100% valid elevation data)
  - HiRISE NoData: **0.042%** (virtually 100% valid color imagery)

---

### Candidate 2: Maximum Traverse & Historical Reach Box (North Shift)
*Shifted 1,250 m northward to the northern limit of the 100% coverage window. Retains all of Sols 4000–4868 while capturing an extensive portion of earlier Mount Sharp traverse.*

- **Center Coordinates:**
  - Easting / Northing: $8,144,000.0\text{ m}$, $-283,000.0\text{ m}$
  - Longitude / Latitude: $137.39421^\circ\text{ E}$, $-4.77438^\circ\text{ S}$
- **Bounding Box (5,000 m × 5,000 m):**
  - Easting: $[8,141,500.0\text{ m}, 8,146,500.0\text{ m}]$
  - Northing: $[-285,500.0\text{ m}, -280,500.0\text{ m}]$
  - Geographic: $[137.35203^\circ\text{ E}, 137.43638^\circ\text{ E}]$, $[-4.81656^\circ\text{ S}, -4.73220^\circ\text{ S}]$
- **Route & Mission Coverage:**
  - Points (Sols 4000–4868): **8,145 / 8,145 (100.0%)**
  - Total Points Inside Box: **21,358 waypoints** *(highest point density)*
  - Mission Sol Range Inside: **Sol 2568 to Sol 4868** (2,300 sols of mission history!)
  - Route Length (Sols 4000–4868): $5,806.23\text{ m}$ ($5.81\text{ km}$)
  - Total Route Length Inside: **14,937.15 m** ($14.94\text{ km}$)
- **Topographic Range (from DEM):**
  - Elevation Minimum: **-4,242.18 m**
  - Elevation Maximum: **-3,276.88 m**
  - Elevation Relief: **965.30 m**
- **Raster Footprint & NoData Verification:**
  - Inside DEM Footprint: **Yes** (Margins: East/West $\ge 13.5\text{ km}$, North/South $\ge 16.7\text{ km}$)
  - Inside HiRISE Footprint: **Yes** (Margins: East/West $= 1.5\text{ km}$, North/South $\ge 3.5\text{ km}$)
  - DEM NoData: **0.000%** (100% valid elevation data)
  - HiRISE NoData: **0.004%** (essentially 100% valid color imagery)

---

### Candidate 3: West-Aligned & Gediz Vallis Ridge Box (Integer Grid Alignment)
*Aligned with the western integer boundary of the HiRISE strip ($X_{\min} = 8,140,000\text{ m}$). Captures the high-relief Gediz Vallis Ridge and western Mount Sharp flank.*

- **Center Coordinates:**
  - Easting / Northing: $8,142,500.0\text{ m}$, $-285,000.0\text{ m}$
  - Longitude / Latitude: $137.36890^\circ\text{ E}$, $-4.80812^\circ\text{ S}$
- **Bounding Box (5,000 m × 5,000 m):**
  - Easting: $[8,140,000.0\text{ m}, 8,145,000.0\text{ m}]$
  - Northing: $[-287,500.0\text{ m}, -282,500.0\text{ m}]$
  - Geographic: $[137.32672^\circ\text{ E}, 137.41108^\circ\text{ E}]$, $[-4.85030^\circ\text{ S}, -4.76595^\circ\text{ S}]$
- **Route & Mission Coverage:**
  - Points (Sols 4000–4868): **8,145 / 8,145 (100.0%)**
  - Total Points Inside Box: **10,184 waypoints**
  - Mission Sol Range Inside: **Sol 3776 to Sol 4868**
  - Route Length (Sols 4000–4868): $5,806.23\text{ m}$ ($5.81\text{ km}$)
  - Total Route Length Inside: **7,104.65 m** ($7.10\text{ km}$)
- **Topographic Range (from DEM):**
  - Elevation Minimum: **-4,174.84 m**
  - Elevation Maximum: **-3,178.78 m**
  - Elevation Relief: **996.06 m** *(highest relief among all candidates)*
- **Raster Footprint & NoData Verification:**
  - Inside DEM Footprint: **Yes** (Margins: East/West $\ge 12.0\text{ km}$, North/South $\ge 14.7\text{ km}$)
  - Inside HiRISE Footprint: **Yes** (West margin $= 0.0\text{ m}$, East margin $= 4.0\text{ km}$, North/South $\ge 1.5\text{ km}$)
  - DEM NoData: **0.000%** (100% valid elevation data)
  - HiRISE NoData: **0.045%** (virtually 100% valid color imagery)

---

## 3. Comparative Summary Table

| Metric | Candidate 1 (Centroid / Balanced Margin) | Candidate 2 (Max Traverse / North Shift) | Candidate 3 (West / Gediz Vallis Ridge) |
|---|---|---|---|
| **Center Easting / Northing** | $(8,144,000\text{ m}, -284,250\text{ m})$ | $(8,144,000\text{ m}, -283,000\text{ m})$ | $(8,142,500\text{ m}, -285,000\text{ m})$ |
| **Center Lon / Lat** | $(137.3942^\circ\text{E}, -4.7955^\circ\text{S})$ | $(137.3942^\circ\text{E}, -4.7744^\circ\text{S})$ | $(137.3689^\circ\text{E}, -4.8081^\circ\text{S})$ |
| **Easting Range** | $[8,141,500\text{ m}, 8,146,500\text{ m}]$ | $[8,141,500\text{ m}, 8,146,500\text{ m}]$ | $[8,140,000\text{ m}, 8,145,000\text{ m}]$ |
| **Northing Range** | $[-286,750\text{ m}, -281,750\text{ m}]$ | $[-285,500\text{ m}, -280,500\text{ m}]$ | $[-287,500\text{ m}, -282,500\text{ m}]$ |
| **Sols 4000–4868 Points** | **8,145 / 8,145 (100.0%)** | **8,145 / 8,145 (100.0%)** | **8,145 / 8,145 (100.0%)** |
| **Total Route Points** | 12,978 | **21,358** | 10,184 |
| **Sol Range Inside Box** | Sols 3478–4868 | **Sols 2568–4868** | Sols 3776–4868 |
| **Route Length (4000–4868)** | $5.81\text{ km}$ ($5,806.23\text{ m}$) | $5.81\text{ km}$ ($5,806.23\text{ m}$) | $5.81\text{ km}$ ($5,806.23\text{ m}$) |
| **Total Route Length Inside** | $8.95\text{ km}$ ($8,945.06\text{ m}$) | **14.94 km** ($14,937.15\text{ m}$) | $7.10\text{ km}$ ($7,104.65\text{ m}$) |
| **DEM Elevation Range** | $[-4,143.72\text{ m}, -3,172.81\text{ m}]$ | $[-4,242.18\text{ m}, -3,276.88\text{ m}]$ | $[-4,174.84\text{ m}, -3,178.78\text{ m}]$ |
| **DEM Relief** | $970.91\text{ m}$ | $965.30\text{ m}$ | **996.06 m** |
| **Fully Inside DEM?** | **Yes** ($\ge 13.5\text{ km}$ margin) | **Yes** ($\ge 13.5\text{ km}$ margin) | **Yes** ($\ge 12.0\text{ km}$ margin) |
| **Fully Inside HiRISE?** | **Yes** ($\ge 1.5\text{ km}$ margin) | **Yes** ($\ge 1.5\text{ km}$ margin) | **Yes** ($0.0\text{ m}$ at West edge) |
| **DEM NoData %** | **0.000%** | **0.000%** | **0.000%** |
| **HiRISE NoData %** | **0.042%** | **0.004%** | **0.045%** |

---

## 4. Recommendation for Red Quest Game Map

- **Recommended Selection:** **Candidate 1 (Centroid / Maximum Margin Box)**.
  - Centering on $(8,144,000\text{ m}, -284,250\text{ m})$ keeps the entire late-mission journey (Sols 4000–4868) situated right in the center of the 3D game canvas with equal spatial buffer (~1.5 km) on all borders.
  - It maintains zero NoData in elevation, provides $970.9\text{ m}$ of dramatic Mount Sharp topography, and offers comfortable margins away from the edges of the HiRISE strip.
- **Alternative for Maximum Story/Gameplay Missions:** **Candidate 2**, which adds another $6\text{ km}$ of drivable historical rover path (spanning back through Sol 2568) into the same 5 km × 5 km browser viewport.
