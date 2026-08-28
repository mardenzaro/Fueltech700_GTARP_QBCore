// ── Constants ──────────────────────────────────────────────────────────────────
const RPM_LABELS  = ['500','1k','2k','3k','4k','5k','6k','7k','8k'];
const LOAD_LABELS = ['100%','80%','60%','40%','20%','0%'];

const DEFAULT_IGN = [
  [ 8, 12, 18, 24, 28, 30, 32, 32, 30],
  [10, 14, 20, 26, 30, 32, 34, 34, 32],
  [12, 16, 22, 28, 32, 34, 36, 36, 34],
  [14, 18, 24, 30, 34, 36, 38, 38, 36],
  [16, 20, 26, 32, 36, 38, 40, 40, 38],
  [18, 22, 28, 34, 38, 40, 42, 42, 40],
];
const DEFAULT_INJ = [
  [15, 18, 20, 22, 24, 25, 25, 23, 20],
  [ 8, 10, 12, 15, 18, 20, 20, 18, 15],
  [ 0,  2,  5,  8, 12, 15, 15, 12, 10],
  [-5, -3,  0,  3,  6,  8,  8,  6,  3],
  [-10,-8, -5, -2,  0,  2,  2,  0, -3],
  [-15,-12,-10, -8, -5, -2, -2, -5, -8],
];

function deepClone(m) { return m.map(r => [...r]); }

// ── Element refs ──────────────────────────────────────────────────────────────
const $rpmVal      = document.getElementById('rpmVal');
const $speed       = document.getElementById('speed');
const $gear        = document.getElementById('gear');
const $tMotor      = document.getElementById('tMotor');
const $pOleo       = document.getElementById('pOleo');
const $sGeral      = document.getElementById('sGeral');
const $pComb       = document.getElementById('pComb');
const $tAr         = document.getElementById('tAr');
const $motorHealth = document.getElementById('motorHealth');
const $odoTotal    = document.getElementById('odoTotal');
const $odoTrip     = document.getElementById('odoTrip');
const $tanqueFill  = document.getElementById('tanqueFill');
const $dataThrottle= document.getElementById('dataThrottle');
const $alertBar    = document.getElementById('alertBar');
const $lcdContent  = document.getElementById('lcdContent');
const $bankBadge   = document.getElementById('bankBadge');

// ── Canvas RPM Gauge ──────────────────────────────────────────────────────────
const canvas  = document.getElementById('rpmCanvas');
const ctx     = canvas.getContext('2d');
const CX      = canvas.width  / 2;
const CY      = canvas.height / 2;
const R_OUTER = 74;
const R_TRACK = 66;
const START_A = Math.PI * 0.75;
const END_A   = Math.PI * 2.25;
const SWEEP   = END_A - START_A;

let targetRpmNorm  = 0;
let currentRpmNorm = 0;

function drawGauge(norm) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  ctx.arc(CX, CY, R_OUTER, 0, Math.PI * 2);
  ctx.strokeStyle = '#1e2030'; ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath();
  ctx.arc(CX, CY, R_TRACK, START_A, END_A);
  ctx.strokeStyle = '#111118'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke();
  if (norm > 0) {
    const endAngle = START_A + SWEEP * norm;
    const grad = ctx.createLinearGradient(CX - R_TRACK, CY, CX + R_TRACK, CY);
    grad.addColorStop(0,    '#ffee00');
    grad.addColorStop(0.5,  '#ff9900');
    grad.addColorStop(0.75, '#ff4400');
    grad.addColorStop(1,    '#ff1100');
    ctx.beginPath();
    ctx.arc(CX, CY, R_TRACK, START_A, endAngle);
    ctx.strokeStyle = grad; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke();
  }
  for (let i = 0; i <= 8; i++) {
    const a = START_A + (SWEEP * i) / 8;
    ctx.beginPath();
    ctx.moveTo(CX + (R_OUTER-2) * Math.cos(a), CY + (R_OUTER-2) * Math.sin(a));
    ctx.lineTo(CX + (R_OUTER-10) * Math.cos(a), CY + (R_OUTER-10) * Math.sin(a));
    ctx.strokeStyle = '#383848'; ctx.lineWidth = 1.5; ctx.lineCap = 'butt'; ctx.stroke();
  }
  const na = START_A + SWEEP * norm;
  const nLen = R_TRACK - 8;
  ctx.beginPath();
  ctx.moveTo(CX, CY);
  ctx.lineTo(CX + nLen * Math.cos(na), CY + nLen * Math.sin(na));
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath();
  ctx.arc(CX, CY, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#ff6600'; ctx.fill();
}

function animateGauge() {
  currentRpmNorm += (targetRpmNorm - currentRpmNorm) * 0.18;
  drawGauge(currentRpmNorm);
  requestAnimationFrame(animateGauge);
}
animateGauge();

// ── LEDs ──────────────────────────────────────────────────────────────────────
const hudLeds   = Array.from({length:12}, (_,i) => document.getElementById('led'+i));
const menuLeds  = Array.from({length:12}, (_,i) => document.getElementById('ml'+i));
const sideLedsL = Array.from({length:4},  (_,i) => document.getElementById('sl'+i));
const sideLedsR = Array.from({length:4},  (_,i) => document.getElementById('sr'+i));

function updateLeds(rpmNorm, shiftLight, isTwoStep) {
  const n = Math.floor(rpmNorm * 12);
  hudLeds.forEach((led, i) => {
    if (i < n) {
      let color, glow;
      if (i < 5)      { color = '#00ee44'; glow = 'rgba(0,230,60,0.7)'; }
      else if (i < 8) { color = '#ffaa00'; glow = 'rgba(255,170,0,0.7)'; }
      else if (i < 10){ color = '#ff6600'; glow = 'rgba(255,102,0,0.8)'; }
      else            { color = '#ff1100'; glow = 'rgba(255,20,0,0.9)'; }
      if (shiftLight) { color = '#ffffff'; glow = 'rgba(255,255,255,0.95)'; }
      if (isTwoStep)  { color = '#ff00aa'; glow = 'rgba(255,0,150,0.9)'; }
      led.style.background = color;
      led.style.boxShadow  = `0 0 8px ${glow}`;
    } else {
      led.style.background = '#111318';
      led.style.boxShadow  = 'none';
    }
  });
  menuLeds.forEach((led, i) => {
    led.style.background = hudLeds[i].style.background;
    led.style.boxShadow  = hudLeds[i].style.boxShadow;
  });
}

function updateSideLeds(alerts) {
  const active = (alerts ?? []).length > 0;
  const glow   = active ? '0 0 8px rgba(255,102,0,0.8)' : 'none';
  [...sideLedsL, ...sideLedsR].forEach((led, i) => {
    if (led) {
      led.style.background = active ? (i % 2 === 0 ? '#ff6600' : '#cc4400') : '#111318';
      led.style.boxShadow  = active ? glow : 'none';
    }
  });
}

// ── Turbo Audio (HTML Audio element — compatível com NUI) ─────────────────────
const _spoolAudio = new Audio('turbo_spool.ogg');
_spoolAudio.loop   = true;
_spoolAudio.volume = 0;

const _bovAudio  = new Audio('turbo_bov.ogg');
_bovAudio.volume = 0.35;

let _spoolTarget   = 0;
let _spoolPlaying  = false;
let _bovBlocking   = false;
let _bovBlockTimer = null;

// Loop único contínuo — nunca é interrompido, só o target muda
setInterval(() => {
  const diff = _spoolTarget - _spoolAudio.volume;
  if (Math.abs(diff) > 0.004) {
    _spoolAudio.volume = Math.max(0, Math.min(1, _spoolAudio.volume + diff * 0.14));
  } else {
    _spoolAudio.volume = _spoolTarget;
  }
  if (_spoolAudio.volume > 0.01 && !_spoolPlaying) {
    _spoolAudio.play().catch(() => {});
    _spoolPlaying = true;
  } else if (_spoolAudio.volume <= 0.005 && _spoolPlaying) {
    _spoolAudio.pause();
    _spoolAudio.volume = 0;
    _spoolPlaying = false;
  }
}, 30);

function updateTurboAudio(boostOn, spoolPct, boostPSI) {
  if (_bovBlocking || !boostOn || boostPSI < 5 || spoolPct < 0.15) {
    _spoolTarget = 0;
    return;
  }
  const boostBar    = boostPSI / 14.504;
  _spoolTarget      = Math.min(0.22, spoolPct * 0.26 * (0.4 + boostBar * 0.6));
  _spoolAudio.playbackRate = Math.max(0.6, Math.min(1.8, 0.65 + spoolPct * 1.1));
}

function turboBOV() {
  _spoolTarget = 0;
  _bovBlocking = true;
  clearTimeout(_bovBlockTimer);
  _bovAudio.currentTime = 0;
  _bovAudio.play().catch(() => {});
  _bovBlockTimer = setTimeout(() => { _bovBlocking = false; }, 1300);
}

// ── WBO2 Nano ─────────────────────────────────────────────────────────────────
const $wbo2     = document.getElementById('wbo2-nano');
const $wbo2Val  = document.getElementById('wbo2Val');

function updateWBO2Visibility(visible) {
  if (!$wbo2) return;
  if (visible) {
    $wbo2.style.display = 'block';
    // Posiciona acima do speedometer dinamicamente
    const spd = document.getElementById('speedometer');
    if (spd) {
      const h = spd.offsetHeight || 0;
      $wbo2.style.bottom = (18 + h + 8) + 'px';
    }
  } else {
    $wbo2.style.display = 'none';
  }
}

function updateWBO2(lambda) {
  if (!$wbo2Val) return;
  const afr = (lambda * 14.7).toFixed(2);
  $wbo2Val.textContent = afr;
  // Rica < 13.5 | Estequio 13.5–15.2 | Pobre > 15.2
  if (lambda < 0.92) {
    $wbo2Val.className = 'wbo2-val rich';
  } else if (lambda <= 1.035) {
    $wbo2Val.className = 'wbo2-val stoic';
  } else {
    $wbo2Val.className = 'wbo2-val lean';
  }
}

// ── HUD update ────────────────────────────────────────────────────────────────
function updateHUD(d) {
  const rpmNorm = d.rpmNorm ?? 0;
  targetRpmNorm = rpmNorm;
  $rpmVal.textContent       = d.rpm  ?? 0;
  $speed.textContent        = d.speed ?? 0;
  $gear.textContent         = d.gear ?? 'N';
  $tMotor.textContent       = d.oilTemp      ?? '20.0';
  $pOleo.textContent        = d.oilPressure  ?? '0.00';
  $sGeral.textContent       = d.lambda       ?? '1.00';
  $pComb.textContent        = d.fuelPressure ?? '0.00';
  $tAr.textContent          = d.airTemp      ?? '25.0';
  $motorHealth.textContent  = Math.floor((d.engineHealth ?? 1) * 100) + '%';
  $dataThrottle.textContent = (d.throttlePct ?? 0) + '%';

  const odo = d.odometer ?? 0;
  const odoInt = Math.floor(odo);
  $odoTotal.textContent = String(odoInt).padStart(5,'0') + '.' + Math.floor((odo - odoInt)*10);
  $odoTrip.textContent  = (d.tripOdo ?? 0).toFixed(1);

  const fuelPct = d.fuel ?? 0;
  $tanqueFill.style.width = fuelPct + '%';
  $tanqueFill.style.background = fuelPct < 15
    ? 'linear-gradient(to right,#cc1100,#ff3300)'
    : fuelPct < 30
      ? 'linear-gradient(to right,#cc7700,#ffaa00)'
      : 'linear-gradient(to right,#00bb44,#00ee66)';

  const alerts = d.alerts ?? [];
  if (alerts.length) {
    $alertBar.textContent  = '⚠  ' + alerts.join('  |  ') + '  ⚠';
    $alertBar.style.maxHeight = '18px';
  } else {
    $alertBar.textContent  = '';
    $alertBar.style.maxHeight = '0';
  }

  // Bank badge
  if ($bankBadge && d.activeBank) {
    $bankBadge.textContent = d.activeBank;
    $bankBadge.className   = 'ft-bank bank-' + d.activeBank;
  }

  // WBO2 Nano — AFR display (lambda × 14.7)
  updateWBO2(parseFloat(d.lambda ?? '1.00'));

  updateTurboAudio(d.boostOn, d.spoolPct ?? 0, d.boostPSI ?? 0);

  updateLeds(rpmNorm, d.shiftLight, d.isTwoStep);
  updateSideLeds(d.alerts);

  if (d.activeRow !== undefined) {
    menu.activeZone = { row: d.activeRow, col: d.activeCol };
    if (menu.open && !_dragState) {
      const _s = menu.stack[menu.stack.length - 1];
      if (_s && _s.type === 'map') render();
    }
  }
}

// ── Drag Slip display ─────────────────────────────────────────────────────────
let _slipTimer = null;

function showDragSlip(data) {
  const el = document.getElementById('drag-slip');
  if (!el) return;
  document.getElementById('slip60').textContent   = (data.t60  ?? '---') + (data.t60  ? 's' : '');
  document.getElementById('slip100').textContent  = (data.t100 ?? '---') + (data.t100 ? 's' : '');
  document.getElementById('slip402').textContent  = (data.t402 ?? '---') + (data.t402 ? 's' : '');
  document.getElementById('slipSpd').textContent  = (data.trapSpd ?? '---') + (data.trapSpd ? ' km/h' : '');
  el.style.display = 'flex';
  clearTimeout(_slipTimer);
  _slipTimer = setTimeout(() => { el.style.display = 'none'; }, 12000);
}

function hideDragSlip() {
  clearTimeout(_slipTimer);
  const el = document.getElementById('drag-slip');
  if (el) el.style.display = 'none';
}

// ── Menu state ────────────────────────────────────────────────────────────────
const menu = {
  open:        false,
  stack:       [],
  // Banks
  bankActive:  'A',
  ignMapA:     null,
  injMapA:     null,
  ignMapB:     null,
  injMapB:     null,
  ignMap:      null,   // espelho do banco ativo (editado no menu)
  injMap:      null,
  // Tunable fields
  twoStepRPM:      4000,
  twoStepActive:   false,
  cutOffEnabled:   false,
  delayCorteGiro:  500,
  shiftLightRPM:   7500,
  boostPSI:        14,
  boostRampRPM:    2500,
  boostActive:     false,
  revLimit:        8000,
  tractionSlip:    25,
  tractionEnabled: false,
  closedLoopActive:false,
  closedLoopRate:  1,
  alertDetonacao:  false,
  alertBaixaComb:  false,
  alertBaixaOleo:  false,
  alertInjetor:    false,
  alertFaltaComb:  false,
  alertExcessoComb:false,
  // Map cursor / active zone
  mapCursor:  { row: 0, col: 0 },
  activeZone: { row: 0, col: 0 },
};

// ── Bank helpers ──────────────────────────────────────────────────────────────
function _saveCurrentBankMaps() {
  if (menu.bankActive === 'A') {
    menu.ignMapA = menu.ignMap;
    menu.injMapA = menu.injMap;
  } else {
    menu.ignMapB = menu.ignMap;
    menu.injMapB = menu.injMap;
  }
}

function switchBank(newBank) {
  _saveCurrentBankMaps();
  menu.bankActive = newBank;
  menu.ignMap = deepClone(newBank === 'A' ? menu.ignMapA : menu.ignMapB);
  menu.injMap = deepClone(newBank === 'A' ? menu.injMapA : menu.injMapB);
  sendToLua();
  render();
}

// ── Menu tree definition ──────────────────────────────────────────────────────
function getMainMenu() {
  return [
    { label: 'BANCO MAPA',        id: 'bank',    type: 'bank' },
    { label: 'IGNIÇÃO',           id: 'ign',     type: 'map',     mapKey: 'ignMap' },
    { label: 'INJEÇÃO',           id: 'inj',     type: 'map',     mapKey: 'injMap' },
    { label: 'LAUNCH CONTROL',    id: 'launch',  type: 'submenu', items: getLaunchMenu() },
    { label: 'BOOST CONTROLLER',  id: 'boost',   type: 'submenu', items: getBoostMenu() },
    { label: 'CONTROLE TRAÇÃO',   id: 'traction',type: 'submenu', items: getTractionMenu() },
    { label: 'O2 CLOSED LOOP',    id: 'cl',      type: 'submenu', items: getClosedLoopMenu() },
    { label: 'SHIFT LIGHT',       id: 'shift',   type: 'submenu', items: getShiftMenu() },
    { label: 'ALERTAS',           id: 'alerts',  type: 'submenu', items: getAlertsMenu() },
  ];
}

function getLaunchMenu() {
  return [
    { label: 'RPM DE CORTE 2-STEP',  field: 'twoStepRPM',    type: 'number', min:1000, max:8000, step:100, unit:'RPM' },
    { label: '2-STEP ATIVO',         field: 'twoStepActive',  type: 'toggle' },
    { label: 'CUT-OFF DESACELERAÇÃO',field: 'cutOffEnabled',  type: 'toggle' },
    { label: 'DELAY CUT-OFF',        field: 'delayCorteGiro', type: 'number', min:100, max:2000, step:100, unit:'ms' },
  ];
}

function getBoostMenu() {
  return [
    { label: 'LIMITE RPM',       field: 'revLimit',    type: 'number', min:4000, max:9500, step:250, unit:'RPM' },
    { label: 'BOOST ALVO',       field: 'boostPSI',    type: 'number', min:0, max:35, step:1,   unit:'PSI' },
    { label: 'RPM INÍCIO BOOST', field: 'boostRampRPM',type: 'number', min:500, max:6000, step:100, unit:'RPM' },
    { label: 'BOOST ATIVO',      field: 'boostActive', type: 'toggle' },
  ];
}

function getTractionMenu() {
  return [
    { label: 'SLIP PERMITIDO', field: 'tractionSlip',    type: 'number', min:5, max:60, step:5, unit:'%' },
    { label: 'CONTROLE ATIVO', field: 'tractionEnabled', type: 'toggle' },
  ];
}

function getClosedLoopMenu() {
  return [
    { label: 'O2 LOOP ATIVO',     field: 'closedLoopActive', type: 'toggle' },
    { label: 'TAXA CORREÇÃO',     field: 'closedLoopRate',   type: 'number', min:1, max:5, step:1, unit:'u/500ms' },
  ];
}

function getShiftMenu() {
  return [
    { label: 'RPM SHIFT LIGHT', field: 'shiftLightRPM', type: 'number', min:3000, max:8000, step:100, unit:'RPM' },
  ];
}

function getAlertsMenu() {
  return [
    { label: 'PRÉ DETONAÇÃO',   field: 'alertDetonacao',  type: 'toggle' },
    { label: 'BAIXA P. ÓLEO',   field: 'alertBaixaOleo',  type: 'toggle' },
    { label: 'BAIXA P. COMB',   field: 'alertBaixaComb',  type: 'toggle' },
    { label: 'FALTA COMBUST.',  field: 'alertFaltaComb',  type: 'toggle' },
    { label: 'EXCESSO COMB.',   field: 'alertExcessoComb',type: 'toggle' },
    { label: 'INJETOR ABERTO',  field: 'alertInjetor',    type: 'toggle' },
  ];
}

// ── Open / Close ──────────────────────────────────────────────────────────────
function openMenu(data) {
  menu.open = true;

  // Banks
  menu.bankActive = data.activeBank || 'A';
  menu.ignMapA    = deepClone(data.ignMapA || DEFAULT_IGN);
  menu.injMapA    = deepClone(data.injMapA || DEFAULT_INJ);
  menu.ignMapB    = deepClone(data.ignMapB || DEFAULT_IGN);
  menu.injMapB    = deepClone(data.injMapB || DEFAULT_INJ);
  menu.ignMap     = deepClone(menu.bankActive === 'A' ? menu.ignMapA : menu.ignMapB);
  menu.injMap     = deepClone(menu.bankActive === 'A' ? menu.injMapA : menu.injMapB);

  // Control fields
  menu.twoStepRPM      = data.twoStepRPM      ?? 4000;
  menu.twoStepActive   = data.twoStepActive   ?? false;
  menu.cutOffEnabled   = data.cutOffEnabled   ?? false;
  menu.delayCorteGiro  = data.delayCorteGiro  ?? 500;
  menu.shiftLightRPM   = data.shiftLightRPM   ?? 7500;
  menu.boostPSI        = data.boostPSI        ?? 14;
  menu.boostRampRPM    = data.boostRampRPM    ?? 2500;
  menu.boostActive     = data.boostActive     ?? false;
  menu.revLimit        = data.revLimit        ?? 8000;
  menu.tractionSlip    = data.tractionSlip    ?? 25;
  menu.tractionEnabled = data.tractionEnabled ?? false;
  menu.closedLoopActive= data.closedLoopActive?? false;
  menu.closedLoopRate  = data.closedLoopRate  ?? 1;
  menu.alertDetonacao  = data.alertDetonacao  ?? false;
  menu.alertBaixaComb  = data.alertBaixaComb  ?? false;
  menu.alertBaixaOleo  = data.alertBaixaOleo  ?? false;
  menu.alertInjetor    = data.alertInjetor    ?? false;
  menu.alertFaltaComb  = data.alertFaltaComb  ?? false;
  menu.alertExcessoComb= data.alertExcessoComb?? false;
  menu.mapCursor = { row: 0, col: 0 };

  menu.stack = [{
    type: 'list',
    title: 'MENU PRINCIPAL',
    items: getMainMenu(),
    cursor: 0,
  }];

  document.getElementById('ecu-menu').classList.add('open');
  render();
}

function closeMenu() {
  menu.open = false;
  document.getElementById('ecu-menu').classList.remove('open');
  sendToLua();
  fetch('https://fueltech_speedometer/closeMenu', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({}),
  });
}

// ── Send to Lua ───────────────────────────────────────────────────────────────
function sendToLua() {
  _saveCurrentBankMaps();
  fetch('https://fueltech_speedometer/ecuValues', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      activeBank:      menu.bankActive,
      ignMapA:         menu.ignMapA,
      injMapA:         menu.injMapA,
      ignMapB:         menu.ignMapB,
      injMapB:         menu.injMapB,
      ignOffset:       0,
      injOffset:       0,
      twoStepRPM:      menu.twoStepRPM,
      twoStepActive:   menu.twoStepActive,
      cutOffEnabled:   menu.cutOffEnabled,
      delayCorteGiro:  menu.delayCorteGiro,
      shiftLightRPM:   menu.shiftLightRPM,
      boostPSI:        menu.boostPSI,
      boostRampRPM:    menu.boostRampRPM,
      boostActive:     menu.boostActive,
      revLimit:        menu.revLimit,
      tractionSlip:    menu.tractionSlip,
      tractionEnabled: menu.tractionEnabled,
      closedLoopActive:menu.closedLoopActive,
      closedLoopRate:  menu.closedLoopRate,
      alertDetonacao:  menu.alertDetonacao,
      alertBaixaComb:  menu.alertBaixaComb,
      alertBaixaOleo:  menu.alertBaixaOleo,
      alertInjetor:    menu.alertInjetor,
      alertFaltaComb:  menu.alertFaltaComb,
      alertExcessoComb:menu.alertExcessoComb,
    }),
  });
}

// ── Render dispatch ───────────────────────────────────────────────────────────
function render() {
  const screen = menu.stack[menu.stack.length - 1];
  if (!screen) return;

  const breadcrumb = menu.stack.slice(0,-1).map(s => s.title).join(' › ');
  let html = `<div class="lcd-topbar">
    <span class="lcd-title">${screen.title}</span>
    <span class="lcd-breadcrumb">${breadcrumb}</span>
  </div>`;

  if (screen.type === 'list')   html += renderListScreen(screen);
  else if (screen.type === 'map')    html += renderMapScreen(screen);
  else if (screen.type === 'number') html += renderNumberScreen(screen);
  else if (screen.type === 'toggle') html += renderToggleScreen(screen);

  html += `<div class="lcd-hints">
    <span>↑↓ Navegar</span>
    <span>+/− ou ◄► Ajustar</span>
    <span>↵/→ Selecionar</span>
    <span>ESC/← Voltar</span>
  </div>`;

  $lcdContent.innerHTML = html;
  applyActiveZone();
}

// ── Hold-to-repeat ────────────────────────────────────────────────────────────
let _repeatTimer = null;
function _startRepeat(fn) {
  fn();
  _repeatTimer = setTimeout(function tick() {
    fn();
    _repeatTimer = setTimeout(tick, 80);
  }, 380);
}
function _stopRepeat() { clearTimeout(_repeatTimer); _repeatTimer = null; }

// ── Mouse interaction helpers ─────────────────────────────────────────────────
function listItemClick(i) {
  const screen = menu.stack[menu.stack.length - 1];
  if (!screen || screen.type !== 'list') return;
  if (screen.cursor === i) { navSelect(); return; }
  screen.cursor = i;
  render();
}

function listArrowClick(i, delta, ev) {
  if (ev) ev.stopPropagation();
  const screen = menu.stack[menu.stack.length - 1];
  if (!screen || screen.type !== 'list') return;
  screen.cursor = i;
  const item = screen.items[i];
  if (!item) return;
  if (item.type === 'number') {
    menu[item.field] = Math.max(item.min, Math.min(item.max, (menu[item.field] || 0) + delta * item.step));
    sendToLua(); render();
  } else if (item.type === 'toggle') {
    menu[item.field] = !menu[item.field];
    sendToLua(); render();
  } else if (item.type === 'bank') {
    switchBank(menu.bankActive === 'A' ? 'B' : 'A');
  } else if (delta > 0) { navSelect(); }
}

function mapCellClick(r, c) {
  menu.mapCursor = { row: r, col: c };
  render();
}

// ── List screen ───────────────────────────────────────────────────────────────
function renderListScreen(screen) {
  let html = '<div class="menu-list">';
  screen.items.forEach((item, i) => {
    const isSel = i === screen.cursor;
    const sel   = isSel ? ' selected' : '';
    let right = '';

    if (item.type === 'bank') {
      right = `<span class="mi-arrow mi-clickable" onclick="listArrowClick(${i},-1,event)">◄</span>`
            + `<span class="mi-val" style="color:#ff6600;font-size:13px;font-weight:bold;letter-spacing:2px">BANCO ${menu.bankActive}</span>`
            + `<span class="mi-arrow mi-clickable" onclick="listArrowClick(${i},1,event)">►</span>`;
    } else if (item.type === 'toggle') {
      const on = menu[item.field];
      right = `<span class="mi-arrow mi-clickable" onclick="listArrowClick(${i},-1,event)">◄</span>`
            + `<span class="mi-val" style="color:${on?'#00e676':'#606080'}">${on?'ON':'OFF'}</span>`
            + `<span class="mi-arrow mi-clickable" onclick="listArrowClick(${i},1,event)">►</span>`;
    } else if (item.type === 'number') {
      right = isSel
        ? `<span class="mi-arrow mi-clickable" onclick="listArrowClick(${i},-1,event)">◄</span>`
        + `<span class="mi-val">${menu[item.field]}</span>`
        + `<span class="mi-arrow mi-clickable" onclick="listArrowClick(${i},1,event)">►</span>`
        : `<span class="mi-val">${menu[item.field]}</span><span class="mi-arrow">►</span>`;
    } else {
      right = `<span class="mi-arrow">►</span>`;
    }

    html += `<div class="menu-item${sel}" onclick="listItemClick(${i})">
      <span>${item.label}</span>
      <div style="display:flex;align-items:center;gap:6px">${right}</div>
    </div>`;
  });
  html += '</div>';
  return html;
}

// ── Map screen — SVG Graph ────────────────────────────────────────────────────
const LINE_COLORS = ['#ff4040','#ff8c00','#ffd700','#00cc44','#00aaff','#aa44ff'];

function renderMapScreen(screen) {
  const isIgn   = screen.mapKey === 'ignMap';
  const mapData = menu[screen.mapKey];
  const cur     = menu.mapCursor;
  const az      = menu.activeZone;
  const curVal  = mapData[cur.row][cur.col];
  const unitStr = isIgn ? '°' : '%';

  // SVG coordinate space
  const VW = 352, VH = 198;
  const ML = 34, MR = 8, MT = 12, MB = 22;
  const GW = VW - ML - MR, GH = VH - MT - MB;
  const minY = isIgn ?  0 : -30;
  const maxY = isIgn ? 50 :  30;

  const xPos = c => ML + (c / 8) * GW;
  const yPos = v => MT + GH - ((v - minY) / (maxY - minY)) * GH;

  const azCol = (az.col ?? 1) - 1;
  const azRow = (az.row ?? 1) - 1;

  let svg = `<svg id="mapSvg" viewBox="0 0 ${VW} ${VH}" width="100%" height="${VH}"
    style="display:block;overflow:visible;cursor:crosshair;user-select:none"
    onwheel="mapWheelAdjust(event)">`;

  // Background
  svg += `<rect x="${ML}" y="${MT}" width="${GW}" height="${GH}" fill="#05060d" rx="3"/>`;

  // Horizontal grid + Y labels
  const yStep = isIgn ? 10 : 10;
  for (let v = minY; v <= maxY; v += yStep) {
    const y = yPos(v);
    svg += `<line x1="${ML}" y1="${y}" x2="${ML+GW}" y2="${y}"
      stroke="${v === 0 ? '#2a3060' : '#0e1020'}" stroke-width="${v === 0 ? 1.5 : 1}"/>`;
    svg += `<text x="${ML-4}" y="${y+3}" text-anchor="end" fill="#2d3550"
      font-size="8" font-family="Orbitron,monospace">${v}</text>`;
  }

  // Vertical grid + X labels
  for (let c = 0; c < 9; c++) {
    const x = xPos(c);
    svg += `<line x1="${x}" y1="${MT}" x2="${x}" y2="${MT+GH}" stroke="#0e1020" stroke-width="1"/>`;
    svg += `<text x="${x}" y="${MT+GH+13}" text-anchor="middle" fill="#2d3550"
      font-size="8" font-family="Orbitron,monospace">${RPM_LABELS[c]}</text>`;
  }

  // Active zone column marker
  if (azCol >= 0 && azCol <= 8) {
    const x = xPos(azCol);
    svg += `<rect x="${x-6}" y="${MT}" width="12" height="${GH}" fill="rgba(255,102,0,0.07)" rx="2"/>`;
    svg += `<line x1="${x}" y1="${MT}" x2="${x}" y2="${MT+GH}"
      stroke="rgba(255,102,0,0.55)" stroke-width="1.5" stroke-dasharray="4,3"/>`;
  }

  // Lines + dots per load row
  for (let r = 0; r < 6; r++) {
    const color    = LINE_COLORS[r];
    const isSelRow = r === cur.row;
    const isAzRow  = r === azRow;
    const op       = isSelRow ? 1 : isAzRow ? 0.85 : 0.38;
    const sw       = isSelRow ? 2.5 : isAzRow ? 2 : 1.2;

    let pts = '';
    for (let c = 0; c < 9; c++) pts += `${xPos(c).toFixed(1)},${yPos(mapData[r][c]).toFixed(1)} `;
    svg += `<polyline points="${pts.trim()}" fill="none" stroke="${color}"
      stroke-width="${sw}" stroke-opacity="${op}"
      stroke-linejoin="round" stroke-linecap="round"/>`;

    for (let c = 0; c < 9; c++) {
      const x      = xPos(c).toFixed(1);
      const y      = yPos(mapData[r][c]).toFixed(1);
      const isSel  = isSelRow && c === cur.col;
      const isAzPt = isAzRow  && c === azCol;
      const radius = isSel ? 6 : isAzPt ? 5 : isSelRow ? 4 : 3;

      svg += `<circle cx="${x}" cy="${y}" r="${radius}"
        fill="${isSel ? '#ffffff' : isAzPt ? '#ff6600' : color}"
        fill-opacity="${isSel ? 1 : op}"
        stroke="${isSel ? '#ff6600' : isAzPt ? '#ffaa00' : 'none'}"
        stroke-width="${isSel || isAzPt ? 2 : 0}"
        style="cursor:pointer"
        onclick="mapCellClick(${r},${c})"
        onmousedown="mapDotDragStart(event,${r},${c})"/>`;

      // Value label on selected dot
      if (isSel) {
        svg += `<text x="${x}" y="${parseFloat(y)-10}" text-anchor="middle" fill="#ffffff"
          font-size="9" font-family="Orbitron,monospace" font-weight="700">${curVal}${unitStr}</text>`;
      }
    }
  }

  svg += '</svg>';

  const legendHtml = LINE_COLORS.map((c, i) =>
    `<span class="mg-dot" style="background:${c};opacity:${i===cur.row?1:0.45}"></span>`+
    `<span class="mg-lbl" style="color:${c};opacity:${i===cur.row?1:0.5}">${LOAD_LABELS[i]}</span>`
  ).join('');

  return `<div class="map-screen">
    <div class="map-graph-hdr">
      <div class="map-legend">${legendHtml}</div>
      <span class="map-bank-badge">BANCO ${menu.bankActive}</span>
    </div>
    <div class="map-graph-wrap" id="mapGraphWrap">${svg}</div>
    <div class="map-adj-bar">
      <button class="map-adj-btn"
        onmousedown="_startRepeat(function(){mapAdjust(-1)})"
        onmouseup="_stopRepeat()" onmouseleave="_stopRepeat()">−</button>
      <span class="map-adj-info">
        <span style="color:${LINE_COLORS[cur.row]}">${LOAD_LABELS[cur.row]}</span>
        &nbsp;${RPM_LABELS[cur.col]} &nbsp;=&nbsp; <strong>${curVal}${unitStr}</strong>
      </span>
      <button class="map-adj-btn"
        onmousedown="_startRepeat(function(){mapAdjust(1)})"
        onmouseup="_stopRepeat()" onmouseleave="_stopRepeat()">+</button>
    </div>
  </div>`;
}

// ── Number screen ─────────────────────────────────────────────────────────────
function renderNumberScreen(screen) {
  const v = menu[screen.field];
  return `<div class="val-screen">
    <div class="val-label">${screen.title}</div>
    <div class="val-display">
      <button class="val-btn"
        onmousedown="_startRepeat(function(){numberAdjust(-1)})"
        onmouseup="_stopRepeat()" onmouseleave="_stopRepeat()">◄</button>
      <span class="val-number">${v}</span>
      <button class="val-btn"
        onmousedown="_startRepeat(function(){numberAdjust(1)})"
        onmouseup="_stopRepeat()" onmouseleave="_stopRepeat()">+►</button>
    </div>
    <div class="val-unit">${screen.unit ?? ''}</div>
    <div class="val-range">min ${screen.min} &nbsp;|&nbsp; max ${screen.max} &nbsp;|&nbsp; passo ${screen.step}</div>
    <button class="val-confirm" onclick="navBack()">✓ CONFIRMAR</button>
  </div>`;
}

// ── Toggle screen ─────────────────────────────────────────────────────────────
function renderToggleScreen(screen) {
  const on = menu[screen.field];
  return `<div class="toggle-screen">
    <div class="toggle-label">${screen.title}</div>
    <div class="toggle-btn ${on?'on':'off'}" onclick="toggleFlip()">${on?'ON':'OFF'}</div>
    <div class="toggle-hint">Clique no botão para alternar</div>
    <button class="val-confirm" onclick="navBack()">✓ CONFIRMAR</button>
  </div>`;
}

// ── Map wheel adjust ──────────────────────────────────────────────────────────
function mapWheelAdjust(e) {
  e.preventDefault();
  mapAdjust(e.deltaY < 0 ? 1 : -1);
}

// ── Map dot drag ──────────────────────────────────────────────────────────────
let _dragState    = null;
let _luaSendTimer = null;

function mapDotDragStart(e, r, c) {
  e.preventDefault();
  mapCellClick(r, c);
  const screen = menu.stack[menu.stack.length - 1];
  if (!screen || screen.type !== 'map') return;

  _dragState = {
    r, c,
    startY:   e.clientY,
    startVal: menu[screen.mapKey][r][c],
    mapKey:   screen.mapKey,
    isIgn:    screen.mapKey === 'ignMap',
  };

  function onMove(me) {
    if (!_dragState) return;
    const svgEl = document.getElementById('mapSvg');
    if (!svgEl) return;
    const rect     = svgEl.getBoundingClientRect();
    const GH_vb    = 198 - 12 - 22;                         // viewBox GH
    const scaleY   = GH_vb / rect.height;
    const range    = _dragState.isIgn ? 50 : 60;
    const dy       = (_dragState.startY - me.clientY) * scaleY;
    const rawVal   = _dragState.startVal + dy * (range / GH_vb);
    const newVal   = _dragState.isIgn
      ? Math.max(0,   Math.min(50,  Math.round(rawVal)))
      : Math.max(-30, Math.min(30,  Math.round(rawVal)));
    menu[_dragState.mapKey][_dragState.r][_dragState.c] = newVal;
    render();
    // Throttle Lua sends during drag — max 1 per 80ms
    clearTimeout(_luaSendTimer);
    _luaSendTimer = setTimeout(sendToLua, 80);
  }

  function onUp() {
    if (_dragState) { clearTimeout(_luaSendTimer); sendToLua(); }
    _dragState = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ── Active zone highlight ─────────────────────────────────────────────────────
function applyActiveZone() {
  // Active zone is baked into the SVG graph on each render() — no DOM update needed
}

// ── Heat-map colors ───────────────────────────────────────────────────────────
function ignColor(v) {
  if (v <  8)  return '#0a1040';
  if (v < 16)  return '#0a2860';
  if (v < 24)  return '#0a4030';
  if (v < 30)  return '#0a4818';
  if (v < 36)  return '#204800';
  if (v < 40)  return '#484800';
  if (v < 44)  return '#583800';
  if (v < 48)  return '#582000';
  return '#500808';
}
function injColor(v) {
  if (v < -20) return '#0a1040';
  if (v < -12) return '#0a2860';
  if (v <  -5) return '#0a3848';
  if (v <   3) return '#0a4020';
  if (v <  10) return '#284800';
  if (v <  18) return '#484800';
  if (v <  24) return '#583000';
  return '#500808';
}

// ── Navigation ────────────────────────────────────────────────────────────────
function navBack() {
  if (menu.stack.length > 1) { menu.stack.pop(); render(); }
  else { closeMenu(); }
}

function navSelect() {
  const screen = menu.stack[menu.stack.length - 1];
  if (!screen) return;

  if (screen.type === 'list') {
    const item = screen.items[screen.cursor];
    if (!item) return;

    if (item.type === 'bank') {
      switchBank(menu.bankActive === 'A' ? 'B' : 'A');
      return;
    } else if (item.type === 'map') {
      menu.stack.push({ type: 'map', title: item.label, mapKey: item.mapKey });
      menu.mapCursor = { row: 0, col: 0 };
    } else if (item.type === 'submenu') {
      menu.stack.push({ type: 'list', title: item.label, items: item.items, cursor: 0 });
    } else if (item.type === 'number') {
      menu.stack.push({ type: 'number', title: item.label, field: item.field,
        min: item.min, max: item.max, step: item.step, unit: item.unit });
    } else if (item.type === 'toggle') {
      menu[item.field] = !menu[item.field];
      sendToLua();
    }
    render();
  }
}

function navMoveCursor(delta) {
  const screen = menu.stack[menu.stack.length - 1];
  if (!screen) return;
  if (screen.type === 'list') {
    screen.cursor = Math.max(0, Math.min(screen.items.length - 1, screen.cursor + delta));
    render();
  }
}

// ── Map navigation ────────────────────────────────────────────────────────────
function mapMove(dr, dc) {
  const c = menu.mapCursor;
  c.row = Math.max(0, Math.min(5, c.row + dr));
  c.col = Math.max(0, Math.min(8, c.col + dc));
  render();
}

function mapAdjust(delta) {
  const screen = menu.stack[menu.stack.length - 1];
  if (!screen || screen.type !== 'map') return;
  const isIgn = screen.mapKey === 'ignMap';
  const map   = menu[screen.mapKey];
  const { row, col } = menu.mapCursor;
  map[row][col] = isIgn
    ? Math.max(0,   Math.min(50,  map[row][col] + delta))
    : Math.max(-30, Math.min(30,  map[row][col] + delta));
  render();
  sendToLua();
}

// ── Number adjustment ─────────────────────────────────────────────────────────
function numberAdjust(delta) {
  const screen = menu.stack[menu.stack.length - 1];
  if (!screen || screen.type !== 'number') return;
  menu[screen.field] = Math.max(screen.min, Math.min(screen.max, menu[screen.field] + delta * screen.step));
  render();
  sendToLua();
}

// ── Toggle adjustment ─────────────────────────────────────────────────────────
function toggleFlip() {
  const screen = menu.stack[menu.stack.length - 1];
  if (!screen || screen.type !== 'toggle') return;
  menu[screen.field] = !menu[screen.field];
  render();
  sendToLua();
}

// ── Direct adjust from list ───────────────────────────────────────────────────
function listDirectAdjust(delta) {
  const screen = menu.stack[menu.stack.length - 1];
  if (!screen || screen.type !== 'list') return;
  const item = screen.items[screen.cursor];
  if (!item) return;
  if (item.type === 'number') {
    menu[item.field] = Math.max(item.min, Math.min(item.max, (menu[item.field] || 0) + delta * item.step));
    sendToLua(); render();
  } else if (item.type === 'toggle') {
    menu[item.field] = !menu[item.field];
    sendToLua(); render();
  } else if (item.type === 'bank') {
    switchBank(menu.bankActive === 'A' ? 'B' : 'A');
  }
}

// ── Keyboard handler ──────────────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (!menu.open) return;
  e.preventDefault(); e.stopPropagation();

  const screen = menu.stack[menu.stack.length - 1];
  if (!screen) return;

  if (e.key === 'Escape' || e.key === 'Backspace') { navBack(); return; }

  if (screen.type === 'map') {
    switch (e.key) {
      case 'ArrowUp':    mapMove(-1, 0); break;
      case 'ArrowDown':  mapMove( 1, 0); break;
      case 'ArrowLeft':  mapMove( 0,-1); break;
      case 'ArrowRight': mapMove( 0, 1); break;
      case 'w': case 'W': mapMove(-1, 0); break;
      case 's': case 'S': mapMove( 1, 0); break;
      case 'a': case 'A': mapMove( 0,-1); break;
      case 'd': case 'D': mapMove( 0, 1); break;
      case '+': case '=': case 'PageUp':   mapAdjust( 1); break;
      case '-': case '_': case 'PageDown': mapAdjust(-1); break;
    }
  } else if (screen.type === 'number') {
    switch (e.key) {
      case 'ArrowUp': case 'ArrowRight':
      case '+': case '=': case 'PageUp':   numberAdjust( 1); break;
      case 'ArrowDown': case 'ArrowLeft':
      case '-': case '_': case 'PageDown': numberAdjust(-1); break;
      case 'Enter': navBack(); break;
    }
  } else if (screen.type === 'toggle') {
    switch (e.key) {
      case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight':
      case '+': case '-': case '=': case '_': case 'Enter': case ' ':
        toggleFlip(); break;
    }
  } else if (screen.type === 'list') {
    switch (e.key) {
      case 'ArrowUp':    navMoveCursor(-1); break;
      case 'ArrowDown':  navMoveCursor( 1); break;
      case 'ArrowLeft':  navBack(); break;
      case 'ArrowRight': case 'Enter': navSelect(); break;
      case '+': case '=': case 'PageUp':   listDirectAdjust( 1); break;
      case '-': case '_': case 'PageDown': listDirectAdjust(-1); break;
    }
  }
});

// ── Button handlers ───────────────────────────────────────────────────────────
document.getElementById('btnBack').addEventListener('click', navBack);
document.getElementById('btnMenu').addEventListener('click', function() {
  menu.stack = [{ type: 'list', title: 'MENU PRINCIPAL', items: getMainMenu(), cursor: 0 }];
  render();
});
document.getElementById('btnOk').addEventListener('click', function() {
  const screen = menu.stack[menu.stack.length - 1];
  if (!screen) return;
  if (screen.type === 'list')         navSelect();
  else if (screen.type === 'toggle')  toggleFlip();
  else navBack();
});

// ── Manual Transmission Badge ─────────────────────────────────────────────────
let _mtActive = false;
let _mtArrowTimer = null;

function updateMTBadge(active, gear, dir) {
  const badge  = document.getElementById('mt-badge');
  const gearEl = document.getElementById('mtGear');
  const upEl   = document.getElementById('mtUp');
  const dnEl   = document.getElementById('mtDn');
  const $gear  = document.getElementById('gear');

  if (active !== undefined) _mtActive = active;

  if (!badge) return;

  if (!_mtActive) {
    badge.style.display = 'none';
    if ($gear) { $gear.style.color = ''; $gear.style.textShadow = ''; }
    return;
  }

  badge.style.display = 'flex';
  if ($gear) {
    $gear.style.color      = '#00e676';
    $gear.style.textShadow = '0 0 10px rgba(0,230,118,0.6)';
  }

  if (gear !== undefined && gearEl) {
    const prev = gearEl.textContent;
    gearEl.textContent = gear;

    // Animação de bump na troca de marcha
    if (String(gear) !== prev) {
      gearEl.classList.remove('bump');
      void gearEl.offsetWidth; // reflow para reiniciar animação
      gearEl.classList.add('bump');

      // Acende a seta correspondente por 400ms
      const isUp = parseInt(gear) > parseInt(prev);
      clearTimeout(_mtArrowTimer);
      if (upEl && dnEl) {
        upEl.classList.toggle('active', isUp);
        dnEl.classList.toggle('active', !isUp);
        _mtArrowTimer = setTimeout(() => {
          upEl.classList.remove('active');
          dnEl.classList.remove('active');
        }, 400);
      }
    }
  }
}

// ── Manual Redline indicator ──────────────────────────────────────────────────
let _redlineFlash = null;

function updateMTRedline(isRedline, capPct) {
  const badge  = document.getElementById('mt-badge');
  const gearEl = document.getElementById('mtGear');
  if (!badge || !_mtActive) return;

  if (isRedline) {
    badge.style.borderColor = '#ff2200';
    badge.style.boxShadow   = '0 0 28px rgba(255,34,0,0.5), 0 0 6px rgba(0,0,0,0.8)';
    if (gearEl) gearEl.style.color = '#ff4400';
    // Pisca o badge enquanto no redline
    if (!_redlineFlash) {
      _redlineFlash = setInterval(() => {
        if (!badge) return;
        badge.style.opacity = badge.style.opacity === '0.4' ? '1' : '0.4';
      }, 80);
    }
  } else {
    clearInterval(_redlineFlash);
    _redlineFlash = null;
    badge.style.borderColor = '#00e676';
    badge.style.boxShadow   = '0 0 24px rgba(0,230,118,0.25), 0 0 6px rgba(0,0,0,0.8)';
    badge.style.opacity     = '1';
    if (gearEl) gearEl.style.color = '#ffffff';
  }
}

// ── NUI message listener ──────────────────────────────────────────────────────
window.addEventListener('message', function(event) {
  const d = event.data;

  if (d.show !== undefined) {
    document.getElementById('speedometer').style.display = d.show ? 'block' : 'none';
    updateWBO2Visibility(d.show);
    if (!d.show) hideDragSlip();
  }

  if (d.manualMode !== undefined || d.manualGear !== undefined) {
    updateMTBadge(d.manualMode, d.manualGear, d.manualDir);
  }
  if (d.manualRedline !== undefined) {
    updateMTRedline(d.manualRedline, d.manualCapPct);
  }

  if (d.showMenu) {
    openMenu(d.ecuState ?? d);
  }

  if (d.update) {
    updateHUD(d);
  }

  // Closed loop updated the injection map silently
  if (d.clUpdate && menu.open) {
    const bankKey = d.activeBank === 'A' ? 'injMapA' : 'injMapB';
    menu[bankKey] = deepClone(d.injMap);
    if (menu.bankActive === d.activeBank) {
      menu.injMap = deepClone(d.injMap);
      const screen = menu.stack[menu.stack.length - 1];
      if (screen && screen.type === 'map' && screen.mapKey === 'injMap') render();
    }
  }

  // Turbo BOV sound (gear change pressure dump)
  if (d.turboBOV) {
    turboBOV();
  }

  // Drag timer events
  if (d.dragStart) {
    hideDragSlip();
  }
  if (d.dragSlip) {
    showDragSlip(d);
  }
  if (d.dragAbort) {
    hideDragSlip();
  }
});
