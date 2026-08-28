const puppeteer = require('puppeteer-core');
const path = require('path');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PREVIEW = 'file:///' + path.resolve(__dirname, 'preview.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  // Captura erros JS
  page.on('console', msg => { if (msg.type() === 'error') console.error('JS ERR:', msg.text()); });
  page.on('pageerror', err => console.error('PAGE ERR:', err.message));

  await page.goto(PREVIEW, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 3000));

  // Abre o menu via puppeteer evaluate (evita race condition)
  const menuOk = await page.evaluate(() => {
    try {
      if (typeof openMenu !== 'function') return 'openMenu not found';
      openMenu({
        activeBank: 'A',
        ignMapA: null, injMapA: null,
        ignMapB: null, injMapB: null,
        twoStepRPM: 4500, twoStepActive: false,
        cutOffEnabled: true, delayCorteGiro: 300,
        shiftLightRPM: 7200, boostPSI: 18,
        boostRampRPM: 2800, boostActive: true,
        revLimit: 8000, tractionSlip: 25, tractionEnabled: false,
        closedLoopActive: false, closedLoopRate: 1,
        alertDetonacao: true, alertBaixaComb: false,
        alertBaixaOleo: true, alertInjetor: false,
        alertFaltaComb: false, alertExcessoComb: false,
      });
      return 'ok: ' + (document.getElementById('lcdContent')?.innerHTML?.length ?? 0) + ' chars';
    } catch(e) { return 'error: ' + e.message; }
  });
  console.log('menu evaluate:', menuOk);
  await new Promise(r => setTimeout(r, 500));

  // LEDs
  await page.evaluate(() => {
    const n = 9;
    for (let i = 0; i < 12; i++) {
      const led = document.getElementById('led' + i);
      const ml  = document.getElementById('ml' + i);
      if (!led) continue;
      let color, glow;
      if (i < n) {
        if (i < 5)      { color = '#00ee44'; glow = 'rgba(0,230,60,0.7)'; }
        else if (i < 8) { color = '#ffaa00'; glow = 'rgba(255,170,0,0.7)'; }
        else            { color = '#ff6600'; glow = 'rgba(255,102,0,0.8)'; }
        led.style.background = color;
        led.style.boxShadow  = `0 0 8px ${glow}`;
        if (ml) { ml.style.background = color; ml.style.boxShadow = `0 0 8px ${glow}`; }
      }
    }
    // Gauge RPM
    if (typeof targetRpmNorm !== 'undefined') targetRpmNorm = 0.73;
  });

  // ── 1. HUD ────────────────────────────────────────────────────────────────────
  await page.screenshot({ path: OUT + '/hud.png', clip: await (async () => {
    const hb = await (await page.$('#speedometer')).boundingBox();
    const wb = await (await page.$('#wbo2-nano')).boundingBox();
    const x = Math.min(hb.x, wb.x) - 20;
    const y = wb.y - 20;
    return { x, y, width: Math.max(hb.width, wb.width) + 40, height: hb.y + hb.height - wb.y + 40 };
  })() });
  console.log('✓ hud.png');

  // ── 2. ECU Menu Principal ─────────────────────────────────────────────────────
  const device = await page.$('.ft700-device');
  await device.screenshot({ path: OUT + '/ecu_menu.png' });
  console.log('✓ ecu_menu.png');

  // ── 3. Mapa Ignição — entra na tela ──────────────────────────────────────────
  await page.evaluate(() => {
    const items = document.querySelectorAll('.menu-item');
    for (const item of items) {
      if (item.textContent.includes('IGNIÇÃO') && !item.textContent.includes('INJEÇÃO')) {
        item.click(); break;
      }
    }
  });
  await new Promise(r => setTimeout(r, 150));
  await page.evaluate(() => { if (typeof navSelect === 'function') navSelect(); });
  await new Promise(r => setTimeout(r, 400));
  await device.screenshot({ path: OUT + '/ecu_map_ignition.png' });
  console.log('✓ ecu_map_ignition.png');

  // Volta e vai em INJEÇÃO
  await page.evaluate(() => { if (typeof navBack === 'function') navBack(); });
  await new Promise(r => setTimeout(r, 150));
  await page.evaluate(() => {
    const items = document.querySelectorAll('.menu-item');
    for (const item of items) {
      if (item.textContent.includes('INJEÇÃO')) { item.click(); break; }
    }
  });
  await new Promise(r => setTimeout(r, 150));
  await page.evaluate(() => { if (typeof navSelect === 'function') navSelect(); });
  await new Promise(r => setTimeout(r, 400));
  await device.screenshot({ path: OUT + '/ecu_map_injection.png' });
  console.log('✓ ecu_map_injection.png');

  // ── 4. MT Badge ──────────────────────────────────────────────────────────────
  await (await page.$('#mt-badge')).screenshot({ path: OUT + '/manual_badge.png' });
  console.log('✓ manual_badge.png');

  // ── 5. Drag Timer ─────────────────────────────────────────────────────────────
  await (await page.$('#drag-slip')).screenshot({ path: OUT + '/drag_timer.png' });
  console.log('✓ drag_timer.png');

  await browser.close();
  console.log('\nPronto! Screenshots em docs/');
})();
