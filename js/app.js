// GA Life: una piccola "The Sims" per due. Lotto isometrico con casa e giardino; tocchi un oggetto per dare un
// ordine al Sim selezionato, il pavimento per farlo camminare, l'altro Sim per interagire. In Arreda si compra
// (trascinando i mobili) e si costruisce (muri, porte, finestre, pavimenti, colori).
// Tutto resta nel telefono (IndexedDB): la partita si salva da sola.
import { getSetting, setSetting } from './db.js';
import { APP_VERSION } from './version.js';
import { makeView, floorTile, drawSim, bubble, box, shade } from './iso.js';
import { TYPES, CATS, NEEDS, SKILLS, SOCIAL, ACTIONS, footprint } from './catalog.js';
import { newGame, tick, order, cancel, actionsFor, mood, moodlets, ambiente, canPlace, crossesWall, timeText, dayText, SPEEDS, CAREERS, oa,
  migrate, gameEvent, currentGoal, GOALS, WISHES, wkey, exitTile, floorAt, stairEnds, LEVELS } from './game.js';

const $ = sel => document.querySelector(sel);
const canvas = $('#canvas');
const ctx = canvas.getContext('2d');
const sheet = $('#sheet');
const native = window.Android;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = n => `${Math.round(n).toLocaleString('it-IT')} €`;

let g = null;            // la partita
let sel = 0;             // Sim selezionato
let w = 0, h = 0;
const v = makeView();
let mini = (() => { try { return localStorage.getItem('mini') === '1'; } catch { return false; } })();   // pannello in basso ridotto
let build = null;        // modalità Arreda: { tab, cat, placing, tool, floor, paint }
let viewLv = 0;          // piano che si sta guardando: -1 tavernetta, 0 piano terra, 1 primo piano
let followLv = null;     // piano del Sim selezionato all'ultimo controllo (la vista lo segue sulle scale)
const lvOf = o => o.lv ?? 0;

const ICONS = {
  letto: '🛏️', lettoLusso: '🛏️', lettoSingolo: '🛏️', comodino: '🕯️', armadio: '🚪', specchio: '🪞', wc: '🚽', doccia: '🚿', vasca: '🛁', lavandino: '🪥',
  frigo: '🧊', frigoLusso: '🧊', fornello: '🍳', cucinaPro: '👨‍🍳', microonde: '📦', bancone: '🟫', lavello: '🚰', lavastoviglie: '🍽️', tavolo: '🍽️', tavoloQuattro: '🍽️',
  divano: '🛋️', divanoLusso: '🛋️', poltrona: '💺', tv: '📺', tvGrande: '🖥️', console: '🕹️', computer: '💻', libreria: '📚', stereo: '🔊', acquario: '🐠',
  scacchi: '♟️', chitarra: '🎸', cavalletto: '🎨', tapis: '🏃', pesi: '🏋️', pianta: '🪴', piantaGrande: '🌿', lampada: '💡', tappeto: '🟥', tappetoGrande: '🟫',
  quadro: '🖼️', dipinto: '🖼️', statua: '🗿', albero: '🌳', pino: '🌲', siepe: '🌱', aiuola: '🌷', panchina: '🪑', barbecue: '🍖', amaca: '🌴', altalena: '🎠',
  fontana: '⛲', piscina: '🏊', lampione: '🏮', cassetta: '📬', scala: '🪜', antifurto: '🚨', baule: '🧳', auto: '🚗', suv: '🚙', banco: '🧰',
  biliardo: '🎱', freccette: '🎯', bar: '🍹', jukebox: '🎵', pizza: '🍕',
};
// Pavimenti: [nome, colore, colore alternato, prezzo a casella]
const FLOORS = {
  legno: ['Parquet', '#c8925f', '#bd8655', 5], legnoScuro: ['Parquet scuro', '#7c4a2d', '#734328', 8], camera: ['Moquette beige', '#e9d5b7', '#e2cba9', 5],
  moquetteRossa: ['Moquette rossa', '#9f1239', '#951134', 6], cucina: ['Piastrelle bianche', '#f5f5f4', '#e7e5e4', 6], bagno: ['Piastrelle azzurre', '#bfdbfe', '#a5c8f5', 6],
  marmo: ['Marmo', '#f1f5f9', '#e2e8f0', 15], cemento: ['Cemento', '#a8a29e', '#a19b97', 3], pietra: ['Pietra', '#cbd5e1', '#b6c2d0', 4], erba: ['Prato', '#4ade80', '#45d379', 1],
};
const WALL_COLORS = ['#ede9fe', '#fef3c7', '#dcfce7', '#dbeafe', '#fee2e2', '#f5f5f4', '#d6d3d1', '#fde68a', '#c7d2fe', '#fbcfe8'];
const WALL_H = 40;          // muri "tagliati" bassi, come in The Sims, per vedere dentro
const PRICES = { muro: 15, porta: 120, finestra: 80, pittura: 5, saracinesca: 400 };
const FLOOR_EXTRA = { '-1': 25, 0: 0, 1: 10 };   // costo in più a casella: scavare la tavernetta, la struttura del primo piano

function toast(text) {
  const box = $('#toasts');
  if ([...box.children].some(el => el.textContent === text)) return;   // niente doppioni
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  box.prepend(el);
  while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => el.remove(), 3600);
}
function notify(text) {
  if (text.startsWith('__jobs__')) return jobsSheet(+text.slice(8));
  toast(text);
  if (/crollat|figuraccia|in tempo/.test(text)) { if (native?.vibrate) native.vibrate('60'); else navigator.vibrate?.(60); }
}

// ---------------------------------------------------------------- disegno
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  w = canvas.clientWidth; h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function centerOn(x, y) {
  v.ox = w / 2 - (x - y) * v.TW / 2;
  v.oy = h * 0.38 - (x + y) * v.TH / 2;   // un po' in alto: sotto c'è il pannello
}
const quad = (pts, fill) => {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
};

/** Profondità di disegno di un oggetto: chi è più "in basso" sullo schermo sta davanti. */
const objDepth = o => { const f = footprint(o); return f.x + f.w + f.y + f.d - 0.01; };
/** Un Sim che usa un posto di un mobile (letto, divano, sedia…) si disegna subito dopo il mobile: sopra, non dentro. */
function simDepth(s) {
  const c = s.cur;
  if (c?.state === 'do' && c.objRef && c.seat != null) {
    const o = c.objRef, T = TYPES[o.type];
    const base = objDepth(o);
    if (!T.front) return base + 0.005;
    const f = footprint(o);
    return s.x + s.y < f.x + f.w / 2 + f.y + f.d / 2 - 0.05 ? base + 0.005 : base + 0.012;   // dietro o davanti al pezzo "front"
  }
  return s.x + s.y + 0.05;
}
const seatHeight = s => {
  const c = s.cur;
  if (c?.state === 'do' && c.objRef && c.seat != null) return TYPES[c.objRef.type].seatH ?? 0;
  return 0;
};

function draw() {
  const hr = g.minute / 60;
  const night = hr < 6 || hr > 21 ? 1 : hr < 7 ? 7 - hr : hr > 19 ? (hr - 19) / 2 : 0;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, night > 0.5 ? '#1e1b4b' : '#7dd3fc');
  grad.addColorStop(1, night > 0.5 ? '#312e81' : '#bae6fd');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  const m = 6;
  if (viewLv === -1) {   // tavernetta: sotto terra, si vede solo quello che è stato scavato
    quad([v.at(-m, -m), v.at(g.W + m, -m), v.at(g.W + m, g.H + m), v.at(-m, g.H + m)], '#3b2f2a');
    for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) if (floorAt(g, -1, x, y) == null) floorTile(ctx, v, x, y, (x + y) % 2 ? '#4a3b33' : '#46382f', 'rgba(0,0,0,.15)');
  } else {   // terreno intorno al lotto e strada davanti
    quad([v.at(-m, -m), v.at(g.W + m, -m), v.at(g.W + m, g.H), v.at(-m, g.H)], '#3fbf6f');
    quad([v.at(-m, g.H), v.at(g.W + m, g.H), v.at(g.W + m, g.H + 0.6), v.at(-m, g.H + 0.6)], '#d6d3d1');
    quad([v.at(-m, g.H + 0.6), v.at(g.W + m, g.H + 0.6), v.at(g.W + m, g.H + 3), v.at(-m, g.H + 3)], '#475569');
    for (let x = -m; x < g.W + m; x += 2) quad([v.at(x, g.H + 1.75), v.at(x + 1, g.H + 1.75), v.at(x + 1, g.H + 1.85), v.at(x, g.H + 1.85)], '#f8fafc');
    quad([v.at(-m, g.H + 3), v.at(g.W + m, g.H + 3), v.at(g.W + m, g.H + m), v.at(-m, g.H + m)], '#3fbf6f');
  }
  if (viewLv === 1) {   // primo piano: il piano terra si vede in trasparenza sotto
    ctx.globalAlpha = 0.35;
    drawLevel(0, false);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(15,23,42,.25)';
    ctx.fillRect(0, 0, w, h);
  }
  drawLevel(viewLv, true);
  for (const s of g.sims) if (!s.atWork && s.lv === viewLv) { drawName(s); drawBubble(s); }
  for (const o of g.objects) if (lvOf(o) === viewLv) drawState(o);
  if (night > 0 && viewLv !== -1) {
    ctx.fillStyle = `rgba(30,27,75,${0.32 * Math.min(1, night)})`;
    ctx.fillRect(0, 0, w, h);
  }
}

/** Disegna un piano: pavimenti, muri, oggetti e (se live) Sim, piatti e anteprime della costruzione. */
function drawLevel(lv, live) {
  const L = g.levels[lv];
  for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) {
    const id = L.floors[y * g.W + x];
    if (id == null) continue;
    const f = FLOORS[id] ?? FLOORS.erba;
    floorTile(ctx, v, x, y, f[1 + ((x + y) % 2)], f[0] === 'Prato' ? 'rgba(0,0,0,.03)' : 'rgba(0,0,0,.08)');
  }
  if (lv === 0) { const [ex, ey] = exitTile(g); floorTile(ctx, v, ex, ey, '#9ca3af'); }
  const items = [];
  for (const o of g.objects) {
    if (lvOf(o) !== lv || (live && build?.placing?.moveId === o.id) || (o.inUse != null && o.inUse >= 0)) continue;
    if (TYPES[o.type].flat) { TYPES[o.type].draw(ctx, v, o, g); continue; }
    const d = objDepth(o);
    items.push({ depth: d, o });
    if (TYPES[o.type].front) items.push({ depth: d + 0.008, front: o });
  }
  if (live) for (const s of g.sims) if (!s.atWork && s.lv === lv) items.push({ depth: simDepth(s), s });
  for (const k in L.walls) {
    const [t, a, b] = k.split(':'), p = +a, q = +b;
    items.push(t === 'v' ? { depth: p + q + 1.02, wall: k, r: [p - 0.06, q, 0.12, 1] } : { depth: p + q + 1.02, wall: k, r: [p, q - 0.06, 1, 0.12] });
  }
  if (live) {
    for (const d of g.dishes ?? []) if ((d.lv ?? 0) === lv) items.push({ depth: d.h ? d.x + d.y + 3 : d.x + d.y, dish: d });   // sul tavolo: sopra il piano
    if (build?.placing) items.push({ depth: objDepth(build.placing) + 0.02, ghost: build.placing });
    if (build?.wallPreview) for (const r of build.wallPreview) items.push({ depth: 999, preview: r });
  }
  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) {
    if (it.o) TYPES[it.o.type].draw(ctx, v, it.o, g);
    else if (it.front) TYPES[it.front.type].front(ctx, v, it.front);
    else if (it.ghost) drawGhost(it.ghost);
    else if (it.wall) drawWall(L.walls[it.wall], it.wall, it.r);
    else if (it.dish) drawDish(it.dish);
    else if (it.preview) box(ctx, v, ...it.preview.r, WALL_H, it.preview.ok ? 'rgba(74,222,128,.7)' : 'rgba(239,68,68,.6)');
    else drawOneSim(it.s);
  }
}

/** Sporco, guasti, fiamme e corrente staccata sopra gli oggetti. */
function drawState(o) {
  const T = TYPES[o.type];
  const f = footprint(o);
  const [sx, sy] = v.at(f.x + f.w / 2, f.y + f.d / 2, 30);
  const t = performance.now() / 1000;
  if (o.fire) {
    for (let i = 0; i < 7; i++) {
      const k = (t * 1.7 + i / 7) % 1;
      ctx.fillStyle = `rgba(${240 + Math.round(15 * Math.sin(i))},${Math.round(160 - k * 120)},20,${0.9 - k * 0.8})`;
      ctx.beginPath(); ctx.arc(sx + Math.sin(i * 2.3 + t * 3) * 10 * v.z, sy - k * 40 * v.z, (10 - k * 6) * v.z, 0, Math.PI * 2); ctx.fill();
    }
    return;
  }
  if ((o.dirt ?? 0) >= 4) {   // macchie e moscerini
    ctx.fillStyle = 'rgba(120,53,15,.55)';
    for (const [dx, dy] of [[-8, 6], [6, 10], [2, -2]]) { ctx.beginPath(); ctx.ellipse(sx + dx * v.z, sy + dy * v.z + 18 * v.z, 5 * v.z, 2.5 * v.z, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#1f2937';
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(sx + Math.sin(t * 4 + i * 2) * 12 * v.z, sy - 6 * v.z + Math.cos(t * 5 + i) * 6 * v.z, 1.3 * v.z, 0, Math.PI * 2); ctx.fill(); }
  }
  if (o.broken) {
    ctx.fillStyle = 'rgba(100,116,139,.6)';
    for (let i = 0; i < 3; i++) { const k = (t * 0.6 + i / 3) % 1; ctx.beginPath(); ctx.arc(sx + Math.sin(i * 3) * 6 * v.z, sy - 10 * v.z - k * 30 * v.z, (5 + k * 6) * v.z, 0, Math.PI * 2); ctx.fill(); }
    bubble(ctx, v, sx - 16 * v.z, sy + 50 * v.z, '💥', true);
  } else if (T.elec && !g.power) bubble(ctx, v, sx - 16 * v.z, sy + 50 * v.z, '🔌', true);
}

function drawWall(wl, k, r) {
  const c = wl.color ?? '#ede9fe';
  const top = { top: shade(c, -0.45) };
  if (wl.garage) {   // saracinesca del garage: si passa, con le doghe
    box(ctx, v, ...r, 6, c, { z0: WALL_H - 6, ...top });
    box(ctx, v, ...r, WALL_H - 6, 'rgba(148,163,184,.55)', { top: 'rgba(148,163,184,.3)', line: 'rgba(71,85,105,.6)' });
    return;
  }
  if (wl.door) {   // stipiti e architrave: si passa in mezzo
    const vert = k[0] === 'v';
    const [x, y, ww, dd] = r;
    if (vert) { box(ctx, v, x, y, ww, 0.12, WALL_H, c, top); box(ctx, v, x, y + 0.88, ww, 0.12, WALL_H, c, top); box(ctx, v, x, y, ww, 1, 6, c, { z0: WALL_H - 6, ...top }); }
    else { box(ctx, v, x, y, 0.12, dd, WALL_H, c, top); box(ctx, v, x + 0.88, y, 0.12, dd, WALL_H, c, top); box(ctx, v, x, y, 1, dd, 6, c, { z0: WALL_H - 6, ...top }); }
    return;
  }
  if (wl.win) {   // finestra: muretto, vetro, sopra il muro
    box(ctx, v, ...r, 14, c, top);
    box(ctx, v, ...r, WALL_H - 22, 'rgba(186,230,253,.55)', { z0: 14, top: 'rgba(186,230,253,.4)', line: 'rgba(255,255,255,.8)' });
    box(ctx, v, ...r, 8, c, { z0: WALL_H - 8, ...top });
    return;
  }
  box(ctx, v, ...r, WALL_H, c, top);
}

function drawDish(d) {
  const [sx, sy] = v.at(d.x, d.y, d.h + 1);
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(sx, sy, 8 * v.z, 4 * v.z, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#a16207';
  ctx.beginPath(); ctx.ellipse(sx + 1, sy, 4 * v.z, 2 * v.z, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(132,204,22,.8)';   // "puzza" se resta lì
  for (let i = 0; i < 2; i++) { const t = (performance.now() / 900 + i * 0.5) % 1; ctx.beginPath(); ctx.arc(sx - 4 + i * 8, sy - 6 - t * 14 * v.z, 1.8 * v.z, 0, Math.PI * 2); ctx.fill(); }
}

function drawOneSim(s) {
  const [sx, sy] = v.at(s.x, s.y, seatHeight(s));
  if (s.id === sel && !build) {
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;
    const [gx, gy] = s.pose ? [sx, sy] : [sx, sy];
    ctx.beginPath(); ctx.ellipse(gx, gy, 15 * v.z, 7 * v.z, 0, 0, Math.PI * 2); ctx.stroke();
  }
  const moving = s.cur?.state === 'walk' || s.cur?.dance || s.cur?.run;
  drawSim(ctx, v, sx, sy, s.look, {
    face: s.face, walk: moving ? s.walk : 0, pose: s.pose === 'lie' ? 'sleep' : s.pose, back: s.back,
    mood: mood(s, g), plumbob: s.id === sel && !build && s.pose !== 'lie',
  });
  if (s.cur?.state === 'do' && s.cur.id === 'doccia') {   // vapore della doccia
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    for (let i = 0; i < 4; i++) { const t = performance.now() / 600 + i; ctx.beginPath(); ctx.arc(sx + Math.sin(t) * 10 * v.z, sy - 40 * v.z - (t % 1) * 30 * v.z, 6 * v.z, 0, Math.PI * 2); ctx.fill(); }
  }
}

/** Nome sotto i piedi, così si capisce sempre chi è chi (verde quello che comandi). */
function drawName(s) {
  const [sx, sy] = v.at(s.x, s.y, seatHeight(s));
  ctx.font = `800 ${Math.max(10, 11 * v.z)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const y = sy + 8 * v.z, tw = ctx.measureText(s.name).width + 10;
  ctx.fillStyle = s.id === sel ? 'rgba(22,163,74,.9)' : 'rgba(26,20,38,.75)';
  ctx.beginPath(); ctx.roundRect?.(sx - tw / 2, y - 2, tw, 16, 8); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(s.name, sx, y);
}

function drawBubble(s) {
  const [sx, sy] = v.at(s.x, s.y, seatHeight(s));
  const low = NEEDS.find(([k]) => s.needs[k] < 15);
  if (s.cur && s.cur.id !== 'go') bubble(ctx, v, sx, sy, s.cur.id === 'dormi' ? 'Zz' : s.cur.emoji);
  else if (low) bubble(ctx, v, sx, sy, low[1], true);
}

function drawGhost(p) {
  const ok = canPlace(g, p, p.moveId);
  ctx.globalAlpha = 0.8;
  TYPES[p.type].draw(ctx, v, p);
  TYPES[p.type].front?.(ctx, v, p);
  ctx.globalAlpha = 1;
  const f = footprint(p);
  quad([v.at(f.x, f.y), v.at(f.x + f.w, f.y), v.at(f.x + f.w, f.y + f.d), v.at(f.x, f.y + f.d)], ok ? 'rgba(34,197,94,.35)' : 'rgba(239,68,68,.4)');
}

// ---------------------------------------------------------------- pannelli (HUD)
function hud() {
  $('#clock').innerHTML = `<b>${timeText(g)}</b><small>${esc(dayText(g))}</small>`;
  $('#money').textContent = eur(g.money);
  $('#money').classList.toggle('neg', g.money < 0);
  for (const b of document.querySelectorAll('[data-speed]')) b.classList.toggle('on', +b.dataset.speed === g.speed && !build);
  $('#portraits').innerHTML = g.sims.map(s => `<button class="portrait ${s.id === sel ? 'on' : ''}" data-sel="${s.id}" style="--mood:hsl(${Math.round(mood(s, g) * 1.2)},75%,48%)">
      <span class="face" style="background:${s.look.skin};border-color:${s.look.hair}">${esc(s.name[0] ?? '?')}</span><small>${esc(s.name)}</small>${s.atWork ? '<i>💼</i>' : s.lv !== viewLv ? `<b>${s.lv > viewLv ? '⬆️' : '⬇️'}</b>` : ''}</button>`).join('');
  $('#bottom').classList.toggle('mini', mini && !build);
  // La vista segue il Sim selezionato quando cambia piano (scale)
  const fs = g.sims[sel];
  if (!build && !fs.atWork && followLv !== fs.lv) { followLv = fs.lv; if (viewLv !== fs.lv) setLevel(fs.lv); }
  if (build) { $('#goal').hidden = true; return; }
  const s = g.sims[sel];
  const job = s.job && CAREERS[s.job.career];
  const q = [s.cur, ...s.queue.map(c => ({ ...c, emoji: queueEmoji(c) }))].filter(Boolean);
  const doing = s.atWork ? `💼 Al lavoro fino alle ${job.end}:00` : s.cur ? `${s.cur.emoji ?? ''} ${s.cur.state === 'walk' && !['go', 'vaiLavoro'].includes(s.cur.id) ? 'Sta andando a: ' : ''}${s.cur.label}` : 'Libero: tocca un oggetto o il pavimento';
  const goal = currentGoal(g);
  $('#goal').hidden = !goal;
  if (goal) $('#goal').innerHTML = `<span>🎯</span><span><b>${esc(goal.text)}</b><small>${esc(goal.hint)}</small></span><em>+${goal.reward} €</em>`;
  const amb = s.atWork ? null : ambiente(g, s.x, s.y, s.lv);
  $('#panel').innerHTML = `<div class="who" data-mini><b>${esc(s.name)}</b><span>${moodText(mood(s, g))}</span><i class="fold">${mini ? '▲' : '▼'}</i>
      <small>${job ? `${job.emoji} ${esc(job.titles[s.job.level])} · ${job.start}-${job.end}` : 'Disoccupat' + oa(s) + ': trova lavoro con 💼'}${amb != null ? ` · 🏠 ${ambText(amb)}` : ''}</small></div>
    <div class="doing">${esc(doing)}</div>
    ${(() => { const ms = moodlets(g, s); return ms.length ? `<div class="moods">${ms.map(m => `<span class="${m.val > 0 ? 'up' : m.val < 0 ? 'down' : ''}">${m.emoji} ${esc(m.text)}${m.val ? ` ${m.val > 0 ? '+' : ''}${m.val}` : ''}</span>`).join('')}</div>` : ''; })()}
    <div class="queue">${q.length ? q.map((c, i) => `<button class="qi ${i === 0 && s.cur ? 'now' : ''}" data-cancel="${i}" title="Tocca per annullare">${c.emoji ?? '•'}</button>`).join('') + '<small>tocca un\'icona per annullarla</small>' : ''}</div>
    ${s.wishes?.length ? `<div class="wishes">⭐ ${s.wishes.map(id => { const wi = WISHES.find(x => x.id === id); return `<span>${wi.emoji} ${esc(wi.text)}</span>`; }).join('')}</div>` : ''}
    <div class="needs">${NEEDS.map(([k, e, l]) => `<div class="need" title="${l}"><span>${e}</span><div class="bar"><i style="width:${s.needs[k]}%;background:hsl(${Math.round(s.needs[k] * 1.2)},70%,45%)"></i></div></div>`).join('')}</div>
    <div class="rel"><span>❤️ ${esc(g.sims[0].name)} e ${esc(g.sims[1].name)}</span><div class="bar"><i style="width:${g.rel}%"></i></div></div>`;
}
function queueEmoji(c) {
  if (c.kind === 'social') return SOCIAL.find(a => a.id === c.action)?.emoji;
  if (c.kind === 'go') return '👣';
  if (c.kind === 'dish') return '🍽️';
  return ACTIONS[c.action]?.emoji ?? (c.action === 'siediTavolo' ? '🪑' : '•');
}
const moodText = m => (m >= 80 ? '😄 Felicissimo' : m >= 60 ? '🙂 Di buon umore' : m >= 40 ? '😐 Così così' : m >= 20 ? '😟 Giù di morale' : '😫 Molto infelice');
const ambText = a => (a >= 10 ? 'casa bellissima' : a >= 5 ? 'casa accogliente' : a >= 0 ? 'casa normale' : 'disordine');

// ---------------------------------------------------------------- tocchi: vista, selezione, ordini, costruzione
const pointers = new Map();
let drag = null, pinch = null;

canvas.addEventListener('pointerdown', e => {
  try { canvas.setPointerCapture?.(e.pointerId); } catch { /* niente */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  closeMenu();
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: v.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ox: v.ox, oy: v.oy };
    if (drag?.kind === 'wall') build.wallPreview = null;
    drag = null;
    return;
  }
  drag = { x: e.clientX, y: e.clientY, ox: v.ox, oy: v.oy, moved: false, kind: 'pan' };
  if (build) buildDown(drag, e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {   // due dita: zoom e spostamento
    const [a, b] = [...pointers.values()];
    v.ox = pinch.ox + ((a.x + b.x) / 2 - pinch.mx);
    v.oy = pinch.oy + ((a.y + b.y) / 2 - pinch.my);
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 8) drag.moved = true;
  if (!drag.moved) return;
  if (drag.kind === 'pan') { v.ox = drag.ox + dx; v.oy = drag.oy + dy; }
  else buildMove(drag, e.clientX, e.clientY);
});
const up = e => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (drag && e.type === 'pointerup') {
    if (drag.kind !== 'pan') buildUp(drag, e.clientX, e.clientY);
    else if (!drag.moved) tap(e.clientX, e.clientY);
  }
  drag = null;
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, v.z * (e.deltaY < 0 ? 1.1 : 0.9)); }, { passive: false });

function zoomAt(sx, sy, z) {
  z = Math.max(0.4, Math.min(2, z));
  const [tx, ty] = v.tile(sx, sy);
  v.z = z;
  const [nx, ny] = v.at(tx, ty);
  v.ox += sx - nx; v.oy += sy - ny;
}

/** Cosa c'è sotto il dito: un Sim, dei piatti, un oggetto o una casella. */
function hit(sx, sy, withSims = true) {
  if (withSims) {
    for (const s of [...g.sims].sort((a, b) => simDepth(b) - simDepth(a))) {
      if (s.atWork || s.lv !== viewLv) continue;
      const [px, py] = v.at(s.x, s.y, seatHeight(s));
      if (Math.abs(sx - px) < 16 * v.z && sy < py + 6 * v.z && sy > py - 62 * v.z) return { sim: s };
    }
    for (const d of g.dishes ?? []) {
      if ((d.lv ?? 0) !== viewLv) continue;
      const [px, py] = v.at(d.x, d.y, d.h);
      if (Math.hypot(sx - px, sy - py) < 14 * v.z) return { dish: d };
    }
  }
  let best = null;
  for (const o of g.objects) {
    if (lvOf(o) !== viewLv || (o.inUse != null && o.inUse >= 0)) continue;
    const f = footprint(o);
    const tall = TYPES[o.type].flat ? 0 : 50;
    const pts = [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.d], [f.x, f.y + f.d]].flatMap(([x, y]) => [v.at(x, y), v.at(x, y, tall)]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    if (sx < Math.min(...xs) || sx > Math.max(...xs) || sy < Math.min(...ys) || sy > Math.max(...ys)) continue;
    // dentro il rombo della base (o sopra di essa, per gli oggetti alti)
    const [tx, ty] = v.tile(sx, sy + tall * v.z * 0.5);
    const inside = tx >= f.x - 0.6 && tx <= f.x + f.w + 0.6 && ty >= f.y - 0.6 && ty <= f.y + f.d + 0.6;
    if (!inside) continue;
    const depth = objDepth(o) - (TYPES[o.type].flat ? 100 : 0);
    if (!best || depth > best.depth) best = { obj: o, depth };
  }
  if (best) return best;
  const [tx, ty] = v.tile(sx, sy);
  if (floorAt(g, viewLv, Math.floor(tx), Math.floor(ty)) != null) return { tile: [Math.floor(tx), Math.floor(ty)] };
  return {};
}

function tap(sx, sy) {
  if (build) return;
  const t = hit(sx, sy);
  const s = g.sims[sel];
  if (t.sim) {
    if (t.sim.id === sel) return phoneMenu(sx, sy);
    menu(sx, sy, `${esc(t.sim.name)}`, [
      { label: `👆 Controlla ${t.sim.name}`, run: () => { sel = t.sim.id; hud(); } },
      ...SOCIAL.map(a => ({ label: `${a.emoji} ${a.label}`, dim: g.rel < a.min, run: () => say(order(g, s, { kind: 'social', action: a.id })) })),
    ]);
    return;
  }
  if (t.dish) return menu(sx, sy, '🍽️ Piatti sporchi', [{ label: '🍽️ Porta via i piatti', run: () => say(order(g, s, { kind: 'dish', id: t.dish.id })) }]);
  if (t.obj) {
    const T = TYPES[t.obj.type];
    const acts = actionsFor(g, s, t.obj);
    if (!acts.length) return toast(`${T.name}: è solo decorativo (fa bella la casa).`);
    menu(sx, sy, `${ICONS[t.obj.type] ?? ''} ${esc(T.name)}`, acts.filter(a => !a.hidden).map(a => ({ label: `${a.emoji} ${a.label}`, run: () => say(order(g, s, { kind: 'obj', obj: t.obj.id, action: a.id })) })));
    return;
  }
  if (t.tile) say(order(g, s, { kind: 'go', x: t.tile[0], y: t.tile[1], lv: viewLv }));
}
const say = msg => { if (msg) toast(msg); hud(); };

/** Toccando il proprio Sim: il telefono. */
function phoneMenu(sx, sy) {
  const broken = g.objects.filter(o => o.broken);
  menu(sx, sy, '📱 Telefono', [
    { label: g.pizzaAt ? '🍕 La pizza sta arrivando…' : '🍕 Ordina una pizza (25 €)', dim: !!g.pizzaAt, run: () => {
      if (g.pizzaAt) return;
      if (g.money < 25) return toast('Non avete abbastanza soldi.');
      g.money -= 25;
      g.pizzaAt = g.day * 1440 + g.minute + 45;
      toast('🍕 Pizza ordinata: arriva tra 45 minuti davanti a casa.');
    } },
    ...broken.map(o => ({ label: `🔧 Chiama il tecnico per: ${TYPES[o.type].name} (150 €)`, run: () => {
      if (g.money < 150) return toast('Non avete abbastanza soldi.');
      g.money -= 150;
      o.broken = false;
      toast(`🔧 Il tecnico ha riparato: ${TYPES[o.type].name}.`);
      save();
    } })),
    ...(g.bill ? [{ label: `🧾 Paga le bollette online (${g.bill.amount} € + 10 €)`, run: () => {
      g.money -= g.bill.amount + 10;
      toast(`🧾 Bollette pagate.${g.power ? '' : ' La corrente è tornata.'}`);
      g.bill = null;
      g.power = true;
      gameEvent(g, null, 'paga', notify);
      save();
    } }] : []),
  ]);
}

/** Cambia il piano che si guarda (▲▼). */
function setLevel(lv) {
  viewLv = Math.max(-1, Math.min(1, lv));
  $('#lvName').textContent = LEVELS.find(l => l[0] === viewLv)[1];
  if (build) buildPanel();
}

function menu(sx, sy, title, items) {
  const m = $('#menu');
  m.innerHTML = `<b>${title}</b>${items.map((it, i) => `<button data-mi="${i}" class="${it.dim ? 'dim' : ''}">${esc(it.label)}</button>`).join('')}`;
  m.hidden = false;
  m._items = items;
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.max(8, Math.min(w - r.width - 8, sx - r.width / 2))}px`;
  m.style.top = `${Math.max(60, Math.min(h - r.height - 8, sy - r.height - 20))}px`;
}
function closeMenu() { $('#menu').hidden = true; }

// ---------------------------------------------------------------- Arreda: Compra e Costruisci
function openBuild() {
  closeMenu();
  build = { tab: build?.tab ?? 'compra', cat: build?.cat ?? CATS[0], placing: null, tool: null, floor: 'legno', paint: WALL_COLORS[1] };
  document.body.classList.add('building');
  buildPanel();
}
function closeBuild() {
  build = null;
  document.body.classList.remove('building');
  save();
  hud();
}
const TOOLS = [
  ['muro', '🧱', 'Muro', 'Trascina il dito lungo la griglia per tirare un muro (15 € a pezzo).'],
  ['abbatti', '⛏️', 'Abbatti', 'Tocca un muro per abbatterlo (in tavernetta e al primo piano anche un pavimento vuoto).'],
  ['porta', '🚪', 'Porta', 'Tocca un muro per metterci una porta (120 €); toccala di nuovo per toglierla.'],
  ['saracinesca', '🚘', 'Garage', 'Tocca i pezzi di muro dove vuoi la saracinesca del garage (400 € l\'uno; l\'auto ne vuole 2 affiancati).'],
  ['finestra', '🪟', 'Finestra', 'Tocca un muro per metterci una finestra (80 €).'],
  ['pavimento', '🟫', 'Pavimento', 'Scegli il pavimento e passa il dito sulle caselle. In tavernetta prima si scava (+25 € a casella), al primo piano si costruisce il solaio (+10 €).'],
  ['pittura', '🎨', 'Pittura', 'Scegli il colore e tocca i muri da dipingere (5 €).'],
];
function buildPanel() {
  const p = build.placing;
  const tabs = `<div class="seg3"><button class="${build.tab === 'compra' ? 'on' : ''}" data-btab="compra">🛍️ Compra</button><button class="${build.tab === 'costruisci' ? 'on' : ''}" data-btab="costruisci">🔨 Costruisci</button></div>`;
  if (p) {
    $('#panel').innerHTML = `<div class="placing"><b>${ICONS[p.type] ?? ''} ${esc(TYPES[p.type].name)}</b>
      <small>${p.moveId ? 'Trascinalo dove vuoi' : `${eur(TYPES[p.type].price)} · trascinalo dove vuoi (riquadro verde = ci sta)`}</small>
      <div class="row-buttons"><button class="secondary" data-brot>↻ Ruota</button>${TYPES[p.type].colors ? '<button class="secondary" data-bcolor>🎨 Colore</button>' : ''}
        <button class="primary" data-bok>${p.moveId ? 'Lascia qui' : 'Compra qui'}</button><button class="secondary" data-bcancel>Annulla</button></div></div>`;
    return;
  }
  if (build.tab === 'compra') {
    $('#panel').innerHTML = `${tabs}<div class="cats">${CATS.map(c => `<button class="chip ${c === build.cat ? 'on' : ''}" data-bcat="${c}">${c}</button>`).join('')}</div>
      <div class="shop">${Object.entries(TYPES).filter(([, T]) => T.cat === build.cat).map(([id, T]) => `<button class="item ${g.money < T.price ? 'dim' : ''}" data-buy="${id}">
        <span>${ICONS[id] ?? '📦'}</span><b>${esc(T.name)}</b><small>${eur(T.price)}${T.q ? ' · ★' : ''}${T.amb ? ` · 🏠+${T.amb}` : ''}</small></button>`).join('')}</div>
      <p class="hint">Trascina i mobili in casa per spostarli; toccali per ruotarli, cambiare colore o venderli. ★ = migliore, 🏠 = fa bella la casa.</p>`;
    return;
  }
  const tool = TOOLS.find(t => t[0] === build.tool);
  $('#panel').innerHTML = `${tabs}<div class="cats">${TOOLS.map(([id, e, l]) => `<button class="chip ${id === build.tool ? 'on' : ''}" data-tool="${id}">${e} ${l}</button>`).join('')}</div>
    ${build.tool === 'pavimento' ? `<div class="swatches big">${Object.entries(FLOORS).map(([id, f]) => `<button class="sw ${build.floor === id ? 'on' : ''}" style="background:${f[1]}" data-floor="${id}" title="${f[0]}"></button>`).join('')}</div><small class="hint">${FLOORS[build.floor][0]} · ${FLOORS[build.floor][3]} € a casella</small>` : ''}
    ${build.tool === 'pittura' ? `<div class="swatches big">${WALL_COLORS.map(c => `<button class="sw ${build.paint === c ? 'on' : ''}" style="background:${c}" data-paint="${c}"></button>`).join('')}</div>` : ''}
    <p class="hint">${tool ? tool[3] + ' Con due dita sposti la vista.' : 'Scegli uno strumento. Con un dito (senza strumento) sposti la vista.'}</p>`;
}

/** Il punto della griglia (angolo tra caselle) più vicino al dito. */
const corner = (sx, sy) => { const [x, y] = v.tile(sx, sy); return [Math.round(x), Math.round(y)]; };
/** Il pezzo di muro più vicino al dito (entro un terzo di casella), o null. */
function wallAt(sx, sy) {
  const [x, y] = v.tile(sx, sy);
  const dv = Math.abs(x - Math.round(x)), dh = Math.abs(y - Math.round(y));
  const kv = wkey('v', Math.round(x), Math.floor(y)), kh = wkey('h', Math.floor(x), Math.round(y));
  const cand = [[dv, kv], [dh, kh]].filter(([d, k]) => d < 0.35 && walls()[k]).sort((a, b) => a[0] - b[0]);
  return cand[0]?.[1] ?? null;
}
/** Pezzi di muro tra due angoli (solo in linea retta, sulla direzione prevalente). */
function wallRun(a, b) {
  const out = [];
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (Math.abs(dx) >= Math.abs(dy)) {
    const [x0, x1] = dx >= 0 ? [a[0], b[0]] : [b[0], a[0]];
    for (let x = x0; x < x1; x++) out.push({ k: wkey('h', x, a[1]), r: [x, a[1] - 0.06, 1, 0.12] });
  } else {
    const [y0, y1] = dy >= 0 ? [a[1], b[1]] : [b[1], a[1]];
    for (let y = y0; y < y1; y++) out.push({ k: wkey('v', a[0], y), r: [a[0] - 0.06, y, 0.12, 1] });
  }
  for (const u of out) {
    const [t, p, q] = u.k.split(':').map((x, i) => (i ? +x : x));
    const inLot = t === 'v' ? p >= 0 && p <= g.W && q >= 0 && q < g.H : q >= 0 && q <= g.H && p >= 0 && p < g.W;
    const blockedByObj = g.objects.some(o => !TYPES[o.type].passable && crossesWall({ [u.k]: {} }, footprint(o)) && lvOf(o) === viewLv);
    u.ok = inLot && !blockedByObj && !walls()[u.k];
  }
  return out;
}

function buildDown(d, sx, sy) {
  if (build.placing) {   // trascina l'oggetto da comprare
    d.kind = 'ghost';
    const f = footprint(build.placing);
    const [tx, ty] = v.tile(sx, sy);
    d.grab = [tx - f.x, ty - f.y];
    return;
  }
  if (build.tab === 'compra') {
    const t = hit(sx, sy, false);
    if (t.obj) { d.kind = 'object'; d.obj = t.obj; }
    return;
  }
  if (build.tool === 'muro') { d.kind = 'wall'; d.start = corner(sx, sy); build.wallPreview = []; }
  else if (build.tool === 'pavimento') { d.kind = 'floor'; d.painted = new Set(); paintFloor(d, sx, sy); }
  else if (build.tool) d.kind = 'tool';
}
function buildMove(d, sx, sy) {
  if (d.kind === 'ghost') {
    const [tx, ty] = v.tile(sx, sy);
    build.placing.x = Math.round(tx - d.grab[0]);
    build.placing.y = Math.round(ty - d.grab[1]);
  } else if (d.kind === 'object') {   // inizia a spostare un mobile trascinandolo
    const o = d.obj;
    if (g.sims.some(s => s.cur?.obj === o.id)) { toast('Lo stanno usando: aspetta che finiscano.'); d.kind = 'none'; return; }
    build.placing = { type: o.type, x: o.x, y: o.y, rot: o.rot, color: o.color, moveId: o.id, lv: lvOf(o) };
    const f = footprint(build.placing);
    const [tx, ty] = v.tile(d.x, d.y);
    d.grab = [tx - f.x, ty - f.y];
    d.kind = 'ghost';
    d.autoDrop = true;
    buildPanel();
    buildMove(d, sx, sy);
  } else if (d.kind === 'wall') {
    build.wallPreview = wallRun(d.start, corner(sx, sy));
  } else if (d.kind === 'floor') paintFloor(d, sx, sy);
}
function buildUp(d, sx, sy) {
  if (d.kind === 'ghost' && d.autoDrop) {   // mobile spostato col dito: si lascia dove sta, se ci sta
    if (canPlace(g, build.placing, build.placing.moveId)) confirmPlace();
    else { toast('Lì non ci sta: è tornato al suo posto.'); build.placing = null; buildPanel(); }
    return;
  }
  if (d.kind === 'object' && !d.moved) return objectMenu(d.obj, sx, sy);
  if (d.kind === 'wall') {
    const run = build.wallPreview ?? [];
    build.wallPreview = null;
    let n = 0;
    for (const u of run) {
      if (!u.ok) continue;
      if (g.money < PRICES.muro) { toast('Soldi finiti: alcuni pezzi di muro non sono stati costruiti.'); break; }
      walls()[u.k] = { color: build.paint };
      g.money -= PRICES.muro;
      n++;
    }
    if (n) { toast(`Costruiti ${n} pezzi di muro (−${eur(n * PRICES.muro)})`); gameEvent(g, null, 'wall', notify); save(); }
    else if (run.length) toast('Lì non si può costruire (c\'è già un muro o un mobile in mezzo).');
    return;
  }
  if (d.kind === 'floor') { if (d.cost) { toast(`Pavimento posato: −${eur(d.cost)}`); save(); } return; }
  if (d.kind === 'tool' && !d.moved) wallTool(sx, sy);
}
function paintFloor(d, sx, sy) {
  const [x, y] = v.tile(sx, sy).map(Math.floor);
  if (x < 0 || y < 0 || x >= g.W || y >= g.H || d.painted.has(`${x},${y}`)) return;
  d.painted.add(`${x},${y}`);
  const floors = g.levels[viewLv].floors;
  const i = y * g.W + x;
  if (floors[i] === build.floor) return;
  // Sul primo piano si paga anche la struttura, in tavernetta lo scavo (solo la prima volta)
  const price = FLOORS[build.floor][3] + (floors[i] == null ? FLOOR_EXTRA[viewLv] : 0);
  if (g.money < price) return;
  floors[i] = build.floor;
  g.money -= price;
  d.cost = (d.cost ?? 0) + price;
}
const walls = () => g.levels[viewLv].walls;
function wallTool(sx, sy) {
  const k = wallAt(sx, sy);
  if (!k && build.tool === 'abbatti' && viewLv !== 0) {   // su tavernetta e primo piano si può togliere il pavimento
    const [x, y] = v.tile(sx, sy).map(Math.floor);
    const floors = g.levels[viewLv].floors;
    if (floorAt(g, viewLv, x, y) == null) return;
    if (g.objects.some(o => lvOf(o) === viewLv && (() => { const f = footprint(o); return x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.d; })())) return toast('Prima togli il mobile che c\'è sopra.');
    if (g.sims.some(s => s.lv === viewLv && Math.floor(s.x) === x && Math.floor(s.y) === y)) return toast('C\'è un Sim sopra.');
    floors[y * g.W + x] = null;
    save();
    return;
  }
  if (!k) return toast('Tocca proprio sul muro.');
  const wl = walls()[k];
  const [t, a, b] = k.split(':');
  if (build.tool === 'abbatti') {
    const outer = (t === 'h' && (+b === 0 || +b === g.H)) || (t === 'v' && (+a === 0 || +a === g.W));
    delete walls()[k];
    g.money += 5;
    if (outer) toast('Abbattuto (era sul bordo del lotto).');
  } else if (build.tool === 'porta') {
    if (wl.door) delete wl.door;
    else { if (g.money < PRICES.porta) return toast('Non avete abbastanza soldi.'); wl.door = true; delete wl.win; delete wl.garage; g.money -= PRICES.porta; }
  } else if (build.tool === 'saracinesca') {
    if (wl.garage) delete wl.garage;
    else { if (g.money < PRICES.saracinesca) return toast('Non avete abbastanza soldi.'); wl.garage = true; delete wl.win; delete wl.door; g.money -= PRICES.saracinesca; }
  } else if (build.tool === 'finestra') {
    if (wl.win) delete wl.win;
    else { if (g.money < PRICES.finestra) return toast('Non avete abbastanza soldi.'); wl.win = true; delete wl.door; g.money -= PRICES.finestra; }
  } else if (build.tool === 'pittura') {
    if (wl.color === build.paint) return;
    if (g.money < PRICES.pittura) return toast('Non avete abbastanza soldi.');
    wl.color = build.paint;
    g.money -= PRICES.pittura;
  }
  save();
  hud();
}

function objectMenu(o, sx, sy) {
  const T = TYPES[o.type];
  menu(sx, sy, `${ICONS[o.type] ?? ''} ${esc(T.name)}`, [
    { label: '↻ Ruota', run: () => { const r = { ...o, rot: (o.rot + 1) % 4 }; if (g.sims.some(s => s.cur?.obj === o.id)) return toast('Lo stanno usando.'); if (canPlace(g, r, o.id)) { o.rot = r.rot; save(); } else toast('Non c\'è spazio per ruotarlo così.'); } },
    ...(T.colors ? [{ label: '🎨 Cambia colore', run: () => { o.color = T.colors[(T.colors.indexOf(o.color) + 1) % T.colors.length]; save(); } }] : []),
    { label: `💰 Vendi (+${eur(T.price * 0.8)})`, run: () => sell(o) },
  ]);
}
function startPlacing(type) {
  const T = TYPES[type];
  if (g.money < T.price) return toast('Non avete abbastanza soldi.');
  const [tx, ty] = v.tile(w / 2, h * 0.4);
  build.placing = { type, x: Math.max(0, Math.floor(tx)), y: Math.max(0, Math.floor(ty)), rot: 0, color: T.colors?.[0], lv: viewLv };
  buildPanel();
}
function sell(o) {
  if (g.sims.some(s => s.cur?.obj === o.id)) return toast('Lo stanno usando: aspetta che finiscano.');
  g.objects = g.objects.filter(x => x !== o);
  for (const s of g.sims) s.queue = s.queue.filter(c => c.obj !== o.id);
  g.money += Math.round(TYPES[o.type].price * 0.8);
  toast(`Venduto: +${eur(TYPES[o.type].price * 0.8)}`);
  save();
}
function confirmPlace() {
  const p = build.placing;
  if (!canPlace(g, p, p.moveId)) return toast(TYPES[p.type].stairs && viewLv === 1 ? 'Dal primo piano non si sale più su.' : 'Qui non ci sta: trascinalo su un posto libero (riquadro verde).');
  if (TYPES[p.type].stairs) {   // la scala porta al piano sopra: lì serve un pezzo di pavimento libero dove si arriva
    const { bottom, top } = stairEnds(p);
    if (floorAt(g, bottom[2], bottom[0], bottom[1]) == null) return toast('Davanti alla scala (dove si sale) serve il pavimento.');
    const busy = g.objects.some(o => lvOf(o) === top[2] && o.id !== p.moveId && (() => { const f = footprint(o); return top[0] >= f.x && top[0] < f.x + f.w && top[1] >= f.y && top[1] < f.y + f.d; })());
    if (busy) return toast('Al piano di sopra, dove arriva la scala, c\'è un mobile.');
    const up = g.levels[top[2]].floors;
    if (up[top[1] * g.W + top[0]] == null) up[top[1] * g.W + top[0]] = 'legno';
  }
  if (p.moveId) {
    const o = g.objects.find(x => x.id === p.moveId);
    if (g.sims.some(s => s.cur?.obj === o.id)) return toast('Lo stanno usando: aspetta che finiscano.');
    Object.assign(o, { x: p.x, y: p.y, rot: p.rot, color: p.color });
  } else {
    g.objects.push({ id: Math.random().toString(36).slice(2, 9), type: p.type, x: p.x, y: p.y, rot: p.rot, color: p.color, users: [], lv: viewLv });
    g.money -= TYPES[p.type].price;
    toast(TYPES[p.type].stairs ? `Scala costruita: con ▲▼ vai al piano ${viewLv === -1 ? 'terra' : 'di sopra'}${viewLv === 0 ? ' e posa il pavimento con Costruisci' : ''}.` : `Comprato: ${TYPES[p.type].name}`);
    gameEvent(g, null, 'buy', notify);
    if (TYPES[p.type].stairs) gameEvent(g, null, 'stairs', notify);
  }
  build.placing = null;
  save();
  buildPanel();
}

// ---------------------------------------------------------------- lavoro
function jobsSheet(simId = sel) {
  const s = g.sims[simId];
  const job = s.job && CAREERS[s.job.career];
  const skillName = id => SKILLS.find(k => k[0] === id);
  sheet.innerHTML = `<div class="sheet-head"><h2>💼 Lavoro di ${esc(s.name)}</h2><button class="icon" data-close>✕</button></div>
    ${job ? `<div class="jobnow"><b>${job.emoji} ${esc(job.titles[s.job.level])}</b><small>${job.name} · ${job.start}:00-${job.end}:00 · ${job.days.map(d => ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'][d]).join(' ')}
      · ${job.pay[s.job.level]} € l'ora</small>
      <div class="bar"><i style="width:${Math.max(0, s.job.perf)}%"></i></div><small>Verso la promozione: vai al lavoro di buon umore${job.skill ? ` e allena ${skillName(job.skill)[1]} ${skillName(job.skill)[2].toLowerCase()} (${s.skills[job.skill].toFixed(1)})` : ''}.</small>
      <button class="secondary" data-quit>Licenziati</button></div>` : '<p class="note">Scegli un lavoro: mezz\'ora prima dell\'inizio il Sim esce di casa da solo e torna con lo stipendio.</p>'}
    <h3>Offerte</h3>
    ${Object.entries(CAREERS).map(([id, c]) => `<button class="row" data-job="${id}" data-sim="${s.id}"><span>${c.emoji}</span><span><b>${c.name}</b>
      <small>${c.start}:00-${c.end}:00 · ${c.days.length} giorni a settimana · da ${c.pay[0]} € l'ora${c.skill ? ` · conta ${skillName(c.skill)[1]} ${skillName(c.skill)[2].toLowerCase()}` : ''}</small></span></button>`).join('')}
    <h3>Abilità di ${esc(s.name)}</h3>
    ${SKILLS.map(([k, e, l]) => `<div class="need skillrow"><span>${e} ${l}</span><div class="bar"><i style="width:${(s.skills[k] ?? 0) * 10}%"></i></div><small>${(s.skills[k] ?? 0).toFixed(1)}</small></div>`).join('')}
    <p class="note">Si allenano con: cucinare e i libri di ricette (cucina), tapis roulant, pesi e piscina (fitness), computer e scacchi (logica), chitarra e pittura (creatività), specchio e chiacchiere (carisma).</p>`;
  if (!sheet.open) sheet.showModal();
}

// ---------------------------------------------------------------- obiettivi e desideri
function goalsSheet() {
  sheet.innerHTML = `<div class="sheet-head"><h2>🎯 Obiettivi</h2><button class="icon" data-close>✕</button></div>
    <p class="note">Una piccola guida per cominciare: ogni obiettivo completato vale soldi per arredare casa.</p>
    ${GOALS.map(gl => { const done = g.goals.done.includes(gl.key); return `<div class="row goal-row ${done ? 'done' : ''}"><span>${done ? '✅' : '⬜'}</span>
      <span><b>${esc(gl.text)}</b><small>${esc(gl.hint)}</small></span><em>+${gl.reward} €</em></div>`; }).join('')}
    <h3>⭐ Desideri di oggi</h3>
    <p class="note">Ognuno ha due desideri al giorno: esaudirli dà 80 € e buonumore. Domani ne arrivano di nuovi.</p>
    ${g.sims.map(s => `<p><b>${esc(s.name)}</b>: ${s.wishes?.length ? s.wishes.map(id => { const wi = WISHES.find(x => x.id === id); return `${wi.emoji} ${esc(wi.text)}`; }).join(' · ') : 'tutti esauditi! 🎉'}</p>`).join('')}`;
  if (!sheet.open) sheet.showModal();
}

// ---------------------------------------------------------------- impostazioni
function settingsSheet() {
  sheet.innerHTML = `<div class="sheet-head"><h2>⚙ Impostazioni</h2><button class="icon" data-close>✕</button></div>
    <label class="check"><input type="checkbox" id="auto" ${g.auto ? 'checked' : ''}> Libero arbitrio (se non dai ordini, i Sim pensano da soli ai bisogni)</label>
    <details class="box"><summary>Come si gioca</summary><p>Tocca un Sim in alto a sinistra per comandarlo. Tocca un oggetto per scegliere cosa fargli fare, il pavimento per farlo camminare, l'altro Sim per chiacchierare, abbracciarvi, baciarvi… Le azioni si mettono in fila (fino a 4): tocca un'icona in fila per annullarla.</p>
      <p>Tieni alti i bisogni (fame, energia, igiene, vescica, svago, socialità) e la casa bella e in ordine: l'umore (il rombo sopra la testa) decide come va al lavoro. Dopo mangiato portate via i piatti. Ogni lunedì arrivano le bollette.</p>
      <p>Arreda → Compra: scegli un oggetto e trascinalo; i mobili già in casa si spostano trascinandoli. Arreda → Costruisci: muri (trascina il dito), porte, finestre, pavimenti e colori.</p>
      <p>Un dito sposta la vista, due dita (o i pulsanti +/−) fanno lo zoom. ⏸ ▶ ▶▶ ▶▶▶ cambiano la velocità del tempo; quando l'app è chiusa il tempo si ferma.</p></details>
    <h3>Partita</h3>
    <button class="secondary wide" data-newgame>Ricomincia da capo</button>
    <p class="note">Versione ${esc(APP_VERSION)}${native ? ` · app Android ${esc(native.appVersion?.() ?? '')}` : ''}. La partita resta solo su questo telefono.</p>
    ${!native ? '<p class="note">Su iPhone: apri questa pagina in Safari, Condividi → "Aggiungi alla schermata Home".</p>' : ''}`;
  if (!sheet.open) sheet.showModal();
}

// ---------------------------------------------------------------- creazione della coppia
const SKINS = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524'];
const HAIRS = ['#111827', '#3f2a14', '#7c2d12', '#facc15', '#e5e7eb'];
const SHIRTS = ['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f59e0b', '#ec4899'];
let draft = null;
function createScreen() {
  draft ??= [
    { name: 'Io', gender: 'lui', look: { skin: SKINS[1], hair: HAIRS[1], long: false, shirt: SHIRTS[0], pants: '#1e3a8a' } },
    { name: 'Lei', gender: 'lei', look: { skin: SKINS[0], hair: HAIRS[2], long: true, shirt: SHIRTS[5], pants: '#334155' } },
  ];
  const sw = (i, key, list) => `<div class="swatches">${list.map(c => `<button class="sw ${draft[i].look[key] === c ? 'on' : ''}" style="background:${c}" data-sw="${i}|${key}|${c}" aria-label="colore"></button>`).join('')}</div>`;
  $('#create').innerHTML = `<h1>GA Life</h1><p>Create la vostra coppia: poi arredate casa, trovate un lavoro e prendetevi cura l'uno dell'altra.</p>
    ${draft.map((d, i) => `<section class="cs"><canvas class="prev" data-prev="${i}" width="120" height="150"></canvas><div class="cs-body">
      <input data-name="${i}" value="${esc(d.name)}" maxlength="14" placeholder="Nome">
      <div class="seg2"><button class="${d.gender === 'lui' ? 'on' : ''}" data-gender="${i}|lui">Lui</button><button class="${d.gender === 'lei' ? 'on' : ''}" data-gender="${i}|lei">Lei</button>
        <button class="${d.look.long ? 'on' : ''}" data-long="${i}">Capelli lunghi</button></div>
      <small>Pelle</small>${sw(i, 'skin', SKINS)}<small>Capelli</small>${sw(i, 'hair', HAIRS)}<small>Maglia</small>${sw(i, 'shirt', SHIRTS)}</div></section>`).join('')}
    <button class="primary" data-start>Iniziate!</button>`;
  for (const c of document.querySelectorAll('[data-prev]')) {
    const i = +c.dataset.prev, x = c.getContext('2d'), pv = makeView();
    pv.z = 1.6;
    x.clearRect(0, 0, 120, 150);
    drawSim(x, pv, 60, 140, draft[i].look, { face: 1, mood: 90, plumbob: true });
  }
}
function startView() {
  v.z = w < 500 ? 0.7 : 0.95;   // sul telefono un po' più da lontano: si vede quasi tutta la casa
  centerOn(10, 7.5);
}

// ---------------------------------------------------------------- comandi dei pulsanti
document.addEventListener('click', async e => {
  const t = e.target;
  const mi = t.closest('[data-mi]');
  if (mi) { const it = $('#menu')._items[+mi.dataset.mi]; closeMenu(); it.run(); hud(); if (build) buildPanel(); return; }
  if (t.closest('[data-close]')) { sheet.close(); return; }
  if (t.closest('[data-goals]')) return goalsSheet();
  if (t.closest('[data-mini]')) {
    mini = !mini;
    try { localStorage.setItem('mini', mini ? '1' : '0'); } catch { /* niente */ }
    hud();
    return;
  }
  const sp = t.closest('[data-speed]');
  if (sp) { g.speed = +sp.dataset.speed; hud(); return; }
  const se = t.closest('[data-sel]');
  if (se) {
    const id = +se.dataset.sel;
    if (sel === id && !g.sims[id].atWork) centerOn(g.sims[id].x, g.sims[id].y);
    sel = id;
    hud();
    return;
  }
  const cn = t.closest('[data-cancel]');
  if (cn) { cancel(g, g.sims[sel], +cn.dataset.cancel); hud(); return; }
  const lvb = t.closest('[data-lv]');
  if (lvb) { setLevel(viewLv + +lvb.dataset.lv); return; }
  if (t.closest('[data-zoom]')) { zoomAt(w / 2, h / 2, v.z * (t.closest('[data-zoom]').dataset.zoom === '+' ? 1.2 : 1 / 1.2)); return; }
  if (t.closest('[data-build]')) return build ? closeBuild() : openBuild();
  if (t.closest('[data-jobs]')) return jobsSheet();
  if (t.closest('[data-settings]')) return settingsSheet();
  const bt = t.closest('[data-btab]');
  if (bt) { build.tab = bt.dataset.btab; build.tool = null; build.placing = null; buildPanel(); return; }
  const tl = t.closest('[data-tool]');
  if (tl) { build.tool = build.tool === tl.dataset.tool ? null : tl.dataset.tool; buildPanel(); return; }
  const fl = t.closest('[data-floor]');
  if (fl) { build.floor = fl.dataset.floor; buildPanel(); return; }
  const pt = t.closest('[data-paint]');
  if (pt) { build.paint = pt.dataset.paint; buildPanel(); return; }
  const bc = t.closest('[data-bcat]');
  if (bc) { build.cat = bc.dataset.bcat; buildPanel(); return; }
  const buy = t.closest('[data-buy]');
  if (buy) return startPlacing(buy.dataset.buy);
  if (t.closest('[data-brot]')) { build.placing.rot = (build.placing.rot + 1) % 4; return; }
  if (t.closest('[data-bcolor]')) { const p = build.placing, cs = TYPES[p.type].colors; p.color = cs[(cs.indexOf(p.color) + 1) % cs.length]; return; }
  if (t.closest('[data-bok]')) return confirmPlace();
  if (t.closest('[data-bcancel]')) { build.placing = null; buildPanel(); return; }
  const job = t.closest('[data-job]');
  if (job) {
    const s = g.sims[+job.dataset.sim];
    s.job = { career: job.dataset.job, level: 0, perf: 0, days: 0 };
    const c = CAREERS[s.job.career];
    toast(`${s.name} è stat${oa(s)} assunt${oa(s)}: ${c.titles[0]}! Si comincia alle ${c.start}:00.`);
    gameEvent(g, s, 'job', notify);
    sheet.close();
    save();
    hud();
    return;
  }
  if (t.closest('[data-quit]')) { const s = g.sims[sel]; if (confirm(`${s.name} si licenzia?`)) { s.job = null; sheet.close(); save(); hud(); } return; }
  if (t.closest('[data-newgame]')) {
    if (!confirm('Ricominciare da capo? Casa, soldi e lavoro di questa partita si perdono.')) return;
    sheet.close();
    g = null;
    await setSetting('save', null);
    startCreate();
    return;
  }
  // Schermata di creazione
  const swb = t.closest('[data-sw]');
  if (swb) { const [i, k, c] = swb.dataset.sw.split('|'); draft[+i].look[k] = c; createScreen(); return; }
  const gb = t.closest('[data-gender]');
  if (gb) { const [i, gd] = gb.dataset.gender.split('|'); draft[+i].gender = gd; createScreen(); return; }
  const lb = t.closest('[data-long]');
  if (lb) { const d = draft[+lb.dataset.long]; d.look.long = !d.look.long; createScreen(); return; }
  if (t.closest('[data-start]')) {
    for (const el of document.querySelectorAll('[data-name]')) draft[+el.dataset.name].name = el.value.trim() || (el.dataset.name === '0' ? 'Io' : 'Lei');
    g = newGame(draft);
    $('#create').hidden = true;
    sel = 0;
    resize();
    startView();
    save();
    hud();
    toast('Benvenuti a casa! Tocca un oggetto per dare un ordine.');
  }
});
document.addEventListener('input', e => { const i = e.target.dataset.name; if (i != null) draft[+i].name = e.target.value; });
document.addEventListener('change', e => { if (e.target.id === 'auto') { g.auto = e.target.checked; save(); } });

// ---------------------------------------------------------------- salvataggio
function save() {
  if (!g) return;
  setSetting('save', JSON.parse(JSON.stringify(g, (k, val) => (k === 'objRef' ? undefined : val))));
}
function relink() {
  for (const s of g.sims) {
    if (s.cur?.obj) {
      s.cur.objRef = g.objects.find(o => o.id === s.cur.obj);
      if (s.cur.objRef) s.cur.objRef.users = [...(s.cur.objRef.users ?? []), { sim: s.id, seat: s.cur.seat }];
      else s.cur = null;
    }
  }
}
setInterval(save, 10000);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else checkWebUpdate(); });

async function checkWebUpdate() {
  if (APP_VERSION === 'dev' || sheet.open) return;
  try {
    const latest = (await (await fetch('version.txt', { cache: 'no-store' })).text()).trim();
    if (!latest || latest === APP_VERSION || sessionStorage.getItem('reloadedFor') === latest) return;
    sessionStorage.setItem('reloadedFor', latest);
    save();
    location.reload();
  } catch { /* offline */ }
}

window.appBack = () => {
  if (sheet.open) { sheet.close(); return true; }
  if (!$('#menu').hidden) { closeMenu(); return true; }
  if (build?.placing) { build.placing = null; buildPanel(); return true; }
  if (build) { closeBuild(); return true; }
  return false;
};

// ---------------------------------------------------------------- ciclo
let last = 0, hudT = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (t - (last || t)) / 1000);
  last = t;
  if (!g) return;
  if (!build && g.speed) tick(g, dt * SPEEDS[g.speed], notify);
  draw();
  hudT -= dt;
  if (hudT <= 0) { hudT = 0.25; hud(); }
}

function startCreate() {
  $('#create').hidden = false;
  createScreen();
}

// Avvio
addEventListener('resize', () => { resize(); });
resize();
const saved = await getSetting('save', null);
if (saved) {
  g = migrate(saved);
  relink();
  startView();
  hud();
} else startCreate();
if (location.hostname === 'localhost') window.__gl = { get g() { return g; }, tick, notify, v, hit, get build() { return build; } };   // solo per le prove in locale
requestAnimationFrame(frame);
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
checkWebUpdate();
