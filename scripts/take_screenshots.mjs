import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
<<<<<<< HEAD
import { execSync } from 'child_process';
=======
>>>>>>> 5dca7156e112cb01dd588f800ac072464bf5822e

const outDir = path.resolve('docs/screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

<<<<<<< HEAD
async function captureAll() {
  console.log('Launching browser at 1440x900...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--window-size=1440,900']
=======
async function capture() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--ignore-gpu-blocklist', '--window-size=1440,900']
>>>>>>> 5dca7156e112cb01dd588f800ac072464bf5822e
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  });

  const page = await context.newPage();
  console.log('Navigating to http://localhost:4173...');
  await page.goto('http://localhost:4173');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  // 1. Loading overlay
  const loading = page.locator('#loading-overlay');
  if (await loading.isVisible()) {
    console.log('Waiting for loading overlay to hide...');
    await page.waitForSelector('#loading-overlay', { state: 'hidden', timeout: 20000 }).catch(() => {});
  }
  await page.waitForTimeout(600);

  // 2. Intro overlay -> Mission Select
  const introOverlay = page.locator('#intro-overlay');
  if (await introOverlay.isVisible()) {
    console.log('Skipping intro overlay...');
    await page.keyboard.press('Space');
    await page.waitForTimeout(800);
  }

  // 3. Mission Select -> Start Mission 1
  const mission1Btn = page.locator('#btn-mission1-start');
  if (await mission1Btn.isVisible()) {
    console.log('Clicking Mission 1 start...');
    await mission1Btn.click();
    await page.waitForTimeout(1000);
  }

  // 4. Tutorial -> Skip
  const tutorialSkip = page.locator('#btn-tutorial-skip');
  if (await tutorialSkip.isVisible()) {
    console.log('Skipping tutorial...');
    await tutorialSkip.click();
    await page.waitForTimeout(800);
  }

<<<<<<< HEAD
  // 01. Briefing Overlay
=======
  // 5. Briefing Overlay
>>>>>>> 5dca7156e112cb01dd588f800ac072464bf5822e
  console.log('Waiting for #game-briefing-overlay...');
  await page.waitForSelector('#game-briefing-overlay:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(1200);
  console.log('Capturing 01-briefing.png...');
  await page.screenshot({ path: path.join(outDir, '01-briefing.png') });

<<<<<<< HEAD
  // 02. Start Mission -> Enter Analyze
  console.log('Starting mission into Analyze stage...');
  await page.click('#btn-start-mission');
  await page.waitForTimeout(500);

  // Skip cinematic intro safely
  await page.evaluate(() => {
    const btn = document.getElementById('btn-skip-intro');
    if (btn) btn.click();
  });
  await page.waitForTimeout(3500); // Wait for terrain, elevation tiles, 3D lines

  // Enable Show all elements
  await page.evaluate(() => {
    const btn = document.getElementById('btn-show-all-elements');
    if (btn && !btn.classList.contains('active')) btn.click();
  });
  await page.waitForTimeout(600);

  // Enable Curiosity path
  await page.evaluate(() => {
    const btn = document.getElementById('btn-curiosity-path');
    if (btn && !btn.classList.contains('active')) btn.click();
  });
  await page.waitForTimeout(600);

  // Ensure planner panel is collapsed so the full 3D terrain and all glowing routes/elements are visible
  await page.evaluate(() => {
    const p = document.getElementById('planner-panel');
    if (p && !p.classList.contains('collapsed')) {
      const toggle = document.getElementById('btn-toggle-planner') || document.getElementById('btn-dock-routes');
      if (toggle) toggle.click();
    }
  });
  await page.waitForTimeout(1500);

  console.log('Capturing 02-analyze-routes.png (full 3D terrain with all elements)...');
  await page.screenshot({ path: path.join(outDir, '02-analyze-routes.png') });

  // 03. Candidate Traverses Evaluation Table
  console.log('Expanding candidate traverses table...');
  await page.evaluate(() => {
    const p = document.getElementById('planner-panel');
    if (p && p.classList.contains('collapsed')) {
      const toggle = document.getElementById('btn-dock-routes') || document.getElementById('btn-toggle-planner');
      if (toggle) toggle.click();
    }
  });
  await page.waitForTimeout(1000);
  console.log('Capturing 03-candidate-table.png...');
  await page.screenshot({ path: path.join(outDir, '03-candidate-table.png') });

  // Collapse planner panel back
  await page.evaluate(() => {
    const p = document.getElementById('planner-panel');
    if (p && !p.classList.contains('collapsed')) {
      const toggle = document.getElementById('btn-toggle-planner') || document.getElementById('btn-dock-routes');
      if (toggle) toggle.click();
    }
  });
  await page.waitForTimeout(500);

  // Open Decision Lenses dock
=======
  // 6. Start Mission -> Enter Analyze
  console.log('Starting mission into Analyze stage...');
  await page.click('#btn-start-mission');
  await page.waitForTimeout(600);

  // Skip cinematic intro if present
  const skipBtn = page.locator('#btn-skip-intro');
  if (await skipBtn.isVisible()) {
    console.log('Skipping cinematic intro...');
    await skipBtn.click();
  }
  await page.waitForTimeout(3500); // Wait for terrain, elevation tiles, 3D lines

  // Ensure Candidate Traverses panel (#planner-panel) is open
  const plannerPanel = page.locator('#planner-panel');
  if (await plannerPanel.isVisible()) {
    const isCollapsed = await plannerPanel.evaluate(el => el.classList.contains('collapsed'));
    if (isCollapsed) {
      console.log('Expanding planner panel...');
      const btnDockRoutes = page.locator('#btn-dock-routes');
      if (await btnDockRoutes.isVisible()) {
        await btnDockRoutes.click();
        await page.waitForTimeout(800);
      }
    }
  }

  console.log('Capturing 02-analyze-routes.png...');
  await page.screenshot({ path: path.join(outDir, '02-analyze-routes.png') });

  // 7. Terrain Lens
  console.log('Opening Decision Lenses & switching to Terrain lens...');
>>>>>>> 5dca7156e112cb01dd588f800ac072464bf5822e
  const layersPanel = page.locator('#layers-panel');
  const isLayersOpen = await layersPanel.evaluate(el => el.classList.contains('open'));
  if (!isLayersOpen) {
    const btnLenses = page.locator('#btn-lenses');
    if (await btnLenses.isVisible()) {
      await btnLenses.click();
      await page.waitForTimeout(600);
    }
  }
<<<<<<< HEAD

  // 04. Terrain Lens
  console.log('Switching to Terrain lens...');
  await page.click('[data-lens="terrain"]');
  await page.waitForTimeout(1500);
  console.log('Capturing 04-terrain-lens.png...');
  await page.screenshot({ path: path.join(outDir, '04-terrain-lens.png') });

  // 05. Minerals Lens
  console.log('Switching to Minerals lens...');
  await page.click('[data-lens="minerals"]');
  await page.waitForTimeout(1500);
  console.log('Capturing 05-minerals-lens.png...');
  await page.screenshot({ path: path.join(outDir, '05-minerals-lens.png') });

  // 06. Heat Lens
  console.log('Switching to Heat lens...');
  await page.click('[data-lens="heat"]');
  await page.waitForTimeout(1500);
  console.log('Capturing 06-heat-lens.png...');
  await page.screenshot({ path: path.join(outDir, '06-heat-lens.png') });

  // 07. Sun & Power Lens
  console.log('Switching to Sun & Power lens...');
  await page.click('[data-lens="sun"]');
  await page.waitForTimeout(1800);
  console.log('Capturing 07-sun-power-lens.png...');
  await page.screenshot({ path: path.join(outDir, '07-sun-power-lens.png') });

  // 08. Radiation Shelter Lens
  console.log('Switching to Radiation Shelter lens...');
  await page.click('[data-lens="radiation"]');
  await page.waitForTimeout(1500);
  console.log('Capturing 08-radiation-lens.png...');
  await page.screenshot({ path: path.join(outDir, '08-radiation-lens.png') });
=======
  await page.click('[data-lens="terrain"]');
  await page.waitForTimeout(1200);
  console.log('Capturing 03-terrain-lens.png...');
  await page.screenshot({ path: path.join(outDir, '03-terrain-lens.png') });

  // 8. Minerals Lens
  console.log('Switching to Minerals lens...');
  await page.click('[data-lens="minerals"]');
  await page.waitForTimeout(1200);
  console.log('Capturing 04-minerals-lens.png...');
  await page.screenshot({ path: path.join(outDir, '04-minerals-lens.png') });

  // 9. Heat Lens
  console.log('Switching to Heat lens...');
  await page.click('[data-lens="heat"]');
  await page.waitForTimeout(1200);
  console.log('Capturing 05-heat-lens.png...');
  await page.screenshot({ path: path.join(outDir, '05-heat-lens.png') });

  // 10. Sun & Power Lens
  console.log('Switching to Sun & Power lens...');
  await page.click('[data-lens="sun"]');
  await page.waitForTimeout(1500);
  console.log('Capturing 06-sun-power-lens.png...');
  await page.screenshot({ path: path.join(outDir, '06-sun-power-lens.png') });
>>>>>>> 5dca7156e112cb01dd588f800ac072464bf5822e

  // Switch back to satellite lens and close lenses panel
  await page.click('[data-lens="satellite"]');
  await page.waitForTimeout(600);
  const btnLensesToggle = page.locator('#btn-lenses');
  if (await btnLensesToggle.isVisible()) {
    await btnLensesToggle.click();
    await page.waitForTimeout(400);
  }

<<<<<<< HEAD
  // 09. Survey Kit
=======
  // 11. Survey Kit
>>>>>>> 5dca7156e112cb01dd588f800ac072464bf5822e
  console.log('Opening Survey Kit...');
  const calcBtn = page.locator('#btn-calc-toggle');
  if (await calcBtn.isVisible()) {
    await calcBtn.click();
<<<<<<< HEAD
    await page.waitForTimeout(1200);
  }
  console.log('Capturing 09-survey-kit.png...');
  await page.screenshot({ path: path.join(outDir, '09-survey-kit.png') });
=======
    await page.waitForTimeout(1000);
  }
  console.log('Capturing 07-survey-kit.png...');
  await page.screenshot({ path: path.join(outDir, '07-survey-kit.png') });
>>>>>>> 5dca7156e112cb01dd588f800ac072464bf5822e

  // Close Survey Kit
  if (await calcBtn.isVisible()) {
    await calcBtn.click();
    await page.waitForTimeout(400);
  }

<<<<<<< HEAD
  // 10. Proceed to Choose Stage
=======
  // 12. Proceed to Choose Stage
>>>>>>> 5dca7156e112cb01dd588f800ac072464bf5822e
  console.log('Proceeding to Choose stage...');
  await page.evaluate(() => {
    const btn = document.getElementById('btn-go-choose');
    if (btn) btn.click();
  });
<<<<<<< HEAD
  await page.waitForTimeout(1500);
  console.log('Capturing 10-choose-lockin.png...');
  await page.screenshot({ path: path.join(outDir, '10-choose-lockin.png') });

  // 11. Lock Route and Go to Explore
=======
  await page.waitForTimeout(1200);
  console.log('Capturing 08-choose-lockin.png...');
  await page.screenshot({ path: path.join(outDir, '08-choose-lockin.png') });

  // 13. Lock Route and Go to Explore
>>>>>>> 5dca7156e112cb01dd588f800ac072464bf5822e
  console.log('Locking route...');
  await page.evaluate(() => {
    const btn = document.getElementById('btn-lock-route');
    if (btn) btn.click();
  });
  await page.waitForTimeout(1200);

  // Check if #survey-result-overlay appears
  const surveyResultCont = page.locator('#btn-survey-result-continue');
  if (await surveyResultCont.isVisible()) {
    console.log('Continuing from survey result overlay to Explore...');
    await surveyResultCont.click();
    await page.waitForTimeout(1000);
  }

  // Also dismiss explore hint if visible
  const exploreHintClose = page.locator('#btn-explore-hint-close');
  if (await exploreHintClose.isVisible()) {
    console.log('Dismissing explore hint...');
    await exploreHintClose.click();
    await page.waitForTimeout(500);
  }

<<<<<<< HEAD
  await page.waitForTimeout(2500); // Rover HUD rendered
  console.log('Capturing 11-explore-hud.png...');
  await page.screenshot({ path: path.join(outDir, '11-explore-hud.png') });

  // 12. Finish Explore -> Debrief
=======
  await page.waitForTimeout(2000); // Rover HUD rendered
  console.log('Capturing 09-explore-hud.png...');
  await page.screenshot({ path: path.join(outDir, '09-explore-hud.png') });

  // 14. Finish Explore -> Debrief
>>>>>>> 5dca7156e112cb01dd588f800ac072464bf5822e
  console.log('Proceeding to Debrief stage...');
  await page.evaluate(() => {
    const btn = document.getElementById('btn-explore-finish') || document.getElementById('btn-go-debrief') || document.getElementById('btn-finish-drive');
    if (btn) btn.click();
  });
  await page.waitForSelector('#game-debrief-overlay:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(1500);
<<<<<<< HEAD
  console.log('Capturing 12-debrief-score.png...');
  await page.screenshot({ path: path.join(outDir, '12-debrief-score.png') });

  // Dismiss debrief overlay
  await page.evaluate(() => {
    const b = document.getElementById('btn-debrief-close') || document.getElementById('btn-debrief-dismiss');
    if (b) b.click();
  });
  await page.waitForTimeout(600);

  // 13. Switch to RESEARCH mode
  console.log('Switching to RESEARCH mode...');
  await page.click('button[data-mode="RESEARCH"]');
  await page.waitForTimeout(2000);

  // Close any open side panels in research mode for clean overview
  await page.evaluate(() => {
    const lp = document.getElementById('layers-panel');
    if (lp && lp.classList.contains('open')) {
      const toggle = lp.querySelector('.panel-toggle');
      if (toggle) toggle.click();
    }
    const ip = document.getElementById('inspector-panel');
    if (ip && ip.classList.contains('open')) {
      const toggle = ip.querySelector('.panel-toggle');
      if (toggle) toggle.click();
    }
  });
  await page.waitForTimeout(1000);

  console.log('Capturing 13-research-overview.png...');
  await page.screenshot({ path: path.join(outDir, '13-research-overview.png') });

  // 14. Research Layers Stack
  console.log('Opening Research Mode Layers Panel and expanding all layer groups...');
  await page.evaluate(() => {
    const lp = document.getElementById('layers-panel');
    if (lp && !lp.classList.contains('open')) {
      const toggle = lp.querySelector('.panel-toggle');
      if (toggle) toggle.click();
    }
    document.querySelectorAll('#research-layers-content details').forEach(d => {
      d.open = true;
    });
  });
  await page.waitForTimeout(1500);
  console.log('Capturing 14-research-layers.png...');
  await page.screenshot({ path: path.join(outDir, '14-research-layers.png') });

  // 15. Research Point Inspector
  console.log('Opening Point Inspector in Research Mode and sampling terrain...');
  await page.evaluate(() => {
    // Close layers panel
    const lp = document.getElementById('layers-panel');
    if (lp && lp.classList.contains('open')) {
      const toggle = lp.querySelector('.panel-toggle');
      if (toggle) toggle.click();
    }
    // Open inspector panel
    const ip = document.getElementById('inspector-panel');
    if (ip && !ip.classList.contains('open')) {
      const toggle = ip.querySelector('.panel-toggle');
      if (toggle) toggle.click();
    }
  });
  await page.waitForTimeout(600);

  // Sample terrain coordinates by clicking on the 3D map
  await page.mouse.click(720, 480);
  await page.waitForTimeout(1200);

  console.log('Capturing 15-research-inspector.png...');
  await page.screenshot({ path: path.join(outDir, '15-research-inspector.png') });

  await browser.close();
  console.log('Successfully captured all 15 raw screenshots!');

  // Trigger optimization
  console.log('Optimizing screenshots with Python...');
  try {
    execSync('python scripts/optimize_15_screenshots.py', { stdio: 'inherit' });
  } catch (err) {
    console.error('Error during optimization:', err);
  }
}

captureAll().catch(err => {
  console.error('Capture error:', err);
=======
  console.log('Capturing 10-debrief-score.png...');
  await page.screenshot({ path: path.join(outDir, '10-debrief-score.png') });

  await browser.close();
  console.log('All 10 screenshots captured successfully.');
}

capture().catch(err => {
  console.error('Error during capture:', err);
>>>>>>> 5dca7156e112cb01dd588f800ac072464bf5822e
  process.exit(1);
});
