// GA Life: una piccola "The Sims" per due. La casa è isometrica; tocchi un oggetto per dare un ordine
// al Sim selezionato, tocchi il pavimento per farlo camminare, l'altro Sim per interagire.
// Tutto resta nel telefono (IndexedDB): la partita si salva da sola.
import { getSetting, setSetting } from './db.js';
import { APP_VERSION } from './version.js';
import { makeView, floorTile, wallY0, wallX0, windowY0, windowX0, drawSim, bubble, box } from './iso.js';
import { TYPES, CATS, NEEDS, SOCIAL, footprint } from './catalog.js';
import { newGame, tick, order, cancel, actionsFor, mood, canPlace, timeText, dayText, SPEEDS, CAREERS, oa,
  migrate, gameEvent, currentGoal, GOALS, WISHES } from './game.js';

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
let build = null;        // modalità Arreda: { cat, placing: { type, x, y, rot, color, moveId } }

const ICONS = { letto: '🛏️', lettoSingolo: '🛏️', frigo: '🧊', fornello: '🍳', lavello: '🚰', tavolo: '🍽️', doccia: '🚿', wc: '🚽', lavandino: '🪞',
  divano: '🛋️', poltrona: '💺', tv: '📺', computer: '💻', libreria: '📚', stereo: '🔊', tapis: '🏃', pianta: '🪴', lampada: '💡', tappeto: '🟥', quadro: '🖼️' };
const FLOORS = { legno: ['#c8925f', '#bd8655'], cucina: ['#f5f5f4', '#e7e5e4'], bagno: ['#bfdbfe', '#a5c8f5'], camera: ['#e9d5b7', '#e2cba9'] };

function toast(text) {
  const box = $('#toasts');
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
  if (/crollato|figuraccia|bassa/.test(text)) { if (native?.vibrate) native.vibrate('60'); else navigator.vibrate?.(60); }
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
  v.oy = h * 0.36 - (x + y) * v.TH / 2;   // un po' in alto: sotto c'è il pannello
}

function draw() {
  // Cielo: giorno, tramonto, notte secondo l'ora
  const hr = g.minute / 60;
  const night = hr < 6 || hr > 21 ? 1 : hr < 7 ? 7 - hr : hr > 19 ? (hr - 19) / 2 : 0;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, night > 0.5 ? '#1e1b4b' : '#7dd3fc');
  grad.addColorStop(1, night > 0.5 ? '#312e81' : '#bae6fd');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Prato intorno alla casa
  const m = 3;
  ctx.fillStyle = '#4ade80';
  ctx.beginPath();
  for (const [x, y] of [[-m, -m], [g.W + m, -m], [g.W + m, g.H + m], [-m, g.H + m]]) ctx.lineTo(...v.at(x, y));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d6d3d1';   // vialetto d'ingresso
  ctx.beginPath();
  for (const [x, y] of [[g.W - 1, g.H], [g.W, g.H], [g.W, g.H + m], [g.W - 1, g.H + m]]) ctx.lineTo(...v.at(x, y));
  ctx.closePath();
  ctx.fill();

  for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) {
    const f = FLOORS[g.floors[y * g.W + x]];
    floorTile(ctx, v, x, y, f[(x + y) % 2]);
  }
  floorTile(ctx, v, g.W - 1, g.H - 1, '#78350f');   // zerbino all'ingresso
  // Muri di fondo con finestre
  wallY0(ctx, v, 0, g.W, 92, '#ede9fe');
  wallX0(ctx, v, 0, g.H, 92, '#ede9fe');
  windowY0(ctx, v, 7, 1.4, 34, 70);
  windowY0(ctx, v, 9.6, 1.4, 34, 70);
  windowX0(ctx, v, 4, 1.4, 34, 70);
  windowX0(ctx, v, 7.5, 1.4, 34, 70);

  // Oggetti piatti, poi oggetti e Sim in ordine di profondità
  const items = [];
  for (const o of g.objects) {
    const f = footprint(o);
    if (TYPES[o.type].flat) { TYPES[o.type].draw(ctx, v, o); continue; }
    items.push({ depth: f.x + f.w + f.y + f.d - 0.01, o });
  }
  for (const s of g.sims) if (!s.atWork) items.push({ depth: s.x + s.y + (s.pose === 'lie' ? 1.2 : s.pose === 'sit' ? 0.4 : 0.05), s });
  // Muri interni: bassi (vista "tagliata" come in The Sims), un pezzo per casella
  for (const wl of g.walls ?? []) {
    if (wl.v != null) for (let y = wl.y0; y < wl.y1; y++) items.push({ depth: wl.v + y + 0.98, wall: [wl.v - 0.06, y, 0.12, 1] });
    else for (let x = wl.x0; x < wl.x1; x++) items.push({ depth: x + wl.h + 0.98, wall: [x, wl.h - 0.06, 1, 0.12] });
  }
  if (build?.placing) {
    const p = build.placing;
    const f = footprint(p);
    items.push({ depth: f.x + f.w + f.y + f.d, ghost: p });
  }
  items.sort((a, b) => a.depth - b.depth);
  for (const it of items) {
    if (it.o) {
      if (build?.placing?.moveId === it.o.id) continue;
      TYPES[it.o.type].draw(ctx, v, it.o);
    } else if (it.ghost) drawGhost(it.ghost);
    else if (it.wall) box(ctx, v, ...it.wall, 34, '#ddd6fe', { top: '#7c3aed' });
    else drawOneSim(it.s);
  }
  for (const s of g.sims) if (!s.atWork) { drawName(s); drawBubble(s); }
  // Velo della notte
  if (night > 0) {
    ctx.fillStyle = `rgba(30,27,75,${0.32 * Math.min(1, night)})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawOneSim(s) {
  const [sx, sy] = v.at(s.x, s.y, s.pose === 'lie' ? 20 : s.pose === 'sit' ? 6 : 0);
  if (s.id === sel && !build) {
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(sx, sy, 15 * v.z, 7 * v.z, 0, 0, Math.PI * 2); ctx.stroke();
  }
  const moving = s.cur?.state === 'walk' || s.cur?.dance || s.cur?.run;
  drawSim(ctx, v, sx, sy, s.look, {
    face: s.face, walk: moving ? s.walk : 0, pose: s.pose === 'lie' ? 'sleep' : s.pose, back: s.back,
    mood: mood(s), plumbob: s.id === sel && !build && s.pose !== 'lie',
  });
  if (s.cur?.inside && s.cur.state === 'do' && s.cur.id === 'doccia') {   // vapore della doccia
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    for (let i = 0; i < 4; i++) { const t = performance.now() / 600 + i; ctx.beginPath(); ctx.arc(sx + Math.sin(t) * 10 * v.z, sy - 40 * v.z - (t % 1) * 30 * v.z, 6 * v.z, 0, Math.PI * 2); ctx.fill(); }
  }
}

/** Nome sotto i piedi, così si capisce sempre chi è chi (verde quello che comandi). */
function drawName(s) {
  const [sx, sy] = v.at(s.x, s.y, s.pose === 'lie' ? 20 : s.pose === 'sit' ? 6 : 0);
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
  const [sx, sy] = v.at(s.x, s.y, s.pose === 'lie' ? 20 : s.pose === 'sit' ? 6 : 0);
  const low = NEEDS.find(([k]) => s.needs[k] < 15);
  if (s.cur && s.cur.id !== 'go') bubble(ctx, v, sx, sy, s.cur.id === 'dormi' ? 'Zz' : s.cur.emoji);
  else if (low) bubble(ctx, v, sx, sy, low[1], true);
}

function drawGhost(p) {
  const ok = canPlace(g, p, p.moveId);
  ctx.globalAlpha = 0.75;
  TYPES[p.type].draw(ctx, v, p);
  ctx.globalAlpha = 1;
  const f = footprint(p);
  ctx.fillStyle = ok ? 'rgba(34,197,94,.35)' : 'rgba(239,68,68,.4)';
  ctx.beginPath();
  for (const [x, y] of [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.d], [f.x, f.y + f.d]]) ctx.lineTo(...v.at(x, y));
  ctx.closePath();
  ctx.fill();
}

// ---------------------------------------------------------------- pannelli (HUD)
function hud() {
  $('#clock').innerHTML = `<b>${timeText(g)}</b><small>${esc(dayText(g))}</small>`;
  $('#money').textContent = eur(g.money);
  $('#money').classList.toggle('neg', g.money < 0);
  for (const b of document.querySelectorAll('[data-speed]')) b.classList.toggle('on', +b.dataset.speed === g.speed && !build);
  $('#portraits').innerHTML = g.sims.map(s => `<button class="portrait ${s.id === sel ? 'on' : ''}" data-sel="${s.id}" style="--mood:hsl(${Math.round(mood(s) * 1.2)},75%,48%)">
      <span class="face" style="background:${s.look.skin};border-color:${s.look.hair}">${esc(s.name[0] ?? '?')}</span><small>${esc(s.name)}</small>${s.atWork ? '<i>💼</i>' : ''}</button>`).join('');
  $('#bottom').classList.toggle('mini', mini && !build);
  if (build) { $('#goal').hidden = true; return; }
  const s = g.sims[sel];
  const job = s.job && CAREERS[s.job.career];
  const q = [s.cur, ...s.queue.map(c => ({ ...c, emoji: c.kind === 'social' ? SOCIAL.find(a => a.id === c.action)?.emoji : c.kind === 'go' ? '👣' : TYPES[g.objects.find(o => o.id === c.obj)?.type]?.actions ? (actionEmoji(c)) : '•' }))].filter(Boolean);
  const doing = s.atWork ? `💼 Al lavoro fino alle ${job.end}:00` : s.cur ? `${s.cur.emoji ?? ''} ${s.cur.state === 'walk' && s.cur.id !== 'go' ? 'Sta andando a: ' : ''}${s.cur.label}` : 'Libero: tocca un oggetto o il pavimento';
  const goal = currentGoal(g);
  $('#goal').hidden = !goal;
  if (goal) $('#goal').innerHTML = `<span>🎯</span><span><b>${esc(goal.text)}</b><small>${esc(goal.hint)}</small></span><em>+${goal.reward} €</em>`;
  $('#panel').innerHTML = `<div class="who" data-mini><b>${esc(s.name)}</b><span>${moodText(mood(s))}</span><i class="fold">${mini ? '▲' : '▼'}</i>
      <small>${job ? `${job.emoji} ${esc(job.titles[s.job.level])} · ${job.start}-${job.end}` : 'Disoccupat' + oa(s) + ': trova lavoro con 💼'}</small></div>
    <div class="doing">${esc(doing)}</div>
    <div class="queue">${q.length ? q.map((c, i) => `<button class="qi ${i === 0 && s.cur ? 'now' : ''}" data-cancel="${i}" title="Tocca per annullare">${c.emoji ?? '•'}</button>`).join('') + '<small>tocca un\'icona per annullarla</small>' : ''}</div>
    ${s.wishes?.length ? `<div class="wishes">⭐ ${s.wishes.map(id => { const wi = WISHES.find(x => x.id === id); return `<span>${wi.emoji} ${esc(wi.text)}</span>`; }).join('')}</div>` : ''}
    <div class="needs">${NEEDS.map(([k, e, l]) => `<div class="need" title="${l}"><span>${e}</span><div class="bar"><i style="width:${s.needs[k]}%;background:hsl(${Math.round(s.needs[k] * 1.2)},70%,45%)"></i></div></div>`).join('')}</div>
    <div class="rel"><span>❤️ ${esc(g.sims[0].name)} e ${esc(g.sims[1].name)}</span><div class="bar"><i style="width:${g.rel}%"></i></div></div>`;
}
function actionEmoji(c) {
  const o = g.objects.find(x => x.id === c.obj);
  const a = o && actionsFor(g, g.sims[sel], o).find(x => x.id === c.action);
  return a?.emoji ?? (c.action === 'mangia' ? '🍝' : '•');
}
const moodText = m => (m >= 80 ? '😄 Felicissimo' : m >= 60 ? '🙂 Di buon umore' : m >= 40 ? '😐 Così così' : m >= 20 ? '😟 Giù di morale' : '😫 Molto infelice');

// ---------------------------------------------------------------- tocchi: vista, selezione, ordini
const pointers = new Map();
let drag = null, pinch = null;

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  closeMenu();
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: v.z };
    drag = null;
  } else drag = { x: e.clientX, y: e.clientY, ox: v.ox, oy: v.oy, moved: false };
});
canvas.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d);
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 8) drag.moved = true;
  if (drag.moved) { v.ox = drag.ox + dx; v.oy = drag.oy + dy; }
});
const up = e => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (drag && !drag.moved && e.type === 'pointerup') tap(e.clientX, e.clientY);
  drag = null;
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, v.z * (e.deltaY < 0 ? 1.1 : 0.9)); }, { passive: false });

function zoomAt(sx, sy, z) {
  z = Math.max(0.55, Math.min(2, z));
  const [tx, ty] = v.tile(sx, sy);
  v.z = z;
  const [nx, ny] = v.at(tx, ty);
  v.ox += sx - nx; v.oy += sy - ny;
}

/** Cosa c'è sotto il dito: un Sim, un oggetto o una casella del pavimento. */
function hit(sx, sy) {
  for (const s of [...g.sims].sort((a, b) => (b.x + b.y) - (a.x + a.y))) {
    if (s.atWork) continue;
    const [px, py] = v.at(s.x, s.y);
    if (Math.abs(sx - px) < 16 * v.z && sy < py + 6 * v.z && sy > py - 62 * v.z) return { sim: s };
  }
  let best = null;
  for (const o of g.objects) {
    const f = footprint(o);
    const pts = [[f.x, f.y], [f.x + f.w, f.y], [f.x + f.w, f.y + f.d], [f.x, f.y + f.d]].flatMap(([x, y]) => [v.at(x, y), v.at(x, y, TYPES[o.type].flat ? 0 : 50)]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    if (sx < Math.min(...xs) || sx > Math.max(...xs) || sy < Math.min(...ys) || sy > Math.max(...ys)) continue;
    const depth = f.x + f.w + f.y + f.d - (TYPES[o.type].flat ? 100 : 0);
    if (!best || depth > best.depth) best = { obj: o, depth };
  }
  if (best) return best;
  const [tx, ty] = v.tile(sx, sy);
  if (tx >= 0 && ty >= 0 && tx < g.W && ty < g.H) return { tile: [Math.floor(tx), Math.floor(ty)] };
  return {};
}

function tap(sx, sy) {
  if (build) return buildTap(sx, sy);
  const t = hit(sx, sy);
  const s = g.sims[sel];
  if (t.sim) {
    if (t.sim.id === sel) return;
    const rel = g.rel;
    menu(sx, sy, `${esc(t.sim.name)}`, [
      { label: `👆 Controlla ${t.sim.name}`, run: () => { sel = t.sim.id; hud(); } },
      ...SOCIAL.map(a => ({ label: `${a.emoji} ${a.label}`, dim: rel < a.min, run: () => say(order(g, s, { kind: 'social', action: a.id })) })),
    ]);
    return;
  }
  if (t.obj) {
    const T = TYPES[t.obj.type];
    const acts = actionsFor(g, s, t.obj);
    if (!acts.length) return toast(`${T.name}: è solo decorativo.`);
    menu(sx, sy, `${ICONS[t.obj.type] ?? ''} ${esc(T.name)}`, acts.map(a => ({ label: `${a.emoji} ${a.label}`, run: () => say(order(g, s, { kind: 'obj', obj: t.obj.id, action: a.id })) })));
    return;
  }
  if (t.tile) say(order(g, s, { kind: 'go', x: t.tile[0], y: t.tile[1] }));
}
const say = msg => { if (msg) toast(msg); hud(); };

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

// ---------------------------------------------------------------- Arreda: compra, sposta, ruota, vendi
function openBuild() {
  closeMenu();
  build = { cat: build?.cat ?? CATS[0], placing: null };
  document.body.classList.add('building');
  buildPanel();
}
function closeBuild() {
  build = null;
  document.body.classList.remove('building');
  hud();
}
function buildPanel() {
  const p = build.placing;
  $('#panel').innerHTML = p ? `<div class="placing"><b>${ICONS[p.type] ?? ''} ${esc(TYPES[p.type].name)}</b>
      <small>${p.moveId ? 'Tocca dove spostarlo' : `${eur(TYPES[p.type].price)} · tocca dove metterlo`}</small>
      <div class="row-buttons"><button class="secondary" data-brot>↻ Ruota</button>${TYPES[p.type].colors ? '<button class="secondary" data-bcolor>🎨 Colore</button>' : ''}
        <button class="primary" data-bok>${p.moveId ? 'Sposta qui' : 'Compra qui'}</button><button class="secondary" data-bcancel>Annulla</button></div></div>`
    : `<div class="cats">${CATS.map(c => `<button class="chip ${c === build.cat ? 'on' : ''}" data-bcat="${c}">${c}</button>`).join('')}</div>
      <div class="shop">${Object.entries(TYPES).filter(([, T]) => T.cat === build.cat).map(([id, T]) => `<button class="item ${g.money < T.price ? 'dim' : ''}" data-buy="${id}">
        <span>${ICONS[id] ?? '📦'}</span><b>${esc(T.name)}</b><small>${eur(T.price)}</small></button>`).join('')}</div>
      <p class="hint">Tocca un oggetto in casa per spostarlo, ruotarlo o venderlo.</p>`;
}
function buildTap(sx, sy) {
  const p = build.placing;
  if (p) {
    const [tx, ty] = v.tile(sx, sy);
    const f = footprint({ ...p, x: 0, y: 0 });
    p.x = Math.floor(tx - f.w / 2 + 0.5);
    p.y = Math.floor(ty - f.d / 2 + 0.5);
    return;
  }
  const t = hit(sx, sy);
  if (!t.obj) return;
  const o = t.obj, T = TYPES[o.type];
  menu(sx, sy, `${ICONS[o.type] ?? ''} ${esc(T.name)}`, [
    { label: '✋ Sposta', run: () => startPlacing(o.type, o) },
    { label: '↻ Ruota', run: () => { const r = { ...o, rot: (o.rot + 1) % 4 }; if (canPlace(g, r, o.id)) { o.rot = r.rot; save(); } else toast('Non c\'è spazio per ruotarlo così.'); } },
    ...(T.colors ? [{ label: '🎨 Cambia colore', run: () => { o.color = T.colors[(T.colors.indexOf(o.color) + 1) % T.colors.length]; save(); } }] : []),
    { label: `💰 Vendi (+${eur(T.price * 0.8)})`, run: () => sell(o) },
  ]);
}
function startPlacing(type, existing = null) {
  const T = TYPES[type];
  if (!existing && g.money < T.price) return toast('Non avete abbastanza soldi.');
  const [tx, ty] = v.tile(w / 2, h * 0.45);
  build.placing = existing
    ? { type, x: existing.x, y: existing.y, rot: existing.rot, color: existing.color, moveId: existing.id }
    : { type, x: Math.max(0, Math.floor(tx)), y: Math.max(0, Math.floor(ty)), rot: 0, color: T.colors?.[0] };
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
  if (!canPlace(g, p, p.moveId)) return toast('Qui non ci sta: scegli un posto libero (riquadro verde).');
  if (p.moveId) {
    const o = g.objects.find(x => x.id === p.moveId);
    if (g.sims.some(s => s.cur?.obj === o.id)) return toast('Lo stanno usando: aspetta che finiscano.');
    Object.assign(o, { x: p.x, y: p.y, rot: p.rot, color: p.color });
  } else {
    g.objects.push({ id: Math.random().toString(36).slice(2, 9), type: p.type, x: p.x, y: p.y, rot: p.rot, color: p.color });
    g.money -= TYPES[p.type].price;
    toast(`Comprato: ${TYPES[p.type].name}`);
    gameEvent(g, null, 'buy', notify);
  }
  build.placing = null;
  save();
  buildPanel();
}

// ---------------------------------------------------------------- lavoro
function jobsSheet(simId = sel) {
  const s = g.sims[simId];
  const job = s.job && CAREERS[s.job.career];
  sheet.innerHTML = `<div class="sheet-head"><h2>💼 Lavoro di ${esc(s.name)}</h2><button class="icon" data-close>✕</button></div>
    ${job ? `<div class="jobnow"><b>${job.emoji} ${esc(job.titles[s.job.level])}</b><small>${job.name} · ${job.start}:00-${job.end}:00 · ${job.days.map(d => ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'][d]).join(' ')}
      · ${job.pay[s.job.level]} € l'ora</small>
      <div class="bar"><i style="width:${Math.max(0, s.job.perf)}%"></i></div><small>Verso la promozione: vai al lavoro di buon umore${job.skill ? ` e allena l'abilità (${job.skill === 'cucina' ? 'cucina' : 'fitness'} ${s.skills[job.skill].toFixed(1)})` : ''}.</small>
      <button class="secondary" data-quit>Licenziati</button></div>` : '<p class="note">Scegli un lavoro: mezz\'ora prima dell\'inizio il Sim esce di casa da solo e torna con lo stipendio.</p>'}
    <h3>Offerte</h3>
    ${Object.entries(CAREERS).map(([id, c]) => `<button class="row" data-job="${id}" data-sim="${s.id}"><span>${c.emoji}</span><span><b>${c.name}</b>
      <small>${c.start}:00-${c.end}:00 · ${c.days.length} giorni a settimana · da ${c.pay[0]} € l'ora${c.skill ? ` · conta l'abilità ${c.skill}` : ''}</small></span></button>`).join('')}
    <p class="note">Abilità: 🍳 cucina ${s.skills.cucina.toFixed(1)} · 🏃 fitness ${s.skills.fitness.toFixed(1)} (su 10)</p>`;
  if (!sheet.open) sheet.showModal();
}

// ---------------------------------------------------------------- obiettivi e desideri
function goalsSheet() {
  sheet.innerHTML = `<div class="sheet-head"><h2>🎯 Obiettivi</h2><button class="icon" data-close>✕</button></div>
    <p class="note">Una piccola guida per cominciare: ogni obiettivo completato vale soldi per arredare casa.</p>
    ${GOALS.map(gl => { const done = g.goals.done.includes(gl.key); return `<div class="row goal-row ${done ? 'done' : ''}"><span>${done ? '✅' : '⬜'}</span>
      <span><b>${esc(gl.text)}</b><small>${esc(gl.hint)}</small></span><em>+${gl.reward} €</em></div>`; }).join('')}
    <h3>⭐ Desideri di oggi</h3>
    <p class="note">Ognuno ha due desideri al giorno: esaudirli dà ${80} € e buonumore. Domani ne arrivano di nuovi.</p>
    ${g.sims.map(s => `<p><b>${esc(s.name)}</b>: ${s.wishes?.length ? s.wishes.map(id => { const wi = WISHES.find(x => x.id === id); return `${wi.emoji} ${esc(wi.text)}`; }).join(' · ') : 'tutti esauditi! 🎉'}</p>`).join('')}`;
  if (!sheet.open) sheet.showModal();
}

// ---------------------------------------------------------------- impostazioni
function settingsSheet() {
  sheet.innerHTML = `<div class="sheet-head"><h2>⚙ Impostazioni</h2><button class="icon" data-close>✕</button></div>
    <label class="check"><input type="checkbox" id="auto" ${g.auto ? 'checked' : ''}> Libero arbitrio (se non dai ordini, i Sim pensano da soli ai bisogni)</label>
    <details class="box"><summary>Come si gioca</summary><p>Tocca un Sim in alto a sinistra per comandarlo. Tocca un oggetto per scegliere cosa fargli fare, il pavimento per farlo camminare, l'altro Sim per chiacchierare, abbracciarvi, baciarvi… Le azioni si mettono in fila (fino a 4): tocca un'icona in fila per annullarla.</p>
      <p>Tieni alti i bisogni (fame, energia, igiene, vescica, svago, socialità): l'umore (il rombo sopra la testa) decide come va al lavoro. Con il lavoro guadagnate soldi da spendere in Arreda. Ogni lunedì arrivano le bollette.</p>
      <p>Trascina con un dito per spostare la vista, due dita (o i pulsanti +/−) per lo zoom. ⏸ ▶ ▶▶ ▶▶▶ cambiano la velocità del tempo; quando l'app è chiusa il tempo si ferma.</p></details>
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

// ---------------------------------------------------------------- comandi dei pulsanti
document.addEventListener('click', async e => {
  const t = e.target;
  const mi = t.closest('[data-mi]');
  if (mi) { const it = $('#menu')._items[+mi.dataset.mi]; closeMenu(); it.run(); hud(); return; }
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
  if (cn) { cancel(g.sims[sel], +cn.dataset.cancel); hud(); return; }
  if (t.closest('[data-zoom]')) { zoomAt(w / 2, h / 2, v.z * (t.closest('[data-zoom]').dataset.zoom === '+' ? 1.2 : 1 / 1.2)); return; }
  if (t.closest('[data-build]')) return build ? closeBuild() : openBuild();
  if (t.closest('[data-jobs]')) return jobsSheet();
  if (t.closest('[data-settings]')) return settingsSheet();
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
    v.z = w < 500 ? 0.8 : 1;   // sul telefono un po' più da lontano, per vedere quasi tutta la casa
    centerOn(g.W / 2, g.H / 2);
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
  for (const s of g.sims) if (s.cur?.obj) s.cur.objRef = g.objects.find(o => o.id === s.cur.obj);
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
  v.z = w < 500 ? 0.8 : 1;   // sul telefono un po' più da lontano, per vedere quasi tutta la casa
  centerOn(g.W / 2, g.H / 2);
  hud();
} else startCreate();
if (location.hostname === 'localhost') window.__gl = { get g() { return g; }, tick, notify };   // solo per le prove in locale
requestAnimationFrame(frame);
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
checkWebUpdate();
