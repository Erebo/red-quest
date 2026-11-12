// Web Worker for Mars Rover Route Planning (A* Search)
console.log('--- inside Worker scope ---');

class MinBinaryHeap {
  constructor() {
    this.heap = [];
  }
  push(node) {
    this.heap.push(node);
    this._bubbleUp(this.heap.length - 1);
  }
  pop() {
    if (this.heap.length === 0) return null;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0) {
      this.heap[0] = bottom;
      this._sinkDown(0);
    }
    return top;
  }
  isEmpty() {
    return this.heap.length === 0;
  }
  _bubbleUp(idx) {
    const element = this.heap[idx];
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      const parent = this.heap[parentIdx];
      if (element.f >= parent.f) break;
      this.heap[idx] = parent;
      this.heap[parentIdx] = element;
      idx = parentIdx;
    }
  }
  _sinkDown(idx) {
    const length = this.heap.length;
    const element = this.heap[idx];
    while (true) {
      let leftChildIdx = (idx << 1) + 1;
      let rightChildIdx = leftChildIdx + 1;
      let swap = null;

      if (leftChildIdx < length) {
        if (this.heap[leftChildIdx].f < element.f) {
          swap = leftChildIdx;
        }
      }
      if (rightChildIdx < length) {
        if (
          (swap === null && this.heap[rightChildIdx].f < element.f) ||
          (swap !== null && this.heap[rightChildIdx].f < this.heap[leftChildIdx].f)
        ) {
          swap = rightChildIdx;
        }
      }
      if (swap === null) break;
      this.heap[idx] = this.heap[swap];
      this.heap[swap] = element;
      idx = swap;
    }
  }
}

let N = 257;
let step = 5000.0 / (N - 1);
let gridH = null;
let gridS = null;
let sciMarkers = [];
let crismPixels = [];

// 8 neighbor directions: [dr, dc, isDiag]
const NEIGHBORS = [
  [-1, 0, false],
  [1, 0, false],
  [0, -1, false],
  [0, 1, false],
  [-1, -1, true],
  [-1, 1, true],
  [1, -1, true],
  [1, 1, true]
];
const SQRT2 = Math.SQRT2;

self.onmessage = function (e) {
  console.log('--- Worker onmessage received ---', e.data && e.data.type);
  const { type } = e.data;

  if (type === 'init') {
    N = e.data.gridSize || 257;
    step = 5000.0 / (N - 1);
    gridH = new Float32Array(e.data.heights);
    gridS = new Float32Array(e.data.slopes);
    console.log('Worker initialized with gridH:', gridH.length, 'gridS:', gridS.length);
    sciMarkers = e.data.sciMarkers || [];
    crismPixels = e.data.crismPixels || [];
    if (e.data.start && e.data.goal) {
      computeRoutes(e.data.start, e.data.goal);
    } else {
      self.postMessage({ type: 'initialized' });
    }
    return;
  }

  if (type === 'compute') {
    computeRoutes(e.data.start, e.data.goal);
  }
};

function computeRoutes(start, goal) {
  console.log('--- computeRoutes started ---', start, goal);
  const t0 = performance.now();

  // Convert local coords (0 to 5000) to grid coords (r, c)
  const startC = Math.max(0, Math.min(N - 1, Math.round((start.x / 5000.0) * (N - 1))));
  const startR = Math.max(0, Math.min(N - 1, Math.round((1.0 - start.y / 5000.0) * (N - 1))));

  const goalC = Math.max(0, Math.min(N - 1, Math.round((goal.x / 5000.0) * (N - 1))));
  const goalR = Math.max(0, Math.min(N - 1, Math.round((1.0 - goal.y / 5000.0) * (N - 1))));

  // Precompute science marker grid coords
  const sciGrid = sciMarkers.map(m => ({
    r: Math.round((1.0 - m.y / 5000.0) * (N - 1)),
    c: Math.round((m.x / 5000.0) * (N - 1)),
    x: m.x,
    y: m.y
  }));

  // Precompute a distance transform / proximity field to science targets for fast O(1) lookup
  const sciProximity = new Float32Array(N * N);
  sciProximity.fill(1.0);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      let minD = Infinity;
      for (let s = 0; s < sciGrid.length; s++) {
        const dr = (r - sciGrid[s].r) * step;
        const dc = (c - sciGrid[s].c) * step;
        const d = Math.sqrt(dr * dr + dc * dc);
        if (d < minD) minD = d;
      }
      sciProximity[r * N + c] = 0.35 + 0.65 * Math.min(1.0, minD / 250.0);
    }
  }

  const modes = [
    { id: 'safest', name: 'Low-slope', bestFor: 'Low slope', color: '#2ecc71' },
    { id: 'shortest', name: 'Direct', bestFor: 'Direct line', color: '#00d2ff' },
    { id: 'science', name: 'Mineral survey', bestFor: 'Mineral survey', color: '#e056fd' },
    { id: 'energy', name: 'Energy-optimized', bestFor: 'Energy-optimized', color: '#f39c12' }
  ];

  const candidates = [];

  for (const m of modes) {
    const res = runAStar(m.id, startR, startC, goalR, goalC, sciProximity);
    if (res) {
      res.id = m.id;
      res.name = m.name;
      res.bestFor = m.bestFor;
      res.color = m.color;
      candidates.push(res);
    } else {
      candidates.push({
        id: m.id,
        name: m.name,
        bestFor: m.bestFor,
        color: m.color,
        error: 'No safe route found'
      });
    }
  }

  const computeTimeMs = Math.round(performance.now() - t0);
  console.log('--- computeRoutes finished, time:', computeTimeMs, 'ms, candidates:', candidates.length);
  self.postMessage({ type: 'result', candidates, computeTimeMs, start, goal });
}

function runAStar(mode, startR, startC, goalR, goalC, sciProximity) {
  const totalCells = N * N;
  const dist = new Float32Array(totalCells);
  dist.fill(Infinity);
  const parent = new Int32Array(totalCells);
  parent.fill(-1);
  const closed = new Uint8Array(totalCells);

  const startIdx = startR * N + startC;
  dist[startIdx] = 0.0;

  function heuristic(r, c) {
    const dr = (r - goalR) * step;
    const dc = (c - goalC) * step;
    return Math.sqrt(dr * dr + dc * dc);
  }

  const pq = new MinBinaryHeap();
  pq.push({ f: heuristic(startR, startC), g: 0.0, r: startR, c: startC });

  let reached = false;

  while (!pq.isEmpty()) {
    const curr = pq.pop();
    const r = curr.r;
    const c = curr.c;
    const currIdx = r * N + c;

    if (closed[currIdx]) continue;
    closed[currIdx] = 1;

    if (r === goalR && c === goalC) {
      reached = true;
      break;
    }

    const curElev = gridH[currIdx];

    for (let i = 0; i < 8; i++) {
      const nr = r + NEIGHBORS[i][0];
      const nc = c + NEIGHBORS[i][1];
      if (nr < 0 || nr >= N || nc < 0 || nc >= N) continue;

      const nIdx = nr * N + nc;
      if (closed[nIdx]) continue;

      const slope = gridS[nIdx];
      // Strictly impassable: never cross hazardous (> 25 deg)
      if (slope > 25.0) continue;

      const dHoriz = NEIGHBORS[i][2] ? step * SQRT2 : step;
      const nxtElev = gridH[nIdx];
      const delev = nxtElev - curElev;
      const d3 = Math.sqrt(dHoriz * dHoriz + delev * delev);

      let stepCost = d3;

      if (mode === 'shortest') {
        // Minimum distance, tiny slope factor
        stepCost = d3 * (1.0 + (slope / 25.0) * 0.05);
      } else if (mode === 'safest') {
        // High avoidance of moderate slopes (15-25 deg)
        let pen = (slope / 15.0) * 0.4;
        if (slope >= 15.0) {
          pen = 5.0 + (slope - 15.0) * 2.0;
        }
        stepCost = d3 * (1.0 + pen);
      } else if (mode === 'energy') {
        // Penalize uphill climb most
        const ascent = Math.max(0.0, delev);
        stepCost = d3 * (1.0 + (slope / 25.0) * 0.2) + ascent * 28.0;
      } else if (mode === 'science') {
        // Lowers cost near science markers and CRISM points
        const sciFactor = sciProximity ? sciProximity[nIdx] : 1.0;
        stepCost = d3 * (1.0 + (slope / 25.0) * 0.2) * sciFactor;
      }

      const newG = curr.g + stepCost;
      if (newG < dist[nIdx]) {
        dist[nIdx] = newG;
        parent[nIdx] = currIdx;
        pq.push({ f: newG + heuristic(nr, nc), g: newG, r: nr, c: nc });
      }
    }
  }

  const goalIdx = goalR * N + goalC;
  if (!reached || dist[goalIdx] === Infinity) return null;

  // Reconstruct path
  const path = [];
  let currIdx = goalIdx;
  while (currIdx !== -1) {
    const r = Math.floor(currIdx / N);
    const c = currIdx % N;
    path.push({ r, c });
    currIdx = parent[currIdx];
  }
  path.reverse();

  // Build Waypoints & Calculate Metrics
  const waypoints = [];
  let cumDist = 0.0;
  let totAscent = 0.0;
  let maxSlope = 0.0;
  let easyCount = 0;
  let modCount = 0;
  let hazCount = 0;

  for (let i = 0; i < path.length; i++) {
    const r = path[i].r;
    const c = path[i].c;
    const lx = (c / (N - 1)) * 5000.0;
    const ly = (1.0 - r / (N - 1)) * 5000.0;
    const elev = gridH[r * N + c];
    const sl = gridS[r * N + c];

    if (sl < 15.0) easyCount++;
    else if (sl <= 25.0) modCount++;
    else hazCount++;
    if (sl > maxSlope) maxSlope = sl;

    let segDist = 0.0;
    let segAscent = 0.0;
    if (i > 0) {
      const prev = waypoints[i - 1];
      const dx = lx - prev.x;
      const dy = ly - prev.y;
      const dz = elev - prev.z;
      segDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      cumDist += segDist;
      if (dz > 0) {
        segAscent = dz;
        totAscent += dz;
      }
    }

    const tier = sl < 15.0 ? 'easy' : (sl <= 25.0 ? 'mod' : 'haz');
    waypoints.push({
      x: lx,
      y: ly,
      z: elev,
      slope: sl,
      tier,
      distM: cumDist,
      segDist,
      segAscent
    });
  }

  const totalPts = waypoints.length;
  const netElev = waypoints[totalPts - 1].z - waypoints[0].z;
  const pctEasy = (easyCount / totalPts) * 100.0;
  const pctMod = (modCount / totalPts) * 100.0;
  const pctHaz = (hazCount / totalPts) * 100.0;

  // Simulated Formulas (Sections 7, 8, 9, 10 in SIMULATED_DATA.md)
  let timeHours = 0.0;
  let energyKwh = 0.0;
  let radDoseUsv = 0.0;

  const v0 = 100.0; // m/h
  const pBase = 0.11; // kW
  const pDrive = 0.14; // kW
  const mRover = 899.0; // kg
  const gMars = 3.72;
  const eta = 0.60;

  for (let i = 1; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const segD = wp.segDist;
    const ascent = wp.segAscent;
    const sl = wp.slope;

    const slopeRad = (sl * Math.PI) / 180.0;
    const modReduction = Math.min(1.0, Math.max(0.0, (sl - 15.0) / 10.0));
    const etaSlope = Math.max(0.20, Math.cos(slopeRad) * (1.0 - 0.40 * modReduction));
    const speed = v0 * etaSlope;
    const dtFlat = segD / speed;
    const dtClimb = ascent / 20.0;
    const dt = dtFlat + dtClimb;
    timeHours += dt;

    const wGravity = (mRover * gMars * ascent) / (eta * 3.6e6);
    energyKwh += (pBase + pDrive) * dt + wGravity;

    const doseRate = 20.0 * (1.0 + (wp.z - (-4131.74)) / 3000.0 * 0.15);
    radDoseUsv += doseRate * dt;
  }

  // Science Score: CRISM hydrated pixels within 100m + science markers within 100m
  let crismHits = 0;
  for (let c = 0; c < crismPixels.length; c++) {
    const cp = crismPixels[c];
    let minD = Infinity;
    for (let w = 0; w < waypoints.length; w++) {
      const dx = cp.x - waypoints[w].x;
      const dy = cp.y - waypoints[w].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minD) minD = d;
      if (minD <= 100.0) break;
    }
    if (minD <= 100.0) crismHits++;
  }

  let markerHits = 0;
  for (let s = 0; s < sciMarkers.length; s++) {
    const sm = sciMarkers[s];
    let minD = Infinity;
    for (let w = 0; w < waypoints.length; w++) {
      const dx = sm.x - waypoints[w].x;
      const dy = sm.y - waypoints[w].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minD) minD = d;
      if (minD <= 100.0) break;
    }
    if (minD <= 100.0) markerHits++;
  }

  const sciScore = crismHits + markerHits;

  // Risk Score (0-100)
  const riskScore = Math.min(
    100.0,
    (0.40 * pctMod + 2.0 * pctHaz + 0.35 * (maxSlope / 25.0) * 100.0 + 0.25 * (totAscent / 300.0) * 100.0) * 0.35
  );

  // Elevation Profile downsampled to ~60-80 chart points
  const profileStep = Math.max(1, Math.floor(waypoints.length / 75));
  const elevationProfile = [];
  for (let i = 0; i < waypoints.length; i += profileStep) {
    elevationProfile.push({
      distKm: waypoints[i].distM / 1000.0,
      elev: waypoints[i].z,
      slope: waypoints[i].slope,
      tier: waypoints[i].tier,
      x: waypoints[i].x,
      y: waypoints[i].y
    });
  }
  if (waypoints.length > 0 && elevationProfile[elevationProfile.length - 1].distKm !== waypoints[waypoints.length - 1].distM / 1000.0) {
    const last = waypoints[waypoints.length - 1];
    elevationProfile.push({
      distKm: last.distM / 1000.0,
      elev: last.z,
      slope: last.slope,
      tier: last.tier,
      x: last.x,
      y: last.y
    });
  }

  return {
    waypoints,
    distKm: cumDist / 1000.0,
    ascentM: totAscent,
    netElevM: netElev,
    maxSlopeDeg: maxSlope,
    pctEasy,
    pctMod,
    pctHaz,
    timeHours,
    energyKwh,
    radDoseUsv,
    sciScore,
    riskScore,
    elevationProfile
  };
}
