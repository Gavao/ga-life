// GA Life: una piccola "The Sims" per due, in 3D. Lotto con casa e giardino; tocchi un oggetto per dare un
// ordine al Sim selezionato, il pavimento per farlo camminare, l'altro Sim per interagire. In Arreda si compra
// (trascinando i mobili) e si costruisce (muri, porte, finestre, pavimenti, colori).
// Tutto resta nel telefono (IndexedDB): la partita si salva da sola.
import { getSetting, setSetting } from './db.js';
import { APP_VERSION } from './version.js';
import { createWorld, loadModels, portrait, CHAR_MODELS } from './world3d.js';
import { TYPES, CATS, NEEDS, SKILLS, SOCIAL, ACTIONS, footprint } from './catalog.js';
import { newGame, tick, order, cancel, actionsFor, mood, moodlets, ambiente, canPlace, crossesWall, timeText, dayText, SPEEDS, CAREERS, oa,
  migrate, gameEvent, currentGoal, GOALS, WISHES, wkey, exitTile, floorAt, stairEnds, LEVELS, relOf, inFamily } from './game.js';
import { PLACES, isOpen, travel, invite, travelCost, hours } from './town.js';
import { STAGES, startWedding, WEDDING_COST, adopt, PETS, PET_ACTIONS, WEATHER, orderCake, birthdays, nextLabel } from './family.js';

const $ = sel => document.querySelector(sel);
const canvas = $('#canvas');
const sheet = $('#sheet');
const native = window.Android;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = n => `${Math.round(n).toLocaleString('it-IT')} €`;

let g = null;            // la partita
let sel = 0;             // Sim selezionato
let w = 0, h = 0;
let world = null;        // la scena 3D (world3d.js)
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
  if (text.startsWith('__baby__')) return nameBaby(text.slice(8));
  if (text.startsWith('__jobs__')) return jobsSheet(+text.slice(8));
  toast(text);
  if (/crollat|figuraccia|in tempo/.test(text)) { if (native?.vibrate) native.vibrate('60'); else navigator.vibrate?.(60); }
}

// ---------------------------------------------------------------- disegno (in 3D: world3d.js)
function resize() {
  w = canvas.clientWidth; h = canvas.clientHeight;
  world.resize();
}
function centerOn(x, y, lv = viewLv) { world.centerOn(x, y, lv); }

/** Etichette sopra la scena: nomi sotto i piedi, fumetti sopra la testa, guasti e corrente staccata. */
const labelBox = $('#labels');
const labelPool = new Map();
function label(key, html, pos, cls) {
  let el = labelPool.get(key);
  if (!el) { el = document.createElement('div'); labelPool.set(key, el); labelBox.append(el); }
  if (el._html !== html) { el.innerHTML = html; el._html = html; }
  if (el.className !== cls) el.className = cls;
  el.style.transform = `translate(${Math.round(pos[0])}px, ${Math.round(pos[1])}px)`;
  el._seen = true;
}
function drawLabels() {
  for (const el of labelPool.values()) el._seen = false;
  if (!build) {
    for (const s of g.sims) {
      if (s.atWork || s.lv !== viewLv) continue;
      const a = world.simAnchor(s);
      if (!a?.feet) continue;
      label('n' + s.id, s.npc ? `${esc(s.name)} ${friendText(relOf(g, g.sims[sel], s)).split(' ')[0]}` : esc(s.name), a.feet, `lbl name${s.id === sel ? ' on' : s.npc ? ' npc' : ''}`);
      const low = NEEDS.find(([k]) => s.needs[k] < 15);
      const b = s.cur && s.cur.id !== 'go' ? (s.cur.id === 'dormi' ? '💤' : s.cur.emoji) : low ? low[1] : null;
      if (b && a.head) label('b' + s.id, b, a.head, `lbl bubble${!s.cur && low ? ' alert' : ''}`);
    }
  }
  for (const o of g.objects) {
    if (lvOf(o) !== viewLv) continue;
    if (o.baby) {   // il neonato: nome e, se piange, cosa vuole
      const p = world.objAnchor(o, 1.0);
      const [k, v] = Object.entries(o.baby.needs).sort((a, b) => a[1] - b[1])[0];
      if (p) label('bn' + o.id, `👶 ${esc(o.baby.name)}`, p, 'lbl name npc');
      const q = world.objAnchor(o, 1.4);
      if (q && v < 30) label('bb' + o.id, { fame: '🍼', igiene: '🧷', socialita: '😭', energia: '😴' }[k], q, 'lbl bubble alert');
    }
    const icon = o.fire ? null : o.broken ? '💥' : TYPES[o.type].elec && !g.power ? '🔌' : null;
    if (!icon) continue;
    const p = world.objAnchor(o, 1.7);
    if (p) label('o' + o.id, icon, p, 'lbl bubble alert');
  }
  if (!g.town.at) for (const p of g.pets) {
    if (p.lv !== viewLv) continue;
    const a = world.petAnchor(p);
    if (!a?.feet) continue;
    label('p' + p.id, `${PETS[p.kind].emoji} ${esc(p.name)}`, a.feet, 'lbl name npc');
    const b = p.state === 'sleep' ? '💤' : p.needs.fame < 25 ? '🦴' : p.needs.svago < 20 ? '🎾' : p.state === 'play' ? '💕' : null;
    if (b && a.head) label('pb' + p.id, b, a.head, `lbl bubble${p.needs.fame < 25 ? ' alert' : ''}`);
  }
  for (const [k, el] of labelPool) if (!el._seen) { el.remove(); labelPool.delete(k); }
}

// ---------------------------------------------------------------- pannelli (HUD)
let portraitsHtml = '';
function hud() {
  $('#clock').innerHTML = `<b>${timeText(g)} ${WEATHER[g.weather?.kind ?? 'sole'][0]}</b><small>${g.town.at ? `${PLACES[g.town.at].emoji} ${PLACES[g.town.at].name}` : esc(dayText(g))}</small>`;
  if (g.town.at && !isOpen(g.town.at, g.minute)) { notify(`🔒 ${PLACES[g.town.at].name} chiude: si torna a casa.`); goTravel('casa'); return; }
  $('#money').textContent = eur(g.money);
  $('#money').classList.toggle('neg', g.money < 0);
  for (const b of document.querySelectorAll('[data-speed]')) b.classList.toggle('on', +b.dataset.speed === g.speed && !build);
  const ph = g.sims.filter(s => !s.npc).map(s => `<button class="portrait ${s.id === sel ? 'on' : ''}" data-sel="${s.id}" style="--mood:hsl(${Math.round(mood(s, g) * 1.2)},75%,48%)">
      <span class="face"><img src="${portrait(modelOf(s))}" alt=""></span><small>${esc(s.name)}</small>${s.atWork ? '<i>💼</i>' : s.lv !== viewLv ? `<b>${s.lv > viewLv ? '⬆️' : '⬇️'}</b>` : ''}</button>`).join('');
  if (ph !== portraitsHtml) { portraitsHtml = ph; $('#portraits').innerHTML = ph; }
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
    <div class="rel"><span>❤️ ${esc(g.sims[0].name)} e ${esc(g.sims[1].name)} · ${STAGES[g.couple.stage]}${g.pregnancy ? ' · 🤰 in attesa' : ''}</span><div class="bar"><i style="width:${g.rel}%"></i></div></div>`;
}
function queueEmoji(c) {
  if (c.kind === 'pet') return PET_ACTIONS[c.action]?.emoji;
  if (c.kind === 'social') return SOCIAL.find(a => a.id === c.action)?.emoji;
  if (c.kind === 'go') return '👣';
  if (c.kind === 'dish') return '🍽️';
  return ACTIONS[c.action]?.emoji ?? (c.action === 'siediTavolo' ? '🪑' : '•');
}
const moodText = m => (m >= 80 ? '😄 Felicissimo' : m >= 60 ? '🙂 Di buon umore' : m >= 40 ? '😐 Così così' : m >= 20 ? '😟 Giù di morale' : '😫 Molto infelice');
const ambText = a => (a >= 10 ? 'casa bellissima' : a >= 5 ? 'casa accogliente' : a >= 0 ? 'casa normale' : 'disordine');

// ---------------------------------------------------------------- tocchi: vista, selezione, ordini, costruzione
// Un dito sposta la vista (o costruisce), due dita: zoom, rotazione e spostamento. Sul computer: rotellina e tasto destro.
const pointers = new Map();
let drag = null, pinch = null;

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  try { canvas.setPointerCapture?.(e.pointerId); } catch { /* niente */ }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  closeMenu();
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), my: (a.y + b.y) / 2, pan: world.panStart((a.x + b.x) / 2, (a.y + b.y) / 2) };
    if (drag?.kind === 'wall') build.wallPreview = null;
    drag = null;
    return;
  }
  drag = { x: e.clientX, y: e.clientY, moved: false, kind: e.button === 2 ? 'orbit' : 'pan', pan: world.panStart(e.clientX, e.clientY) };
  if (build && drag.kind === 'pan') buildDown(drag, e.clientX, e.clientY);
});
canvas.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && pointers.size === 2) {   // due dita: zoom, rotazione, inclinazione e spostamento
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x), my = (a.y + b.y) / 2;
    world.zoom(d / pinch.d);
    let da = ang - pinch.ang;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    world.rotate(-da);
    if (Math.abs(d - pinch.d) < 6) world.tilt((my - pinch.my) * 0.004);
    world.panMove(pinch.pan, (a.x + b.x) / 2, my);
    Object.assign(pinch, { d, ang, my });
    return;
  }
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.hypot(dx, dy) > 8) drag.moved = true;
  if (!drag.moved) return;
  if (drag.kind === 'orbit') { world.rotate(-(e.clientX - prev.x) * 0.008); world.tilt((e.clientY - prev.y) * 0.005); }
  else if (drag.kind === 'pan') world.panMove(drag.pan, e.clientX, e.clientY);
  else buildMove(drag, e.clientX, e.clientY);
});
const up = e => {
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (drag && e.type === 'pointerup') {
    if (drag.kind !== 'pan' && drag.kind !== 'orbit') buildUp(drag, e.clientX, e.clientY);
    else if (!drag.moved && drag.kind === 'pan') tap(e.clientX, e.clientY);
  }
  drag = null;
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
canvas.addEventListener('wheel', e => { e.preventDefault(); world.zoom(e.deltaY < 0 ? 1.1 : 0.9); }, { passive: false });

/** Cosa c'è sotto il dito: un Sim, dei piatti, un oggetto o una casella. */
const hit = (sx, sy, withSims = true) => world.pick(sx, sy, g, viewLv, withSims);
/** Punto del pavimento del piano che si guarda sotto il dito (in caselle, con i decimali). */
const tileAt = (sx, sy) => world.tileAt(sx, sy, viewLv);

function tap(sx, sy) {
  if (build) return;
  const t = hit(sx, sy);
  const s = g.sims[sel];
  if (t.sim) {
    if (t.sim.id === sel) return phoneMenu(sx, sy);
    if (t.sim.npc) {   // gente della città (o un ospite): si fa amicizia, niente romanticismo
      const p = t.sim, rel = relOf(g, s, p);
      const friendly = SOCIAL.filter(a => ['chiacchiera', 'scherza', 'abbraccia', 'solletico'].includes(a.id));
      menu(sx, sy, `${esc(p.name)} · ${friendText(rel)}`, friendly.map(a => ({
        label: `${a.emoji} ${a.label}`, dim: rel < a.min,
        run: () => say(order(g, s, { kind: 'social', action: a.id, partner: p.id })),
      })));
      return;
    }
    // In famiglia: con il partner anche romanticismo, proposta e bebè; con i figli giochi e compiti
    const p = t.sim, withKid = s.kid || p.kid || inFamily(s) || inFamily(p);   // con i figli (anche grandi) niente romanticismo
    const ROMANCE = ['bacia', 'balliamo', 'proponi', 'bambino'];
    const acts = SOCIAL.filter(a => !a.hidden && (withKid ? !ROMANCE.includes(a.id) && !a.couple && (a.id !== 'aiutaCompiti' || (p.kid && !s.kid)) : !a.kid)
      && (a.id !== 'proponi' || g.couple.stage === 'insieme') && (a.id !== 'bambino' || !g.pregnancy));
    menu(sx, sy, `${esc(p.name)}${p.kid ? ' 🧒' : ''}`, [
      { label: `👆 Controlla ${p.name}`, run: () => { sel = p.id; hud(); } },
      ...acts.map(a => ({ label: `${a.emoji} ${a.label}`, dim: !withKid && g.rel < a.min, run: () => say(order(g, s, { kind: 'social', action: a.id, partner: p.id })) })),
    ]);
    return;
  }
  if (t.pet) {
    const p = t.pet, P = PETS[p.kind];
    const low = Object.entries(p.needs).sort((a, b) => a[1] - b[1])[0];
    const state = low[1] < 30 ? { fame: 'ha fame', svago: 'si annoia', igiene: 'è sporco' }[low[0]] : p.state === 'sleep' ? 'dorme' : 'sta bene';
    if (s.kid) return menu(sx, sy, `${P.emoji} ${esc(p.name)} · ${state}`, ['accarezza', 'giocaPet'].map(id => ({ label: `${PET_ACTIONS[id].emoji} ${PET_ACTIONS[id].label}`, run: () => say(order(g, s, { kind: 'pet', pet: p.id, action: id })) })));
    menu(sx, sy, `${P.emoji} ${esc(p.name)} · ${state}`, Object.values(PET_ACTIONS).map(a => ({ label: `${a.emoji} ${a.label}`, run: () => say(order(g, s, { kind: 'pet', pet: p.id, action: a.id })) })));
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
  const broken = g.town.at ? [] : g.objects.filter(o => o.broken);
  const away = !!g.town.at;
  menu(sx, sy, '📱 Telefono', [
    { label: '🗺️ Esci in città…', run: () => citySheet() },
    ...(!away && Object.values(g.town.friends).some(f => f.rel >= 20) ? [{ label: '📞 Invita a casa un amico…', run: () => citySheet(true) }] : []),
    ...(away ? [] : [{ label: g.pizzaAt ? '🍕 La pizza sta arrivando…' : '🍕 Ordina una pizza (25 €)', dim: !!g.pizzaAt, run: () => {
      if (g.pizzaAt) return;
      if (g.money < 25) return toast('Non avete abbastanza soldi.');
      g.money -= 25;
      g.pizzaAt = g.day * 1440 + g.minute + 45;
      toast('🍕 Pizza ordinata: arriva tra 45 minuti davanti a casa.');
    } }]),
    ...(away ? [{ label: '🏠 Torna a casa', run: () => goTravel('casa') }] : []),
    ...(!away && !g.sims[sel].kid && g.couple.stage === 'fidanzati' ? [{ label: `💒 Organizza il matrimonio (${WEDDING_COST} €)`, run: () => {
      if (!confirm(`Sposarvi oggi? La festa costa ${WEDDING_COST} € e arrivano i vostri amici.`)) return;
      const msg = startWedding(g, notify);
      if (msg) toast(msg); else save();
    } }] : []),
    ...(!away && !g.sims[sel].kid ? [{ label: '🎂 Ordina una torta di compleanno (40 €)', run: () => { const msg = orderCake(g, g.sims[sel], notify); if (msg) toast(msg); else save(); } }] : []),
    ...(!away && !g.sims[sel].kid ? Object.entries(PETS).map(([k, P]) => ({ label: `${P.emoji} Adotta un ${P.name.toLowerCase()} (${P.price} €)`, run: () => { const msg = adopt(g, k, notify); if (msg) toast(msg); else save(); } })) : []),
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
  world.centerOn(world.cam.tx, world.cam.tz, viewLv);
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
  if (g.town.at) return toast('Siete fuori casa: per arredare tornate a casa.');
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
const corner = (sx, sy) => { const [x, y] = tileAt(sx, sy); return [Math.round(x), Math.round(y)]; };
/** Il pezzo di muro più vicino al dito (entro un terzo di casella), o null. */
function wallAt(sx, sy) {
  const [x, y] = tileAt(sx, sy);
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
    const [tx, ty] = tileAt(sx, sy);
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
    const [tx, ty] = tileAt(sx, sy);
    build.placing.x = Math.round(tx - d.grab[0]);
    build.placing.y = Math.round(ty - d.grab[1]);
  } else if (d.kind === 'object') {   // inizia a spostare un mobile trascinandolo
    const o = d.obj;
    if (g.sims.some(s => s.cur?.obj === o.id)) { toast('Lo stanno usando: aspetta che finiscano.'); d.kind = 'none'; return; }
    build.placing = { type: o.type, x: o.x, y: o.y, rot: o.rot, color: o.color, moveId: o.id, lv: lvOf(o) };
    const f = footprint(build.placing);
    const [tx, ty] = tileAt(d.x, d.y);
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
  const [x, y] = tileAt(sx, sy).map(Math.floor);
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
    const [x, y] = tileAt(sx, sy).map(Math.floor);
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
  const [tx, ty] = tileAt(w / 2, h * 0.4);
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
    ${s.kid ? `<div class="jobnow"><b>🎒 ${job.name} · ${esc(job.titles[s.job.level])}</b><small>Dal lunedì al venerdì, ${job.start}:00-${job.end}:00 (scuolabus alle ${job.start - 1}:30)</small><div class="bar"><i style="width:${Math.max(0, s.job.perf)}%"></i></div><small>Per un voto migliore: compiti (alla scrivania o alla libreria), aiuto dei genitori e buon umore.</small></div>` : job ? `<div class="jobnow"><b>${job.emoji} ${esc(job.titles[s.job.level])}</b><small>${job.name} · ${job.start}:00-${job.end}:00 · ${job.days.map(d => ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'][d]).join(' ')}
      · ${job.pay[s.job.level]} € l'ora</small>
      <div class="bar"><i style="width:${Math.max(0, s.job.perf)}%"></i></div><small>Verso la promozione: vai al lavoro di buon umore${job.skill ? ` e allena ${skillName(job.skill)[1]} ${skillName(job.skill)[2].toLowerCase()} (${s.skills[job.skill].toFixed(1)})` : ''}.</small>
      <button class="secondary" data-quit>Licenziati</button></div>` : '<p class="note">Scegli un lavoro: mezz\'ora prima dell\'inizio il Sim esce di casa da solo e torna con lo stipendio.</p>'}
    ${s.kid ? '' : '<h3>Offerte</h3>'}
    ${s.kid ? '' : Object.entries(CAREERS).filter(([, c]) => !c.school).map(([id, c]) => `<button class="row" data-job="${id}" data-sim="${s.id}"><span>${c.emoji}</span><span><b>${c.name}</b>
      <small>${c.start}:00-${c.end}:00 · ${c.days.length} giorni a settimana · da ${c.pay[0]} € l'ora${c.skill ? ` · conta ${skillName(c.skill)[1]} ${skillName(c.skill)[2].toLowerCase()}` : ''}</small></span></button>`).join('')}
    <h3>Abilità di ${esc(s.name)}</h3>
    ${SKILLS.map(([k, e, l]) => `<div class="need skillrow"><span>${e} ${l}</span><div class="bar"><i style="width:${(s.skills[k] ?? 0) * 10}%"></i></div><small>${(s.skills[k] ?? 0).toFixed(1)}</small></div>`).join('')}
    <p class="note">Si allenano con: cucinare e i libri di ricette (cucina), tapis roulant, pesi e piscina (fitness), computer e scacchi (logica), chitarra e pittura (creatività), specchio e chiacchiere (carisma).</p>`;
  if (!sheet.open) sheet.showModal();
}

/** Nome del neonato: lo scegliete voi (se il telefono non apre la finestra, resta quello proposto). */
function nameBaby(id) {
  const crib = g.objects.find(o => o.id === id);
  if (!crib?.baby) return;
  setTimeout(() => {
    let name = null;
    try { name = prompt(`Come lo chiamate? (${crib.baby.gender === 'lei' ? 'è una bambina' : 'è un bambino'})`, crib.baby.name); } catch { /* niente */ }
    if (name?.trim()) { crib.baby.name = name.trim().slice(0, 14); save(); }
  }, 300);
}
// ---------------------------------------------------------------- città e amici
const friendText = r => (r >= 70 ? '💛 amico del cuore' : r >= 30 ? '🤝 amico' : r > 5 ? '🙂 conoscente' : '👋 sconosciuto');
function citySheet(friendsOnly = false) {
  const at = g.town.at;
  const cost = travelCost(g);
  const friends = Object.entries(g.town.friends).filter(([, f]) => f.rel > 5).sort((a, b) => b[1].rel - a[1].rel);
  sheet.innerHTML = `<div class="sheet-head"><h2>${friendsOnly ? '📞 Amici' : '🗺️ Città'}</h2><button class="icon" data-close>✕</button></div>
    ${friendsOnly ? '' : `<p class="note">${at ? `Siete qui: <b>${PLACES[at].emoji} ${PLACES[at].name}</b>.` : 'Uscite insieme (chi è al lavoro vi raggiunge dopo).'} ${cost ? `Senza un'auto libera si va in taxi: ${cost} € a viaggio.` : 'Si va con la vostra auto.'}</p>
    ${at ? '<button class="primary wide" data-travel="casa">🏠 Torna a casa</button>' : ''}
    ${Object.entries(PLACES).filter(([id]) => id !== at).map(([id, p]) => { const open = isOpen(id, g.minute); return `<button class="row ${open ? '' : 'dim'}" data-travel="${id}">
      <span>${p.emoji}</span><span><b>${p.name}</b><small>${esc(p.text)} · ${open ? 'aperto' : 'chiuso'} (${hours(id)})</small></span></button>`; }).join('')}`}
    <h3>Amici</h3>
    ${friends.length ? friends.map(([key, f]) => `<div class="row friend"><img src="${portrait(f.model)}" alt=""><span><b>${esc(f.name)}</b><small>${friendText(f.rel)}</small>
      <div class="bar"><i style="width:${f.rel}%"></i></div></span>${!at && f.rel >= 20 ? `<button class="secondary" data-invite="${key}">Invita</button>` : ''}</div>`).join('')
      : '<p class="note">Ancora nessuno: uscite in città e chiacchierate con la gente. Con chi diventa amico (🤝) potete invitarlo a casa.</p>'}`;
  if (!sheet.open) sheet.showModal();
}
function goTravel(id) {
  const msg = travel(g, id, notify);
  if (msg) return toast(msg);
  sheet.close?.();
  closeMenu();
  viewLv = 0;
  setLevel(0);
  followLv = 0;
  const s = g.sims.find(x => !x.npc && !x.atWork) ?? g.sims[sel];
  centerOn(s.x, s.y - 4, 0);
  save();
  hud();
}

// ---------------------------------------------------------------- obiettivi e desideri
function goalsSheet() {
  sheet.innerHTML = `<div class="sheet-head"><h2>🎯 Obiettivi</h2><button class="icon" data-close>✕</button></div>
    <p class="note">Una piccola guida per cominciare: ogni obiettivo completato vale soldi per arredare casa.</p>
    ${GOALS.map(gl => { const done = g.goals.done.includes(gl.key); return `<div class="row goal-row ${done ? 'done' : ''}"><span>${done ? '✅' : '⬜'}</span>
      <span><b>${esc(gl.text)}</b><small>${esc(gl.hint)}</small></span><em>+${gl.reward} €</em></div>`; }).join('')}
    <h3>⭐ Desideri di oggi</h3>
    <p class="note">Ognuno ha due desideri al giorno: esaudirli dà 80 € e buonumore. Domani ne arrivano di nuovi.</p>
    ${g.sims.filter(s => !s.npc).map(s => `<p><b>${esc(s.name)}</b>: ${s.wishes?.length ? s.wishes.map(id => { const wi = WISHES.find(x => x.id === id); return `${wi.emoji} ${esc(wi.text)}`; }).join(' · ') : 'tutti esauditi! 🎉'}</p>`).join('')}`;
  if (!sheet.open) sheet.showModal();
}

// ---------------------------------------------------------------- album dei ricordi
function albumSheet() {
  const next = birthdays(g).slice(0, 3);
  const when = at => { const d = Math.max(0, Math.round((at - (g.day * 1440 + g.minute)) / 1440)); return d === 0 ? 'oggi' : d === 1 ? 'domani' : `tra ${d} giorni`; };
  sheet.innerHTML = `<div class="sheet-head"><h2>📸 Album dei ricordi</h2><button class="icon" data-close>✕</button></div>
    ${next.length ? `<h3>Prossimi compleanni</h3>${next.map(b => `<p>🎂 <b>${esc(b.name)}</b> diventa ${nextLabel(b)} ${when(b.at)}</p>`).join('')}
      <p class="note">Ordinate una torta dal telefono (tocca il tuo Sim) e festeggiate: chi compie gli anni cresce subito, con la festa.</p>` : ''}
    <h3>La vostra storia</h3>
    <div class="album">${[...(g.memories ?? [])].reverse().map(m => `<div class="memory"><span>${m.emoji}</span><span><b>${esc(m.text)}</b><small>Giorno ${m.day + 1}</small></span></div>`).join('') || '<p class="note">Ancora nessun ricordo.</p>'}</div>`;
  if (!sheet.open) sheet.showModal();
}

// ---------------------------------------------------------------- impostazioni
function settingsSheet() {
  sheet.innerHTML = `<div class="sheet-head"><h2>⚙ Impostazioni</h2><button class="icon" data-close>✕</button></div>
    <label class="check"><input type="checkbox" id="auto" ${g.auto ? 'checked' : ''}> Libero arbitrio (se non dai ordini, i Sim pensano da soli ai bisogni)</label>
    <details class="box"><summary>Come si gioca</summary><p>Tocca un Sim in alto a sinistra per comandarlo. Tocca un oggetto per scegliere cosa fargli fare, il pavimento per farlo camminare, l'altro Sim per chiacchierare, abbracciarvi, baciarvi… Le azioni si mettono in fila (fino a 4): tocca un'icona in fila per annullarla.</p>
      <p>Tieni alti i bisogni (fame, energia, igiene, vescica, svago, socialità) e la casa bella e in ordine: l'umore (il rombo sopra la testa) decide come va al lavoro. Dopo mangiato portate via i piatti. Ogni lunedì arrivano le bollette.</p>
      <p>Arreda → Compra: scegli un oggetto e trascinalo; i mobili già in casa si spostano trascinandoli. Arreda → Costruisci: muri (trascina il dito), porte, finestre, pavimenti e colori.</p>
      <p>👨‍👩‍👧 Famiglia: con il rapporto sopra l'80% fate la proposta (toccate l'altro Sim), poi organizzate il matrimonio dal telefono. "Provate ad avere un bambino": il neonato sta nella culla (tocca la culla per biberon, pannolino, coccole, ninna nanna) e dopo tre giorni diventa un bambino che va a scuola. Dal telefono si adotta un cane o un gatto: ciotola e cuccia sono in Arreda → Famiglia.</p>
      <p>🗺️ Città: uscite al parco, in palestra, al ristorante, al locale o in biblioteca. Toccate la gente per chiacchierare: chi diventa amico (🤝) si può invitare a casa dal telefono (tocca il tuo Sim).</p>
      <p>Un dito sposta la vista, due dita fanno lo zoom e ruotano la casa (anche ⟲ ⟳); 🏠 abbassa o alza i muri. ⏸ ▶ ▶▶ ▶▶▶ cambiano la velocità del tempo; quando l'app è chiusa il tempo si ferma.</p></details>
    <button class="secondary wide" data-album>📸 Album dei ricordi</button>
    <h3>Partita</h3>
    <button class="secondary wide" data-newgame>Ricomincia da capo</button>
    <p class="note">Versione ${esc(APP_VERSION)}${native ? ` · app Android ${esc(native.appVersion?.() ?? '')}` : ''}. La partita resta solo su questo telefono.</p>
    ${!native ? '<p class="note">Su iPhone: apri questa pagina in Safari, Condividi → "Aggiungi alla schermata Home".</p>' : ''}`;
  if (!sheet.open) sheet.showModal();
}

// ---------------------------------------------------------------- creazione della coppia
/** Personaggio 3D del Sim (modelli Kenney: 6 per lui, 6 per lei). */
const modelOf = s => (CHAR_MODELS.includes(s.look?.model) ? s.look.model : s.gender === 'lei' ? 'female-a' : 'male-a');
let draft = null;
function createScreen() {
  draft ??= [
    { name: 'Io', gender: 'lui', look: { model: 'male-a' } },
    { name: 'Lei', gender: 'lei', look: { model: 'female-a' } },
  ];
  const models = d => CHAR_MODELS.filter(m => m.startsWith(d.gender === 'lei' ? 'female' : 'male'));
  $('#create').innerHTML = `<h1>GA Life</h1><p>Create la vostra coppia: poi arredate casa, trovate un lavoro e prendetevi cura l'uno dell'altra.</p>
    ${draft.map((d, i) => `<section class="cs"><img class="prev" src="${portrait(modelOf(d))}" alt=""><div class="cs-body">
      <input data-name="${i}" value="${esc(d.name)}" maxlength="14" placeholder="Nome">
      <div class="seg2"><button class="${d.gender === 'lui' ? 'on' : ''}" data-gender="${i}|lui">Lui</button><button class="${d.gender === 'lei' ? 'on' : ''}" data-gender="${i}|lei">Lei</button></div>
      <small>Aspetto</small><div class="looks">${models(d).map(m => `<button class="${modelOf(d) === m ? 'on' : ''}" data-model="${i}|${m}"><img src="${portrait(m)}" alt=""></button>`).join('')}</div></div></section>`).join('')}
    <button class="primary" data-start>Iniziate!</button>`;
}
function startView() {
  world.cam.dist = w < 500 ? 34 : 26;   // sul telefono un po' più da lontano: si vede quasi tutta la casa
  world.cam.yaw = Math.PI / 4;
  const s = g.sims[sel];
  centerOn(s.x - 1, s.y - 1, s.lv);
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
    if (sel === id && !g.sims[id].atWork) centerOn(g.sims[id].x, g.sims[id].y, g.sims[id].lv);
    sel = id;
    hud();
    return;
  }
  const cn = t.closest('[data-cancel]');
  if (cn) { cancel(g, g.sims[sel], +cn.dataset.cancel); hud(); return; }
  const lvb = t.closest('[data-lv]');
  if (lvb) { setLevel(viewLv + +lvb.dataset.lv); return; }
  const zb = t.closest('[data-zoom]');
  if (zb) { world.zoom(zb.dataset.zoom === '+' ? 1.25 : 0.8); return; }
  const rb = t.closest('[data-rot]');
  if (rb) { world.rotate((+rb.dataset.rot * Math.PI) / 4); return; }
  if (t.closest('[data-walls]')) { setWallMode(); return; }
  if (t.closest('[data-build]')) return build ? closeBuild() : openBuild();
  if (t.closest('[data-jobs]')) return jobsSheet();
  if (t.closest('[data-city]')) return citySheet();
  const tr = t.closest('[data-travel]');
  if (tr) return goTravel(tr.dataset.travel);
  const inv = t.closest('[data-invite]');
  if (inv) { const msg = invite(g, inv.dataset.invite, notify); if (msg) toast(msg); else { sheet.close(); save(); } return; }
  if (t.closest('[data-settings]')) return settingsSheet();
  if (t.closest('[data-album]')) return albumSheet();
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
  const gb = t.closest('[data-gender]');
  if (gb) { const [i, gd] = gb.dataset.gender.split('|'); const d = draft[+i]; d.gender = gd; d.look.model = gd === 'lei' ? 'female-a' : 'male-a'; createScreen(); return; }
  const mb = t.closest('[data-model]');
  if (mb) { const [i, m] = mb.dataset.model.split('|'); draft[+i].look.model = m; createScreen(); return; }
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
/** Muri: tagliati (si abbassano quelli davanti), tutti giù o tutti su. */
const WALL_MODES = [['cut', '🏠', 'Muri tagliati'], ['down', '⬇️', 'Muri giù'], ['up', '🧱', 'Muri su']];
function setWallMode(m) {
  const i = m ? WALL_MODES.findIndex(x => x[0] === m) : (WALL_MODES.findIndex(x => x[0] === world.wallMode) + 1) % WALL_MODES.length;
  const [id, icon, text] = WALL_MODES[Math.max(0, i)];
  world.wallMode = id;
  $('[data-walls]').textContent = icon;
  if (!m) toast(text);
  try { localStorage.setItem('walls', id); } catch { /* niente */ }
}

let last = 0, hudT = 0;
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (t - (last || t)) / 1000);
  last = t;
  if (!g) return;
  if (!build && g.speed) tick(g, dt * SPEEDS[g.speed], notify);
  world.render(g, { viewLv, sel, build, mood: mood(g.sims[sel], g), canPlace: p => canPlace(g, p, p.moveId) }, dt);
  drawLabels();
  hudT -= dt;
  if (hudT <= 0) { hudT = 0.25; hud(); }
}

function startCreate() {
  $('#create').hidden = false;
  createScreen();
}

// Avvio: prima i modelli 3D (la prima volta si scaricano, poi restano nel telefono)
world = createWorld(canvas, FLOORS);
addEventListener('resize', () => { resize(); });
resize();
await loadModels(p => { $('#loadbar').style.width = `${Math.round(p * 100)}%`; });
$('#loading').hidden = true;
setWallMode((() => { try { return localStorage.getItem('walls'); } catch { return null; } })() ?? 'cut');
const saved = await getSetting('save', null);
if (saved) {
  g = migrate(saved);
  for (const s of g.sims) s.look = { ...s.look, model: modelOf(s) };
  relink();
  startView();
  hud();
} else startCreate();
if (location.hostname === 'localhost') window.__gl = { get g() { return g; }, tick, notify, world, hit, get build() { return build; }, frame };   // solo per le prove in locale
requestAnimationFrame(frame);
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
checkWebUpdate();
