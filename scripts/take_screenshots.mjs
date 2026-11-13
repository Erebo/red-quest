import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const outDir = path.resolve('docs/screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function capture() {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
    args: ['--enable-webgl', '--use-gl=angle', '--ignore-gpu-blocklist', '--window-size=1440,900']
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

  // 5. Briefing Overlay
  console.log('Waiting for #game-briefing-overlay...');
  await page.waitForSelector('#game-briefing-overlay:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(1200);
  console.log('Capturing 01-briefing.png...');
  await page.screenshot({ path: path.join(outDir, '01-briefing.png') });

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
  const layersPanel = page.locator('#layers-panel');
  const isLayersOpen = await layersPanel.evaluate(el => el.classList.contains('open'));
  if (!isLayersOpen) {
    const btnLenses = page.locator('#btn-lenses');
    if (await btnLenses.isVisible()) {
      await btnLenses.click();
      await page.waitForTimeout(600);
    }
  }
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

  // Switch back to satellite lens and close lenses panel
  await page.click('[data-lens="satellite"]');
  await page.waitForTimeout(600);
  const btnLensesToggle = page.locator('#btn-lenses');
  if (await btnLensesToggle.isVisible()) {
    await btnLensesToggle.click();
    await page.waitForTimeout(400);
  }

  // 11. Survey Kit
  console.log('Opening Survey Kit...');
  const calcBtn = page.locator('#btn-calc-toggle');
  if (await calcBtn.isVisible()) {
    await calcBtn.click();
    await page.waitForTimeout(1000);
  }
  console.log('Capturing 07-survey-kit.png...');
  await page.screenshot({ path: path.join(outDir, '07-survey-kit.png') });

  // Close Survey Kit
  if (await calcBtn.isVisible()) {
    await calcBtn.click();
    await page.waitForTimeout(400);
  }

  // 12. Proceed to Choose Stage
  console.log('Proceeding to Choose stage...');
  await page.evaluate(() => {
    const btn = document.getElementById('btn-go-choose');
    if (btn) btn.click();
  });
  await page.waitForTimeout(1200);
  console.log('Capturing 08-choose-lockin.png...');
  await page.screenshot({ path: path.join(outDir, '08-choose-lockin.png') });

  // 13. Lock Route and Go to Explore
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

  await page.waitForTimeout(2000); // Rover HUD rendered
  console.log('Capturing 09-explore-hud.png...');
  await page.screenshot({ path: path.join(outDir, '09-explore-hud.png') });

  // 14. Finish Explore -> Debrief
  console.log('Proceeding to Debrief stage...');
  await page.evaluate(() => {
    const btn = document.getElementById('btn-explore-finish') || document.getElementById('btn-go-debrief') || document.getElementById('btn-finish-drive');
    if (btn) btn.click();
  });
  await page.waitForSelector('#game-debrief-overlay:not(.hidden)', { timeout: 10000 });
  await page.waitForTimeout(1500);
  console.log('Capturing 10-debrief-score.png...');
  await page.screenshot({ path: path.join(outDir, '10-debrief-score.png') });

  await browser.close();
  console.log('All 10 screenshots captured successfully.');
}

capture().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
