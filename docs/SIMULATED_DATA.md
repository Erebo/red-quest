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
