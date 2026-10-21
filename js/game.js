// Simulazione di GA Life: tempo, bisogni, azioni, percorsi dentro casa, lavoro, rapporto di coppia e
// "libero arbitrio" (quando non dai ordini, i Sim pensano da soli ai propri bisogni).
import { TYPES, ACTIONS, SOCIAL, NEEDS, footprint, point } from './catalog.js';

export const DAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
export const SPEEDS = [0, 2, 8, 30];   // minuti di gioco al secondo: pausa, normale, veloce, velocissimo
const WALK = 1.4;                       // caselle per minuto di gioco

// Quanto scende ogni bisogno in un'ora di gioco (a casa e al lavoro)
const DECAY = { fame: 6, energia: 4, igiene: 3.5, vescica: 7.5, svago: 5, socialita: 3.5 };
const DECAY_WORK = { fame: 5, energia: 6, igiene: 3, vescica: 0, svago: 6, socialita: -3 };

export const CAREERS = {
  ufficio: { name: 'Informatico', emoji: '💻', start: 9, end: 17, days: [0, 1, 2, 3, 4], pay: [16, 22, 30, 42, 58],
    titles: ['Stagista', 'Programmatore junior', 'Programmatore', 'Programmatore senior', 'Responsabile IT'] },
  cucina: { name: 'Cuoco', emoji: '🍳', start: 10, end: 18, days: [1, 2, 3, 4, 5], pay: [14, 20, 28, 38, 52], skill: 'cucina',
    titles: ['Lavapiatti', 'Aiuto cuoco', 'Cuoco', 'Sous-chef', 'Chef'] },
  palestra: { name: 'Personal trainer', emoji: '🏋️', start: 14, end: 21, days: [0, 1, 2, 3, 4, 5], pay: [13, 19, 27, 37, 50], skill: 'fitness',
    titles: ['Istruttore in prova', 'Istruttore', 'Personal trainer', 'Coach', 'Direttore della palestra'] },
  negozio: { name: 'Commesso', emoji: '🛍️', start: 9, end: 15, days: [1, 2, 3, 4, 5], pay: [12, 16, 21, 28, 36],
    titles: ['Commesso', 'Addetto vendite', 'Capo reparto', 'Vice direttore', 'Direttore del negozio'] },
};

// ---------------------------------------------------------------- partita nuova
export function newGame(simsInfo) {
  const W = 12, H = 10;
  // Pavimenti: bagno (piastrelle azzurre), cucina (piastrelle chiare), resto parquet
  const floors = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) floors.push(x < 3 && y < 4 ? 'bagno' : x >= 8 && y < 4 ? 'cucina' : 'legno');
  const o = (type, x, y, rot = 0, color) => ({ id: Math.random().toString(36).slice(2, 9), type, x, y, rot, color });
  const objects = [
    o('letto', 4, 0, 0, '#60a5fa'), o('lampada', 6, 0), o('pianta', 3, 0),
    o('doccia', 0, 0), o('wc', 1, 0), o('lavandino', 2, 0),
    o('frigo', 11, 0, 3), o('fornello', 11, 1, 3), o('lavello', 11, 2, 3), o('tavolo', 8, 2, 0),
    o('divano', 4, 7, 2, '#ef4444'), o('tv', 4, 5, 0), o('tappeto', 4, 4, 0, '#1d4ed8'), o('computer', 0, 6, 1), o('pianta', 11, 7),
  ];
  const sims = simsInfo.map((s, i) => ({
    id: i, name: s.name, gender: s.gender, look: s.look,
    needs: { fame: 70, energia: 80, igiene: 75, vescica: 70, svago: 60, socialita: 65 },
    x: 6.5 + i, y: 8.5, path: [], queue: [], cur: null, face: 1, walk: 0,
    skills: { cucina: 0, fitness: 0 }, job: null, atWork: false, alerted: {}, idle: 0,
  }));
  return { v: 1, day: 0, minute: 8 * 60, money: 1500, speed: 1, W, H, floors, objects, sims, rel: 60, bills: 7, auto: true };
}

// ---------------------------------------------------------------- utilità
export const timeText = g => `${String(Math.floor(g.minute / 60)).padStart(2, '0')}:${String(Math.floor(g.minute % 60)).padStart(2, '0')}`;
export const dayText = g => `${DAYS[g.day % 7]} · giorno ${g.day + 1}`;
export function mood(sim) {
  const vals = Object.values(sim.needs);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.round(Math.min(avg, Math.min(...vals) + 35));   // un bisogno a terra rovina l'umore
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const other = (g, sim) => g.sims.find(s => s !== sim);
export const oa = sim => (sim.gender === 'lei' ? 'a' : 'o');   // andato/andata

/** Caselle occupate dagli oggetti (i tappeti si calpestano). */
function blocked(g) {
  const b = new Set();
  for (const o of g.objects) {
    if (TYPES[o.type].passable) continue;
    const f = footprint(o);
    for (let x = f.x; x < f.x + f.w; x++) for (let y = f.y; y < f.y + f.d; y++) b.add(`${x},${y}`);
  }
  return b;
}
export function canPlace(g, o, ignoreId = null) {
  const f = footprint(o);
  if (f.x < 0 || f.y < 0 || f.x + f.w > g.W || f.y + f.d > g.H) return false;
  if (TYPES[o.type].passable) return true;
  for (const q of g.objects) {
    if (q.id === ignoreId || TYPES[q.type].passable) continue;
    const r = footprint(q);
    if (f.x < r.x + r.w && f.x + f.w > r.x && f.y < r.y + r.d && f.y + f.d > r.y) return false;
  }
  for (const s of g.sims) if (!s.atWork && Math.floor(s.x) >= f.x && Math.floor(s.x) < f.x + f.w && Math.floor(s.y) >= f.y && Math.floor(s.y) < f.y + f.d) return false;
  return true;
}

/** Percorso a caselle (8 direzioni, senza tagliare gli angoli) dal Sim fino a una delle caselle goal. */
function findPath(g, sx, sy, goals) {
  const block = blocked(g);
  const start = `${Math.floor(sx)},${Math.floor(sy)}`;
  const goalSet = new Set(goals.map(([x, y]) => `${x},${y}`));
  const prev = new Map([[start, null]]);
  const queue = [[Math.floor(sx), Math.floor(sy)]];
  const free = (x, y) => x >= 0 && y >= 0 && x < g.W && y < g.H && !block.has(`${x},${y}`);
  while (queue.length) {
    const [x, y] = queue.shift();
    const key = `${x},${y}`;
    if (goalSet.has(key)) {
      const path = [];
      for (let k = key; k && k !== start; k = prev.get(k)) path.unshift(k.split(',').map(Number));
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy, nk = `${nx},${ny}`;
      if (prev.has(nk) || !free(nx, ny)) continue;
      if (dx && dy && (!free(x + dx, y) || !free(x, y + dy))) continue;
      prev.set(nk, key);
      queue.push([nx, ny]);
    }
  }
  return null;
}

/** Caselle da cui si usa un oggetto: davanti prima, poi tutte quelle intorno. */
function useTiles(g, o) {
  const f = footprint(o);
  const front = [];
  if (o.rot === 0) for (let x = f.x; x < f.x + f.w; x++) front.push([x, f.y + f.d]);
  if (o.rot === 1) for (let y = f.y; y < f.y + f.d; y++) front.push([f.x + f.w, y]);
  if (o.rot === 2) for (let x = f.x; x < f.x + f.w; x++) front.push([x, f.y - 1]);
  if (o.rot === 3) for (let y = f.y; y < f.y + f.d; y++) front.push([f.x - 1, y]);
  const around = [];
  for (let x = f.x - 1; x <= f.x + f.w; x++) for (let y = f.y - 1; y <= f.y + f.d; y++) {
    if (x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.d) continue;
    around.push([x, y]);
  }
  const block = blocked(g);
  const ok = ([x, y]) => x >= 0 && y >= 0 && x < g.W && y < g.H && !block.has(`${x},${y}`);
  const f1 = front.filter(ok);
  return f1.length ? f1 : around.filter(ok);
}

// ---------------------------------------------------------------- ordini
/** Mette in coda un'azione su un oggetto (o sull'altro Sim). Restituisce un messaggio se non si può. */
export function order(g, sim, cmd) {
  if (sim.atWork) return `${sim.name} è al lavoro.`;
  if (sim.queue.length >= 4) return 'Ha già troppe cose da fare: aspetta o togline una.';
  sim.queue.push({ ...cmd, by: 'you' });
  sim.idle = 0;
  return null;
}
export function cancel(sim, i) {
  if (i === 0 && sim.cur) { stopCur(sim); return; }
  sim.queue.splice(sim.cur ? i - 1 : i, 1);
}
function stopCur(sim, g = null) {
  const c = sim.cur;
  if (c?.obj) freeObject(c);
  if (c?.partner && g) { const p = g.sims.find(s => s.id === c.partner); if (p?.cur?.partner === sim.id) p.cur = null; }
  sim.cur = null;
  sim.path = [];
  sim.pose = null;
}
function freeObject(c) {
  if (c.objRef?.users) c.objRef.users = c.objRef.users.filter(u => u.sim !== c.simId);
}

/** Azioni che si possono fare con un oggetto (con i motivi se non si può). */
export function actionsFor(g, sim, o) {
  const T = TYPES[o.type];
  const list = T.actions.map(id => ACTIONS[id]);
  if (T.eat) list.push({ id: 'siediTavolo', label: 'Siediti al tavolo', emoji: '🪑', dur: 20, gain: { energia: 2 }, pose: 'sit' });
  return list;
}

// ---------------------------------------------------------------- avanzamento del tempo
/** Fa avanzare il gioco di min minuti (a passi di al massimo un minuto). notify(testo) per gli avvisi. */
export function tick(g, min, notify) {
  while (min > 0) {
    const step = Math.min(1, min);
    min -= step;
    const before = g.minute;
    g.minute += step;
    if (g.minute >= 24 * 60) { g.minute -= 24 * 60; g.day++; newDay(g, notify); }
    for (const sim of g.sims) simStep(g, sim, step, before, notify);
    g.rel = clamp(g.rel - step / (60 * 24) * 1.5, 0, 100);   // il rapporto cala piano se vi ignorate
  }
}

function newDay(g, notify) {
  if (g.day >= g.bills) {   // bollette ogni lunedì
    const value = g.objects.reduce((a, o) => a + TYPES[o.type].price, 0);
    const amount = Math.round(60 + value * 0.02);
    g.money -= amount;
    g.bills = g.day + 7;
    notify(`🧾 Bollette pagate: ${amount} €${g.money < 0 ? ' · siete in rosso!' : ''}`);
  }
}

function simStep(g, sim, dt, before, notify) {
  const job = sim.job && CAREERS[sim.job.career];
  // Lavoro: mezz'ora prima esce di casa, alla fine torna con lo stipendio
  if (job && job.days.includes(g.day % 7)) {
    const leave = job.start * 60 - 30, back = job.end * 60;
    if (!sim.atWork && before < leave && g.minute >= leave) goToWork(g, sim, notify);
    if (sim.atWork && before < back && g.minute >= back) backFromWork(g, sim, job, notify);
  }
  const decay = sim.atWork ? DECAY_WORK : DECAY;
  const sleeping = sim.cur?.id === 'dormi' || sim.cur?.id === 'pisolino' || sim.cur?.id === 'divanoPisolino';
  for (const [k] of NEEDS) {
    if (k === 'energia' && sleeping) continue;
    const slow = sleeping && (k === 'fame' || k === 'vescica') ? 0.4 : 1;   // di notte fame e vescica calano piano
    sim.needs[k] = clamp(sim.needs[k] - (decay[k] * slow * dt) / 60, 0, 100);
  }
  if (sim.atWork) return;

  // Vescica quasi vuota: si lascia tutto (anche il sonno) e si corre in bagno, se c'è
  const toilet = g.objects.find(o => TYPES[o.type].actions.includes('bagno'));
  if (sim.needs.vescica < 12 && toilet && sim.cur?.id !== 'bagno' && !sim.queue.some(c => c.action === 'bagno') && !sim.cur?.social) {
    stopCur(sim, g);
    sim.queue.unshift({ kind: 'obj', obj: toilet.id, action: 'bagno', by: 'auto' });
  }

  // Emergenze
  if (sim.needs.vescica <= 0) {
    sim.needs.vescica = 100;
    sim.needs.igiene = clamp(sim.needs.igiene - 45, 0, 100);
    sim.needs.svago = clamp(sim.needs.svago - 20, 0, 100);
    stopCur(sim, g);
    notify(`😳 ${sim.name} non ha fatto in tempo ad arrivare in bagno…`);
  }
  if (sim.needs.energia <= 0 && !sleeping) {
    stopCur(sim, g);
    sim.queue = [];
    sim.cur = { id: 'dormi', label: 'Svenuto dal sonno', emoji: '💤', until: 'energia', gain: { energia: 7 }, state: 'do', t: 0, pose: 'lie', simId: sim.id, floor: true };
    sim.pose = 'lie';
    notify(`😵 ${sim.name} è crollat${oa(sim)} dal sonno sul pavimento!`);
  }
  for (const [k, , label] of NEEDS) {   // avvisi quando un bisogno è basso
    if (sim.needs[k] < 20 && !sim.alerted[k]) { sim.alerted[k] = true; notify(`${sim.name}: ${label.toLowerCase()} bassa!`); }
    if (sim.needs[k] > 40) sim.alerted[k] = false;
  }

  if (!sim.cur && sim.queue.length) startNext(g, sim, notify);
  if (!sim.cur) {
    sim.idle += dt;
    if (g.auto && sim.idle > 6) autonomy(g, sim, notify);
    return;
  }
  const c = sim.cur;
  if (c.state === 'walk') return walkStep(g, sim, dt, notify);
  if (c.state === 'wait') return;   // aspetta l'altro Sim per un'interazione
  doStep(g, sim, dt, notify);
}

function goToWork(g, sim, notify) {
  stopCur(sim, g);
  sim.queue = [];
  sim.atWork = true;
  sim.pose = null;
  sim.x = g.W - 0.5; sim.y = g.H - 0.5;
  notify(`🚗 ${sim.name} è andat${oa(sim)} al lavoro (${CAREERS[sim.job.career].name}).`);
}

function backFromWork(g, sim, job, notify) {
  sim.atWork = false;
  const hours = job.end - job.start;
  const pay = job.pay[sim.job.level] * hours;
  g.money += pay;
  const m = mood(sim);
  const skill = job.skill ? sim.skills[job.skill] * 2 : 0;
  sim.job.perf += Math.round((m - 45) / 2 + 8 + skill);
  sim.job.days++;
  let text = `🏠 ${sim.name} è tornat${oa(sim)} dal lavoro: +${pay} €`;
  if (sim.job.perf >= 100 && sim.job.level < 4) {
    sim.job.level++;
    sim.job.perf = 0;
    text = `🎉 ${sim.name} è stat${oa(sim)} promoss${oa(sim)}: ${job.titles[sim.job.level]}! (+${pay} €)`;
  } else if (sim.job.perf < -60) {
    sim.job.perf = -60;
    text += ' · il capo dice che deve arrivare più di buon umore';
  }
  sim.x = g.W - 0.5; sim.y = g.H - 0.5;
  notify(text);
}

/** Inizia la prossima azione in coda: trova l'oggetto, la casella da cui usarlo e il percorso. */
function startNext(g, sim, notify) {
  const cmd = sim.queue.shift();
  const say = cmd.by === 'auto' ? () => {} : notify;   // se ha deciso da solo, niente avvisi
  if (cmd.kind === 'go') {
    const path = findPath(g, sim.x, sim.y, [[cmd.x, cmd.y]]);
    if (!path) return say(`${sim.name} non riesce ad arrivare lì.`);
    sim.cur = { id: 'go', label: 'Cammina', emoji: '👣', state: 'walk', simId: sim.id };
    sim.path = path;
    return;
  }
  if (cmd.kind === 'social') {
    const p = other(g, sim);
    const a = SOCIAL.find(x => x.id === cmd.action);
    if (p.atWork) return say(`${p.name} è al lavoro.`);
    const goals = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) goals.push([Math.floor(p.x) + dx, Math.floor(p.y) + dy]);
    const path = findPath(g, sim.x, sim.y, goals) ?? [];
    sim.cur = { ...a, social: true, partner: p.id, state: 'walk', t: 0, simId: sim.id, by: cmd.by };
    sim.path = path;
    return;
  }
  const o = g.objects.find(x => x.id === cmd.obj);
  if (!o) return;
  const a = cmd.action === 'siediTavolo' ? actionsFor(g, sim, o).find(x => x.id === 'siediTavolo') : ACTIONS[cmd.action];
  const T = TYPES[o.type];
  const seats = T.seats ?? [];
  o.users ??= [];
  const needSeat = a.pose === 'sit' || a.pose === 'lie' || a.inside;
  let seat = null;
  if (needSeat && seats.length) {
    seat = seats.findIndex((_, i) => !o.users.some(u => u.seat === i));
    if (seat < 0) return say(`${T.name}: è occupato.`);
  } else if (o.users.length && !seats.length) return say(`${T.name}: lo sta usando ${other(g, sim).name}.`);
  const path = findPath(g, sim.x, sim.y, useTiles(g, o));
  if (!path) return say(`${sim.name} non riesce ad arrivare a: ${T.name}.`);
  o.users.push({ sim: sim.id, seat });
  sim.cur = { ...a, obj: o.id, objRef: o, seat, state: 'walk', t: 0, simId: sim.id };
  sim.cur.objRef.users = o.users;
  sim.path = path;
}

function walkStep(g, sim, dt, notify) {
  let move = WALK * dt;
  while (move > 0 && sim.path.length) {
    const [tx, ty] = sim.path[0];
    const dx = tx + 0.5 - sim.x, dy = ty + 0.5 - sim.y, d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.01) sim.face = dx - dy > 0 ? 1 : -1;
    sim.back = dx + dy < -0.01;
    if (d <= move) { sim.x = tx + 0.5; sim.y = ty + 0.5; sim.path.shift(); move -= d; }
    else { sim.x += (dx / d) * move; sim.y += (dy / d) * move; move = 0; }
  }
  sim.walk += dt * 6;
  if (sim.path.length) return;
  const c = sim.cur;
  if (c.id === 'go') { sim.cur = null; return; }
  if (c.social) return startSocial(g, sim, notify);
  // Arrivato: si siede, si sdraia o entra (doccia, water), oppure resta in piedi davanti
  const o = c.objRef;
  if (c.seat != null) {
    const [lx, ly] = TYPES[o.type].seats[c.seat];
    const [x, y] = point(o, lx, ly);
    c.from = [sim.x, sim.y];
    sim.x = x; sim.y = y;
    sim.pose = c.pose ?? null;
  } else {
    const f = footprint(o);
    const cx = f.x + f.w / 2, cy = f.y + f.d / 2;
    sim.face = (cx - sim.x) - (cy - sim.y) > 0 ? 1 : -1;
    sim.back = (cx - sim.x) + (cy - sim.y) < 0;
    sim.pose = null;
  }
  c.state = 'do';
  c.t = 0;
}

function startSocial(g, sim, notify) {
  const c = sim.cur;
  const p = g.sims.find(s => s.id === c.partner);
  const busy = p.atWork || p.cur?.id === 'dormi' || p.cur?.inside || p.cur?.social;
  if (busy) { if (c.by !== 'auto') notify(`${p.name} adesso non può.`); sim.cur = null; return; }
  if (g.rel < c.min) {   // rapporto troppo basso: rifiuta
    g.rel = clamp(g.rel - 3, 0, 100);
    notify(`🙅 ${p.name} non ne ha voglia: prima migliorate il rapporto (chiacchierate, scherzate).`);
    sim.cur = null;
    return;
  }
  stopCur(p, g);
  p.queue = [];
  sim.face = p.x - sim.x - (p.y - sim.y) > 0 ? 1 : -1;
  p.face = -sim.face;
  sim.back = p.back = false;
  c.state = 'do';
  c.t = 0;
  p.cur = { ...c, partner: sim.id, simId: p.id, state: 'do', t: 0, follower: true };
}

function doStep(g, sim, dt, notify) {
  const c = sim.cur;
  c.t += dt;
  const frac = c.until ? dt / 60 : dt / c.dur;
  for (const [k, v] of Object.entries(c.gain ?? {})) sim.needs[k] = clamp(sim.needs[k] + v * frac, 0, 100);
  if (c.skill) sim.skills[c.skill] = Math.min(10, sim.skills[c.skill] + dt / 60 * 0.6);
  if (c.social && !c.follower) g.rel = clamp(g.rel + (c.rel * dt) / c.dur, 0, 100);
  if (c.dance || c.run) sim.walk += dt * 8;
  const done = c.until ? sim.needs[c.until] >= 99.5 : c.t >= c.dur;
  if (!done) return;
  if (c.id === 'cucina') {   // il pasto: più bravo in cucina, più sazia
    const bonus = Math.round(sim.skills.cucina * 2);
    sim.needs.fame = clamp(sim.needs.fame + bonus, 0, 100);
    if (Math.random() < 0.12 - sim.skills.cucina * 0.01) notify(`🔥 ${sim.name} ha bruciato un po' il pasto… si mangia lo stesso.`);
  }
  if (c.special === 'jobs') notify('__jobs__' + sim.id);
  const then = c.then;
  const from = c.from;
  freeObject(c);
  sim.cur = null;
  sim.pose = null;
  if (from) { sim.x = from[0]; sim.y = from[1]; }
  if (then === 'mangia') {   // dopo aver cucinato si mangia al tavolo (se c'è un posto libero)
    const table = g.objects.find(o => TYPES[o.type].eat && (o.users ?? []).length < TYPES[o.type].seats.length);
    if (table) sim.queue.unshift({ kind: 'obj', obj: table.id, action: 'mangia', by: 'auto' });
    else {
      sim.cur = { ...ACTIONS.mangia, state: 'do', t: 0, simId: sim.id, pose: null };
    }
  }
}


// ---------------------------------------------------------------- libero arbitrio
function autonomy(g, sim, notify) {
  sim.idle = 0;
  const needs = Object.entries(sim.needs).sort((a, b) => a[1] - b[1]);
  for (const [need, val] of needs) {
    if (val > 55) break;
    if (need === 'socialita') {
      const p = other(g, sim);
      if (!p.atWork && !p.cur?.inside && p.cur?.id !== 'dormi' && !p.cur?.social) {
        sim.queue.push({ kind: 'social', action: g.rel > 60 && Math.random() < 0.4 ? 'abbraccia' : 'chiacchiera', by: 'auto' });
        return;
      }
      continue;
    }
    if (need === 'energia' && val > 30 && g.minute > 8 * 60 && g.minute < 21 * 60) continue;   // di giorno si dorme solo se stanchissimi
    // L'oggetto libero che dà più punti per quel bisogno
    let best = null;
    for (const o of g.objects) {
      const T = TYPES[o.type];
      const users = o.users ?? [];
      const seats = T.seats?.length ?? 0;
      if (seats ? users.length >= seats : users.length) continue;
      for (const id of T.actions) {
        const a = ACTIONS[id];
        const gain = a.gain?.[need] ?? 0;
        if (a.then === 'mangia' && need === 'fame') { if (!best || 65 > best.gain) best = { o, a, gain: 65 }; continue; }
        if (gain > 0 && (!best || gain > best.gain)) best = { o, a, gain };
      }
    }
    if (best) { sim.queue.push({ kind: 'obj', obj: best.o.id, action: best.a.id, by: 'auto' }); return; }
  }
}
