/**
 * Mars Rover Proximity Interactions & Scoring System
 * Handles scanning science outcrops, drilling core samples,
 * navigating hazards, harvesting solar ridge recharges,
 * and reaching the destination beacon.
 */

import { findDustZoneAtPoint } from '../dustZones.js';

export class RoverInteractions {
  constructor(levelData, elementsData, onCodexUnlock, onMissionComplete, onActionComplete) {
    this.levelData = levelData;
    this.elements = elementsData?.elements || [];
    this.goal = levelData?.goal || { x: 2470, y: 2382 };
    this.onCodexUnlock = onCodexUnlock;
    this.onMissionComplete = onMissionComplete;
    this.onActionComplete = onActionComplete;

    // Interaction state
    this.scienceScore = 0;
    this.discoveredIds = new Set();
    this.rechargedIds = new Set();
    this.totalPoiCount = this.elements.filter(
      e => e.family === 'science' || e.family === 'resource' || e.family === 'mystery'
    ).length;

    this.activePoi = null;
    this.activePrompt = null;
    this.isPerformingAction = false;
    this.actionType = null;
    this.actionTimer = 0.0;
    this.actionDuration = 1.5;
    this.actionProgress = 0.0;

    this.distanceToGoal = 9999.0;
    this.nearestPoi = null;
    this.isMissionCompleted = false;

    // Scan VFX
    this.scanningArmActive = false;
  }

  /**
   * Reset interaction state
   */
  reset() {
    this.scienceScore = 0;
    this.discoveredIds.clear();
    this.rechargedIds.clear();
    // Mystery anomalies go back to being unidentified on a fresh run.
    this.elements.forEach(el => { delete el.mysteryRevealed; });
    this.activePoi = null;
    this.activePrompt = null;
    this.isPerformingAction = false;
    this.isMissionCompleted = false;
    this.scanningArmActive = false;
  }

  get discoveredCount() {
    return this.discoveredIds.size;
  }

  /**
   * Main interaction update per frame
   * @param {number} dt Delta time
   * @param {object} physics RoverPhysics instance
   * @param {object} input Input state { action: bool, reset: bool }
   * @param {object} roverModel Rover THREE.Group instance
   */
  update(dt, physics, input, roverModel) {
    if (this.isMissionCompleted) return;

    const rx = physics.x;
    const ry = physics.y;

    // 1. Distance to Goal Beacon
    const dxGoal = rx - this.goal.x;
    const dyGoal = ry - this.goal.y;
    this.distanceToGoal = Math.hypot(dxGoal, dyGoal);

    // Goal reached? (Within 22 meters)
    if (this.distanceToGoal <= 22.0 && !this.isMissionCompleted) {
      this.isMissionCompleted = true;
      this.activePrompt = '🎯 OBJECTIVE REACHED!';
      if (this.onMissionComplete) {
        this.onMissionComplete({
          scienceScore: this.scienceScore,
          discoveredCount: this.discoveredCount,
          totalDistanceM: physics.totalDistanceM,
          batteryRemainingPct: physics.batteryPct,
          driveTimeSec: physics.driveTimeSec
        });
      }
      return;
    }

    // 2. Active action in progress (Scanning or Drilling)
    if (this.isPerformingAction) {
      this.actionTimer += dt;
      this.actionProgress = Math.min(1.0, this.actionTimer / this.actionDuration);

      // Stop rover during action
      physics.speed = 0;

      // Animate rover arm
      if (roverModel && roverModel.userData && roverModel.userData.setArmScanState) {
        roverModel.userData.setArmScanState(true, this.actionProgress);
      }

      if (this.actionTimer >= this.actionDuration) {
        // Complete action
        this.completeAction(physics);
      }
      return;
    }

    // Retract arm when not performing action
    if (roverModel && roverModel.userData && roverModel.userData.setArmScanState) {
      roverModel.userData.setArmScanState(false, 0.0);
    }

    // 3. Proximity detection to POIs and hazards
    let closestPoi = null;
    let closestDist = Infinity;
    let inHazard = false;
    this.activePoi = null;
    this.activePrompt = null;

    for (let i = 0; i < this.elements.length; i++) {
      const el = this.elements[i];
      const dist = Math.hypot(rx - el.x, ry - el.y);

      if (dist < closestDist && (el.family === 'science' || el.family === 'resource')) {
        closestDist = dist;
        closestPoi = { ...el, distanceM: dist };
      }

      // Check Hazard Proximity (e.g. Soft sand pocket, Rockfall zone)
      if (el.family === 'hazard' && dist <= 28.0) {
        inHazard = true;
      }

      // Check Solar Ridge / Resource Recharge
      if (el.family === 'resource' && (el.type === 'solar_ridge' || el.type === 'comm_relay_beacon') && dist <= 24.0) {
        if (!this.rechargedIds.has(el.id)) {
          this.rechargedIds.add(el.id);
          physics.rechargeBattery(25.0);
          this.activePrompt = `⚡ ${el.name}: +25% BATTERY RECHARGED`;
        }
      }

      // Mystery anomalies: anonymous until the player investigates one in Explore.
      if (dist <= 24.0 && !this.discoveredIds.has(el.id) && el.family === 'mystery') {
        this.activePoi = el;
        this.activePrompt = '[E] INVESTIGATE ANOMALY';
      }

      // Check Interactable Science Targets / Outcrops / Drill Sites
      if (dist <= 24.0 && !this.discoveredIds.has(el.id) && (el.family === 'science' || el.family === 'resource')) {
        this.activePoi = el;
        if (el.type === 'drill_site') {
          this.activePrompt = `[E] DRILL CORE SAMPLE (${el.shortLabel || 'Drill'})`;
        } else if (el.family === 'resource') {
          this.activePrompt = `[E] SURVEY ${(el.shortLabel || 'RESOURCE').toUpperCase()}`;
        } else {
          this.activePrompt = `[E] SCAN OUTCROP (${el.shortLabel || 'Science Target'})`;
        }
      }
    }

    this.nearestPoi = closestPoi;
    physics.isHazardSlowdown = inHazard;

    // Check if rover is inside any Level 1 dust storm zone or near dust hazard
    const inDustZone = Boolean(findDustZoneAtPoint(rx, ry));
    physics.isDustSlowdown = inDustZone;

    // Stuck prompt if slope is extreme and player is blocked
    if (physics.isClimbingBlocked) {
      this.activePrompt = 'STEEP CLIFF — SLOPE EXCEEDS TRACTION LIMIT';
    }

    // 4. Trigger Interaction on Key Press
    if (input.action && this.activePoi && !this.discoveredIds.has(this.activePoi.id)) {
      this.startAction(this.activePoi, physics);
    }
  }

  startAction(poi, physics) {
    this.isPerformingAction = true;
    this.actionTimer = 0.0;
    if (poi.type === 'drill_site') {
      this.actionType = 'drill';
      this.actionDuration = 2.2;
      physics.consumeBattery(20.0);
    } else if (poi.family === 'mystery') {
      this.actionType = 'scan';
      this.actionDuration = 2.0;
    } else {
      this.actionType = 'scan';
      this.actionDuration = 1.4;
    }
  }

  completeAction(physics) {
    this.isPerformingAction = false;
    const poi = this.activePoi;
    if (!poi) return;

    this.discoveredIds.add(poi.id);

    let points = 100;
    if (this.actionType === 'drill') {
      points = 250;
    } else if (poi.family === 'mystery') {
      // Rare planetary anomaly: one-off bonus, and the anomaly is now identified.
      points = 300;
      poi.mysteryRevealed = true;
    }
    this.scienceScore += points;

    // Unlock in Field Codex
    if (this.onCodexUnlock) {
      this.onCodexUnlock(poi);
    }

    // Build excitement alert & brief info for middle-of-screen typography response
    let alertTitle = 'NEW DISCOVERY!';
    if (this.actionType === 'drill') {
      alertTitle = 'CORE SAMPLE DRILLED!';
    } else if (poi.family === 'mystery') {
      alertTitle = 'RARE ANOMALY DISCOVERED!';
    } else if (poi.family === 'resource') {
      alertTitle = 'SURFACE RESOURCE SURVEYED!';
    }

    let brief = poi.whatIsIt?.text || poi.name;
    // Extract first sentence or clean short snippet for excitement briefing
    const periodIdx = brief.indexOf('.');
    if (periodIdx > 12 && periodIdx <= 120) {
      brief = brief.slice(0, periodIdx + 1);
    } else if (brief.length > 110) {
      brief = brief.slice(0, 105).trim() + '…';
    }
    const alertSubtitle = `${(poi.name || 'Sample Site').toUpperCase()} — ${brief}`;

    // Reward sting after the completion bar has finished.
    if (this.onActionComplete) {
      this.onActionComplete(this.actionType, poi, { title: alertTitle, subtitle: alertSubtitle });
    }

    this.activePrompt = poi.family === 'mystery'
      ? `✓ ANOMALY IDENTIFIED — ${poi.name}: +${points} SCIENCE POINTS`
      : `✓ ${poi.name}: +${points} SCIENCE POINTS`;
  }
}
