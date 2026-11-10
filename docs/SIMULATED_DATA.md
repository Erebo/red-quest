# Simulated Data Formulas

> [!IMPORTANT]
> All values in this document are **game-design simulations**, not NASA data.
> They are deterministic functions of position, elevation, slope, and time of
> day so that the same point always yields the same value (no randomness).
> They are labelled "Simulated (game model, not NASA data)" in the UI.

## 1. Estimated Radiation Dose Rate (µSv/h)

Based on Curiosity RAD measurements, baseline ~20 µSv/h at surface.
Varies with elevation (thinner atmosphere at higher elevations) and
time of day (diurnal atmospheric pressure cycle).

```
baseRate = 20.0
elevFactor = 1.0 + (elevation - (-4131.74)) / 3000.0 * 0.15
timeFactor = 1.0 + 0.08 * cos((hour - 14.0) * PI / 12.0)
doseRate = baseRate * elevFactor * timeFactor
```

**Range:** ~17–27 µSv/h. Units: microsieverts per hour.
**Source rationale:** MSL RAD measures ~0.67 mGy/day ≈ 28 µSv/h.

## 2. Dust Opacity (τ)

Mars dust opacity (tau) typically ranges 0.3–1.5 outside dust storm
season. Modeled as a gentle spatial gradient plus elevation effect.

```
baseTau = 0.60
spatialWave = 0.15 * sin(localX / 800.0) * cos(localY / 600.0)
elevEffect = 0.05 * (elevation - (-4131.74)) / 700.0
tau = baseTau + spatialWave + elevEffect
visibility_km = 15.0 / max(tau, 0.1)
```

**Range:** τ ≈ 0.3–0.9, visibility ≈ 17–50 km.

## 3. Estimated Surface Temperature (°C)

Mars surface temperatures range roughly -80°C to +20°C. Modeled with
a strong diurnal cycle, slope-facing correction, and elevation lapse.

```
noonTemp = -15.0
diurnalAmplitude = 45.0
diurnalPhase = cos((hour - 14.0) * PI / 12.0)
temp = noonTemp + diurnalAmplitude * diurnalPhase
slopeCorrection = -0.3 * slopeDeg
elevLapse = -0.005 * (elevation - (-4131.74))   // ~5°C per km
surfaceTemp = temp + slopeCorrection + elevLapse
```

**Range:** approximately -65°C to +25°C.

## 4. Wind Speed (m/s) and Direction

Mars winds typically 2–15 m/s at the surface. Modeled with a spatial
hash for direction and a diurnal thermal cycle.

```
baseWind = 5.0
thermalComponent = 3.0 * abs(sin((hour - 12.0) * PI / 12.0))
terrainEffect = 1.5 * sin(slopeDeg * PI / 60.0)
windSpeed = baseWind + thermalComponent + terrainEffect

// Direction from a spatial hash (deterministic)
windDirDeg = ((localX * 7.3 + localY * 13.1) % 360 + 360) % 360
```

**Range:** ~3–12 m/s. Direction: 0–360°.

## 5. Communication Signal Strength (dBm)

Models line-of-sight path loss to an orbiter. Stronger at higher
elevations and in flatter terrain (less shadowing).

```
basePower = -70.0
elevBoost = 3.0 * (elevation - (-4131.74)) / 700.0
slopePenalty = -0.15 * slopeDeg
signalStrength = basePower + elevBoost + slopePenalty
```

**Range:** approximately -75 to -60 dBm.

## 6. Mobility Cost (arbitrary units, 0–100)

A composite game metric for how difficult it is to traverse this point.
Combines slope, surface roughness (approximated from slope variance),
and an elevation fatigue factor.

```
slopeCost = min(slopeDeg / 35.0 * 60.0, 60.0)
roughnessCost = min(slopeDeg * slopeDeg / 900.0 * 25.0, 25.0)
elevCost = 15.0 * (elevation - (-4131.74)) / 700.0
mobilityCost = min(slopeCost + roughnessCost + elevCost, 100.0)
```

**Range:** 0 (flat, low) to 100 (impassable steep slope).
- 0–30: Easy traverse
- 30–60: Moderate, reduced speed
- 60–100: Difficult or impassable

## 7. Route Planner: Estimated Walking / Drive Time (hours)

Estimated rover drive duration modeled from nominal cruise speed, terrain slope slowing factor, and climbing ascent rate.

```
baseSpeed_kmh = 0.10   // 100 m/h nominal cruise speed on flat terrain

for each route segment i (length d_i, slope s_i in degrees, elevation change dz_i):
    // Slope slowing factor: reduces speed as terrain inclination increases
    slopeRad = s_i * PI / 180.0
    modReduction = clamp((s_i - 15.0) / 10.0, 0.0, 1.0)
    eta_slope = max(0.20, cos(slopeRad) * (1.0 - 0.40 * modReduction))
    
    speed_i = baseSpeed_kmh * 1000.0 * eta_slope   // m/h
    dt_flat = d_i / speed_i                        // hours
    
    // Vertical climb delay for uphill segments (ascent dz > 0)
    ascent_i = max(0.0, dz_i)
    dt_climb = ascent_i / 20.0                     // 20 m/h vertical climbing limit
    
    dt_i = dt_flat + dt_climb
    totalTime_h += dt_i
```

**Range:** ~30–60 hours for typical 3–4 km traverses depending on slope and ascent.

## 8. Route Planner: Energy Expenditure (kWh)

Total electrical and mechanical energy consumed by the rover along the candidate route. Combines vehicle baseline housekeeping load, electric drive motor consumption on terrain, and gravitational work done on uphill ascents.

```
roverMass_kg = 899.0          // Curiosity MSL rover mass
gravityMars = 3.72            // m/s^2
driveEfficiency = 0.60        // mechanical transmission and motor efficiency
powerBaseline_kW = 0.11       // 110 W avionics, thermal loop, science idle
powerDrive_kW = 0.14          // 140 W wheel actuators and motor controllers

for each route segment i (time dt_i in hours, ascent dz_i in metres):
    // Hotel and motor electrical energy
    e_electrical = (powerBaseline_kW + powerDrive_kW) * dt_i   // kWh
    
    // Mechanical work against Martian gravity on ascent
    ascent_i = max(0.0, dz_i)
    w_gravity = (roverMass_kg * gravityMars * ascent_i) / (driveEfficiency * 3.6e6) // kWh
    
    totalEnergy_kWh += (e_electrical + w_gravity)
```

**Range:** ~9–16 kWh per candidate route.

## 9. Route Planner: Cumulative Radiation Exposure (µSv)

Integrates the position- and elevation-dependent radiation dose rate (from Section 1) over travel time along the route:

```
for each route segment i (time dt_i in hours, waypoint elevation z_i):
    doseRate_i = 20.0 * (1.0 + (z_i - (-4131.74)) / 3000.0 * 0.15) // µSv/h
    totalRadiation_uSv += doseRate_i * dt_i
```

**Range:** ~700–1200 µSv depending on duration and elevation profile.

## 10. Route Planner: Risk Score (0–100)

Composite safety metric evaluating overall route difficulty, wheel slip risk on moderate inclines, and total vertical climbing exposure:

```
riskScore = min(100.0, (
    0.40 * pct_moderate +
    2.00 * pct_hazardous +
    0.35 * (max_slope_deg / 25.0) * 100.0 +
    0.25 * (total_ascent_m / 300.0) * 100.0
) * 0.35)
```

**Scale:**
- 0–15: Low risk (predominantly flat, gentle grades)
- 15–30: Moderate risk (requires careful wheel steering across moderate slopes)
- 30–100: High risk (steep passes, extensive climb, terrain hazards)
