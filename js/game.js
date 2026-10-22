// Simulazione di GA Life: tempo, bisogni, azioni, percorsi dentro casa e giardino, lavoro, rapporto di coppia,
// ambiente (casa bella = più buonumore), piatti sporchi e "libero arbitrio" (quando non dai ordini, i Sim
// pensano da soli ai propri bisogni).
import { TYPES, ACTIONS, SOCIAL, NEEDS, footprint, point } from './catalog.js';

export const DAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
export const SPEEDS = [0, 2, 8, 30];   // minuti di gioco al secondo: pausa, normale, veloce, velocissimo
const WALK = 1.6;                       // caselle per minuto di gioco

// Quanto scende ogni bisogno in un'ora di gioco (a casa e al lavoro)
const DECAY = { fame: 6, energia: 4, igiene: 3.5, vescica: 7.5, svago: 5, socialita: 3.5 };
const DECAY_WORK = { fame: 5, energia: 4, igiene: 3, vescica: 0, svago: 6, socialita: -3 };

export const CAREERS = {
  ufficio: { name: 'Informatico', emoji: '💻', start: 9, end: 17, days: [0, 1, 2, 3, 4], pay: [16, 22, 30, 42, 58], skill: 'logica',
    titles: ['Stagista', 'Programmatore junior', 'Programmatore', 'Programmatore senior', 'Responsabile IT'] },
  cucina: { name: 'Cuoco', emoji: '🍳', start: 10, end: 18, days: [1, 2, 3, 4, 5], pay: [14, 20, 28, 38, 52], skill: 'cucina',
    titles: ['Lavapiatti', 'Aiuto cuoco', 'Cuoco', 'Sous-chef', 'Chef'] },
  palestra: { name: 'Personal trainer', emoji: '🏋️', start: 14, end: 21, days: [0, 1, 2, 3, 4, 5], pay: [13, 19, 27, 37, 50], skill: 'fitness',
    titles: ['Istruttore in prova', 'Istruttore', 'Personal trainer', 'Coach', 'Direttore della palestra'] },
  negozio: { name: 'Commesso', emoji: '🛍️', start: 9, end: 15, days: [1, 2, 3, 4, 5], pay: [12, 16, 21, 28, 36], skill: 'carisma',
    titles: ['Commesso', 'Addetto vendite', 'Capo reparto', 'Vice direttore', 'Direttore del negozio'] },
  artista: { name: 'Artista', emoji: '🎨', start: 11, end: 17, days: [0, 2, 4, 5], pay: [12, 18, 27, 40, 60], skill: 'creativita',
    titles: ['Artista di strada', 'Illustratore', 'Pittore', 'Artista affermato', 'Maestro d\'arte'] },
};

// ---------------------------------------------------------------- lotto, casa, muri
export const LOT = { W: 24, H: 20 };
const OX = 3, OY = 2, HW = 14, HD = 11;          // casa iniziale: angolo e misure
const DOOR_X = OX + 11;                           // porta d'ingresso (sul muro davanti)
export const exitTile = g => [g.exit?.[0] ?? DOOR_X, g.H - 1];   // dove si prende l'auto per il lavoro

/*
 * Muri: un pezzo per lato di casella. 'v:x:y' è il muro sulla linea verticale x tra le caselle (x-1, y) e (x, y);
 * 'h:x:y' è il muro sulla linea orizzontale y tra (x, y-1) e (x, y). Valore: { door, win, color }.
 */
export const wkey = (k, x, y) => `${k}:${x}:${y}`;
function addLine(walls, k, fixed, from, to, extra = {}) {
  for (let i = from; i < to; i++) walls[k === 'h' ? wkey('h', i, fixed) : wkey('v', fixed, i)] = { ...(extra[i] ?? {}) };
}
function defaultHouse() {
  const walls = {};
  const win = { win: true };
  addLine(walls, 'h', OY, OX, OX + HW, { [OX + 2]: win, [OX + 6]: win, [OX + 8]: win, [OX + 12]: win });          // dietro
  addLine(walls, 'h', OY + HD, OX, OX + HW, { [OX + 3]: win, [OX + 7]: win, [DOOR_X]: { door: true } });       // davanti
  addLine(walls, 'v', OX, OY, OY + HD, { [OY + 7]: win, [OY + 9]: win });                                       // sinistra
  addLine(walls, 'v', OX + HW, OY, OY + HD, { [OY + 2]: win, [OY + 7]: win });                                 // destra
  addLine(walls, 'v', OX + 4, OY, OY + 5);                                       // bagno | camera
  addLine(walls, 'h', OY + 4, OX, OX + 4, { [OX + 1]: { door: true } });          // bagno | soggiorno
  addLine(walls, 'v', OX + 10, OY, OY + 5);                                      // camera | cucina
  addLine(walls, 'h', OY + 5, OX + 4, OX + 10, { [OX + 6]: { door: true } });     // camera | soggiorno
  return walls;
}
function defaultFloors(W, H) {
  const floors = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const rx = x - OX, ry = y - OY;
      let f = 'erba';
      if (rx >= 0 && rx < HW && ry >= 0 && ry < HD) f = ry < 4 && rx < 4 ? 'bagno' : ry < 5 && rx >= 4 && rx < 10 ? 'camera' : ry < 5 && rx >= 10 ? 'cucina' : 'legno';
      else if (x === DOOR_X && y >= OY + HD) f = 'pietra';   // vialetto fino alla strada
      floors.push(f);
    }
  }
  return floors;
}

// ---------------------------------------------------------------- partita nuova
export function newGame(simsInfo) {
  const { W, H } = LOT;
  const o = (type, rx, ry, rot = 0, color, abs = false) => ({ id: Math.random().toString(36).slice(2, 9), type, x: abs ? rx : OX + rx, y: abs ? ry : OY + ry, rot, color });
  const objects = [
    // bagno
    o('doccia', 0, 0), o('wc', 1, 0), o('lavandino', 2, 0),
    // camera
    o('letto', 6, 0, 0, '#60a5fa'), o('comodino', 5, 0), o('comodino', 8, 0), o('armadio', 4, 0, 1), o('pianta', 9, 0),
    // cucina
    o('frigo', 13, 0, 3), o('fornello', 13, 1, 3), o('lavello', 13, 2, 3), o('bancone', 13, 3, 3), o('tavolo', 10, 2, 0),
    // soggiorno
    o('divano', 3, 9, 2, '#ef4444'), o('tv', 3, 7, 0), o('tappeto', 3, 7, 0, '#1d4ed8'), o('computer', 0, 6, 1),
    o('libreria', 0, 9, 1), o('stereo', 13, 9, 3), o('pianta', 13, 10), o('poltrona', 6, 8, 3, '#f59e0b'),
    // giardino
    o('albero', 1, 1, 0, null, true), o('albero', 21, 3, 0, null, true), o('albero', 22, 16, 0, null, true), o('pino', 0, 17, 0, null, true),
    o('pino', 20, 11, 0, null, true), o('aiuola', OX + 2, OY + HD, 0, '#f472b6', true), o('aiuola', OX + 3, OY + HD, 0, '#facc15', true),
    o('aiuola', OX + 7, OY + HD, 0, '#a78bfa', true), o('aiuola', OX + 8, OY + HD, 0, '#f87171', true),
    o('panchina', 19, 7, 3, null, true), o('lampione', DOOR_X + 1, 16, 0, null, true),
  ];
  const sims = simsInfo.map((s, i) => ({
    id: i, name: s.name, gender: s.gender, look: s.look,
    needs: { fame: 70, energia: 80, igiene: 75, vescica: 70, svago: 60, socialita: 65 },
    x: OX + 6.5 + i, y: OY + 7.5, path: [], queue: [], cur: null, face: 1, walk: 0,
    skills: { cucina: 0, fitness: 0, logica: 0, creativita: 0, carisma: 0 }, job: null, atWork: false, alerted: {}, idle: 0, wishes: [],
  }));
  const g = {
    v: 3, day: 0, minute: 8 * 60, money: 2000, speed: 1, W, H, floors: defaultFloors(W, H), walls: defaultHouse(), objects, sims,
    rel: 60, bills: 7, auto: true, wishDay: -1, goals: { done: [] }, dishes: [], exit: [DOOR_X, H - 1],
  };
  rollWishes(g);
  return g;
}

/** Partite delle versioni precedenti: casa piccola senza giardino → stesso arredamento in un lotto grande. */
export function migrate(g) {
  if ((g.v ?? 1) < 3) {
    const ox = 3, oy = 2, oldW = g.W, oldH = g.H;
    const walls = {};
    // muri interni della versione 2 (o quelli di base se la partita è ancora più vecchia)
    const old = Array.isArray(g.walls) ? g.walls : [
      { v: 3, y0: 0, y1: 4 }, { h: 4, x0: 0, x1: 1 }, { h: 4, x0: 2, x1: 3 }, { v: 8, y0: 0, y1: 4 }, { h: 4, x0: 3, x1: 5 }, { h: 4, x0: 6, x1: 8 }];
    for (const w of old) {
      if (w.v != null) for (let y = w.y0; y < w.y1; y++) walls[wkey('v', w.v + ox, y + oy)] = {};
      else for (let x = w.x0; x < w.x1; x++) walls[wkey('h', x + ox, w.h + oy)] = {};
    }
    addLine(walls, 'h', oy, ox, ox + oldW, { [ox + 7]: { win: true }, [ox + 10]: { win: true } });
    addLine(walls, 'h', oy + oldH, ox, ox + oldW, { [ox + oldW - 1]: { door: true }, [ox + 4]: { win: true } });
    addLine(walls, 'v', ox, oy, oy + oldH, { [oy + 4]: { win: true }, [oy + 7]: { win: true } });
    addLine(walls, 'v', ox + oldW, oy, oy + oldH);
    const floors = [];
    for (let y = 0; y < LOT.H; y++) {
      for (let x = 0; x < LOT.W; x++) {
        const rx = x - ox, ry = y - oy;
        floors.push(rx >= 0 && rx < oldW && ry >= 0 && ry < oldH ? g.floors?.[ry * oldW + rx] ?? 'legno' : x === ox + oldW - 1 && y >= oy + oldH ? 'pietra' : 'erba');
      }
    }
    for (const o of g.objects) { o.x += ox; o.y += oy; }
    for (const s of g.sims) { s.x += ox; s.y += oy; s.path = []; if (s.cur) s.cur = null; s.queue = []; }
    g.walls = walls;
    g.floors = floors;
    g.W = LOT.W; g.H = LOT.H;
    g.exit = [ox + oldW - 1, LOT.H - 1];
    g.objects.push({ id: 'albero1', type: 'albero', x: 20, y: 3, rot: 0 }, { id: 'albero2', type: 'albero', x: 21, y: 16, rot: 0 }, { id: 'pino1', type: 'pino', x: 1, y: 16, rot: 0 });
    g.v = 3;
  }
  g.dishes ??= [];
  g.wishDay ??= -1;
  g.goals ??= { done: [] };
  for (const s of g.sims) {
    s.wishes ??= [];
    s.skills = { cucina: 0, fitness: 0, logica: 0, creativita: 0, carisma: 0, ...s.skills };
  }
  for (const o of g.objects) o.users = [];   // nessuno sta usando niente appena si apre
  rollWishes(g);
  return g;
}

// ---------------------------------------------------------------- utilità
export const timeText = g => `${String(Math.floor(g.minute / 60)).padStart(2, '0')}:${String(Math.floor(g.minute % 60)).padStart(2, '0')}`;
export const dayText = g => `${DAYS[g.day % 7]} · giorno ${g.day + 1}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const other = (g, sim) => g.sims.find(s => s !== sim);
export const oa = sim => (sim.gender === 'lei' ? 'a' : 'o');   // andato/andata

/** Ambiente intorno a un punto: i mobili belli vicini lo alzano, i piatti sporchi lo abbassano (-10…+15). */
export function ambiente(g, x, y) {
  let a = 0;
  for (const o of g.objects) {
    const amb = TYPES[o.type].amb;
    if (!amb) continue;
    const f = footprint(o);
    const dx = Math.max(f.x - x, 0, x - (f.x + f.w)), dy = Math.max(f.y - y, 0, y - (f.y + f.d));
    if (dx <= 4 && dy <= 4) a += amb;
  }
  for (const d of g.dishes ?? []) if (Math.abs(d.x - x) <= 4 && Math.abs(d.y - y) <= 4) a -= 3;
  return clamp(a, -10, 15);
}
export function mood(sim, g = null) {
  const vals = Object.values(sim.needs);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const env = g && !sim.atWork ? ambiente(g, sim.x, sim.y) * 0.8 : 0;
  return Math.round(clamp(Math.min(avg + env, Math.min(...vals) + 35), 0, 100));   // un bisogno a terra rovina l'umore
}

/** Le due caselle sono separate da un muro (senza porta)? Solo per caselle vicine in orizzontale o verticale. */
export function wallBetween(g, x1, y1, x2, y2) {
  const k = y1 === y2 ? wkey('v', Math.max(x1, x2), y1) : wkey('h', x1, Math.max(y1, y2));
  const w = g.walls[k];
  return !!w && !w.door;
}
/** Un oggetto non può stare a cavallo di un muro (né in una porta). */
export function crossesWall(g, f) {
  for (const k in g.walls) {
    const [t, a, b] = k.split(':');
    const p = +a, q = +b;
    if (t === 'v' && p > f.x && p < f.x + f.w && q >= f.y && q < f.y + f.d) return true;
    if (t === 'h' && q > f.y && q < f.y + f.d && p >= f.x && p < f.x + f.w) return true;
  }
  return false;
}

/** Caselle occupate dagli oggetti (tappeti e simili si calpestano). */
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
  if (crossesWall(g, f)) return false;
  if (TYPES[o.type].passable) return true;
  for (const q of g.objects) {
    if (q.id === ignoreId || TYPES[q.type].passable) continue;
    const r = footprint(q);
    if (f.x < r.x + r.w && f.x + f.w > r.x && f.y < r.y + r.d && f.y + f.d > r.y) return false;
  }
  for (const s of g.sims) if (!s.atWork && Math.floor(s.x) >= f.x && Math.floor(s.x) < f.x + f.w && Math.floor(s.y) >= f.y && Math.floor(s.y) < f.y + f.d) return false;
  return true;
}

/** Percorso a caselle (8 direzioni, senza tagliare angoli né muri) dal Sim fino a una delle caselle goal. */
function findPath(g, sx, sy, goals) {
  const block = blocked(g);
  const start = `${Math.floor(sx)},${Math.floor(sy)}`;
  const goalSet = new Set(goals.map(([x, y]) => `${x},${y}`));
  const prev = new Map([[start, null]]);
  const queue = [[Math.floor(sx), Math.floor(sy)]];
  const free = (x, y) => x >= 0 && y >= 0 && x < g.W && y < g.H && !block.has(`${x},${y}`);
  for (let qi = 0; qi < queue.length; qi++) {
    const [x, y] = queue[qi];
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
      if (!dx || !dy ? wallBetween(g, x, y, nx, ny)
        : wallBetween(g, x, y, x + dx, y) || wallBetween(g, x + dx, y, nx, ny) || wallBetween(g, x, y, x, y + dy) || wallBetween(g, x, y + dy, nx, ny)) continue;
      prev.set(nk, key);
      queue.push([nx, ny]);
    }
  }
  return null;
}

/** Caselle da cui si usa un oggetto: davanti prima, poi tutte quelle intorno (senza un muro in mezzo). */
function useTiles(g, o) {
  const f = footprint(o);
  const front = [];
  if (o.rot === 0) for (let x = f.x; x < f.x + f.w; x++) front.push([x, f.y + f.d, x, f.y + f.d - 1]);
  if (o.rot === 1) for (let y = f.y; y < f.y + f.d; y++) front.push([f.x + f.w, y, f.x + f.w - 1, y]);
  if (o.rot === 2) for (let x = f.x; x < f.x + f.w; x++) front.push([x, f.y - 1, x, f.y]);
  if (o.rot === 3) for (let y = f.y; y < f.y + f.d; y++) front.push([f.x - 1, y, f.x, y]);
  const around = [];
  for (let x = f.x; x < f.x + f.w; x++) around.push([x, f.y - 1, x, f.y], [x, f.y + f.d, x, f.y + f.d - 1]);
  for (let y = f.y; y < f.y + f.d; y++) around.push([f.x - 1, y, f.x, y], [f.x + f.w, y, f.x + f.w - 1, y]);
  const block = blocked(g);
  const ok = ([x, y, ox, oy]) => x >= 0 && y >= 0 && x < g.W && y < g.H && !block.has(`${x},${y}`) && !wallBetween(g, x, y, ox, oy);
  const f1 = front.filter(ok);
  return f1.length ? f1 : around.filter(ok);
}
const nearTiles = (x, y) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([dx, dy]) => [Math.floor(x) + dx, Math.floor(y) + dy]);

// ---------------------------------------------------------------- ordini
/** Mette in coda un'azione (oggetto, pavimento, altro Sim, piatti). Restituisce un messaggio se non si può. */
export function order(g, sim, cmd) {
  if (sim.atWork) return `${sim.name} è al lavoro.`;
  if (sim.cur?.id === 'vaiLavoro') return `${sim.name} sta uscendo per andare al lavoro.`;
  if (sim.queue.length >= 4) return 'Ha già troppe cose da fare: aspetta o togline una.';
  sim.queue.push({ ...cmd, by: 'you' });
  sim.idle = 0;
  return null;
}
export function cancel(g, sim, i) {
  if (i === 0 && sim.cur) { if (sim.cur.id !== 'vaiLavoro') stopCur(sim, g); return; }
  sim.queue.splice(sim.cur ? i - 1 : i, 1);
}
function stopCur(sim, g = null) {
  const c = sim.cur;
  if (c?.obj) freeObject(c);
  if (c?.from) { sim.x = c.from[0]; sim.y = c.from[1]; }   // si alza dal letto, dal divano…
  if (c?.partner && g) { const p = g.sims.find(s => s.id === c.partner); if (p?.cur?.partner === sim.id) { if (p.cur.from) { p.x = p.cur.from[0]; p.y = p.cur.from[1]; } p.cur = null; p.pose = null; } }
  sim.cur = null;
  sim.path = [];
  sim.pose = null;
}
function freeObject(c) {
  if (c.objRef?.users) c.objRef.users = c.objRef.users.filter(u => u.sim !== c.simId);
}

/** Azioni che si possono fare con un oggetto. */
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
    const amount = Math.round(60 + value * 0.015);
    g.money -= amount;
    g.bills = g.day + 7;
    notify(`🧾 Bollette pagate: ${amount} €${g.money < 0 ? ' · siete in rosso!' : ''}`);
  }
  rollWishes(g);
}

// ---------------------------------------------------------------- desideri del giorno e guida iniziale
export const WISHES = [
  { id: 'tv', text: 'Guardare la TV', emoji: '📺' }, { id: 'cucina', text: 'Cucinare un pasto', emoji: '🍳' },
  { id: 'doccia', text: 'Fare una doccia', emoji: '🚿' }, { id: 'gioca', text: 'Giocare al computer', emoji: '🎮' },
  { id: 'social', text: 'Chattare con gli amici', emoji: '📱' }, { id: 'leggi', text: 'Leggere un libro', emoji: '📖' },
  { id: 'balla', text: 'Ballare con lo stereo', emoji: '💃' }, { id: 'allenati', text: 'Correre sul tapis roulant', emoji: '🏃' },
  { id: 'pisolino', text: 'Fare un pisolino', emoji: '😴' }, { id: 'abbraccia', text: 'Un abbraccio', emoji: '🤗' },
  { id: 'bacia', text: 'Un bacio', emoji: '💋' }, { id: 'chiacchiera', text: 'Chiacchierare un po\'', emoji: '💬' },
  { id: 'scherza', text: 'Ridere insieme', emoji: '😂' }, { id: 'balliamo', text: 'Ballare insieme', emoji: '💃' },
  { id: 'buy', text: 'Comprare qualcosa di nuovo', emoji: '🛍️' }, { id: 'vasca', text: 'Un bagno rilassante', emoji: '🛁' },
  { id: 'nuota', text: 'Fare una nuotata', emoji: '🏊' }, { id: 'chitarra', text: 'Suonare la chitarra', emoji: '🎸' },
  { id: 'dipingi', text: 'Dipingere un quadro', emoji: '🎨' }, { id: 'scacchi', text: 'Giocare a scacchi', emoji: '♟️' },
  { id: 'grigliata', text: 'Fare una grigliata', emoji: '🍖' }, { id: 'console', text: 'Giocare alla console', emoji: '🕹️' },
  { id: 'sparecchia', text: 'Rimettere in ordine la cucina', emoji: '🍽️' },
];
const WISH_REWARD = 80;

/** Due desideri al giorno per ciascuno, tra quelli possibili con gli oggetti che avete (più qualche acquisto). */
export function rollWishes(g) {
  if (g.wishDay === g.day) return;
  g.wishDay = g.day;
  const have = new Set(g.objects.flatMap(o => TYPES[o.type].actions));
  const possible = WISHES.filter(w => have.has(w.id) || SOCIAL.some(a => a.id === w.id) || w.id === 'buy' || w.id === 'sparecchia' || Math.random() < 0.2);
  for (const s of g.sims) s.wishes = [...possible].sort(() => Math.random() - 0.5).slice(0, 2).map(w => w.id);
}

export const GOALS = [
  { key: 'doccia', text: 'Fai fare una doccia', hint: 'Tocca la doccia nel bagno e scegli "Fai la doccia"', reward: 100 },
  { key: 'cucina', text: 'Cucina un pasto', hint: 'Tocca i fornelli in cucina: dopo si mangia al tavolo', reward: 100 },
  { key: 'sparecchia', text: 'Porta via i piatti sporchi', hint: 'Dopo mangiato tocca i piatti sul tavolo', reward: 80 },
  { key: 'job', text: 'Trova un lavoro', hint: 'Tocca 💼 Lavoro in basso e scegli un\'offerta', reward: 150 },
  { key: 'chiacchiera', text: 'Fate due chiacchiere', hint: 'Tocca l\'altro Sim e scegli "Chiacchiera"', reward: 100 },
  { key: 'buy', text: 'Compra un mobile nuovo', hint: 'Tocca 🛋️ Arreda → Compra, scegli un oggetto e trascinalo in casa', reward: 100 },
  { key: 'wall', text: 'Costruisci una stanza nuova', hint: 'Arreda → Costruisci → Muro: trascina il dito per tirare i muri', reward: 200 },
  { key: 'dormi', text: 'Andate a dormire insieme', hint: 'La sera tocca il letto in camera e scegli "Dormi" per tutti e due', reward: 100 },
  { key: 'promo', text: 'Ottieni una promozione', hint: 'Andate al lavoro di buon umore: bisogni alti, casa bella', reward: 300 },
];
export const currentGoal = g => GOALS.find(x => !g.goals.done.includes(x.key));

/** Qualcosa è successo (azione finita, acquisto, muro, assunzione, promozione): desideri e obiettivi. */
export function gameEvent(g, sim, key, notify) {
  const gl = GOALS.find(x => x.key === key);
  if (gl && !g.goals.done.includes(key)) {
    g.goals.done.push(key);
    g.money += gl.reward;
    notify(`🎯 Obiettivo completato: ${gl.text}! +${gl.reward} €`);
  }
  for (const s of sim ? [sim] : g.sims) {
    const i = s.wishes?.indexOf(key) ?? -1;
    if (i < 0) continue;
    s.wishes.splice(i, 1);
    g.money += WISH_REWARD;
    s.needs.svago = clamp(s.needs.svago + 15, 0, 100);
    notify(`⭐ Desiderio di ${s.name} esaudito: ${WISHES.find(w => w.id === key).text}! +${WISH_REWARD} €`);
    break;
  }
}

function simStep(g, sim, dt, before, notify) {
  const job = sim.job && CAREERS[sim.job.career];
  // Lavoro: mezz'ora prima esce di casa (va a piedi fino alla strada), alla fine torna con lo stipendio
  if (job && job.days.includes(g.day % 7)) {
    const leave = job.start * 60 - 30, back = job.end * 60;
    if (!sim.atWork && sim.cur?.id !== 'vaiLavoro' && before < leave && g.minute >= leave) goToWork(g, sim, notify);
    if (sim.atWork && before < back && g.minute >= back) backFromWork(g, sim, job, notify);
  }
  const decay = sim.atWork ? DECAY_WORK : DECAY;
  const sleeping = ['dormi', 'pisolino', 'divanoPisolino', 'amaca'].includes(sim.cur?.id);
  for (const [k] of NEEDS) {
    if (k === 'energia' && sleeping) continue;
    const slow = sleeping && (k === 'fame' || k === 'vescica') ? 0.4 : 1;   // di notte fame e vescica calano piano
    sim.needs[k] = clamp(sim.needs[k] - (decay[k] * slow * dt) / 60, 0, 100);
  }
  if (sim.atWork) return;
  const leaving = sim.cur?.id === 'vaiLavoro';

  // Vescica quasi vuota: si lascia tutto (anche il sonno) e si corre in bagno, se c'è
  const toilet = g.objects.find(o => TYPES[o.type].actions.includes('bagno'));
  if (!leaving && sim.needs.vescica < 12 && toilet && sim.cur?.id !== 'bagno' && !sim.queue.some(c => c.action === 'bagno') && !sim.cur?.social) {
    stopCur(sim, g);
    sim.queue.unshift({ kind: 'obj', obj: toilet.id, action: 'bagno', by: 'auto' });
  }
  if (sim.needs.vescica <= 0) {
    sim.needs.vescica = 100;
    sim.needs.igiene = clamp(sim.needs.igiene - 45, 0, 100);
    sim.needs.svago = clamp(sim.needs.svago - 20, 0, 100);
    if (!leaving) stopCur(sim, g);
    notify(`😳 ${sim.name} non ha fatto in tempo ad arrivare in bagno…`);
  }
  if (sim.needs.energia <= 0 && !sleeping && !leaving) {
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
    if (g.auto && sim.idle > 6) autonomy(g, sim);
    return;
  }
  const c = sim.cur;
  if (c.state === 'walk') return walkStep(g, sim, dt, notify);
  doStep(g, sim, dt, notify);
}

function goToWork(g, sim, notify) {
  stopCur(sim, g);
  sim.queue = [];
  const path = findPath(g, sim.x, sim.y, [exitTile(g)]);
  notify(`🚗 ${sim.name} esce per andare al lavoro (${CAREERS[sim.job.career].name}).`);
  if (!path) { sim.atWork = true; return; }
  sim.cur = { id: 'vaiLavoro', label: 'Va al lavoro', emoji: '🚗', state: 'walk', simId: sim.id };
  sim.path = path;
}

function backFromWork(g, sim, job, notify) {
  sim.atWork = false;
  const hours = job.end - job.start;
  const pay = job.pay[sim.job.level] * hours;
  g.money += pay;
  const m = mood(sim, g);
  const skill = job.skill ? sim.skills[job.skill] * 2 : 0;
  sim.job.perf += Math.round((m - 45) / 2 + 8 + skill);
  sim.job.days++;
  let text = `🏠 ${sim.name} è tornat${oa(sim)} dal lavoro: +${pay} €`;
  if (sim.job.perf >= 100 && sim.job.level < 4) {
    sim.job.level++;
    sim.job.perf = 0;
    text = `🎉 ${sim.name} è stat${oa(sim)} promoss${oa(sim)}: ${job.titles[sim.job.level]}! (+${pay} €)`;
    gameEvent(g, sim, 'promo', notify);
  } else if (sim.job.perf < -60) {
    sim.job.perf = -60;
    text += ' · il capo dice che deve arrivare più di buon umore';
  }
  const [ex, ey] = exitTile(g);
  sim.x = ex + 0.5; sim.y = ey + 0.5;
  sim.idle = 10;   // appena tornato pensa subito a cosa fare
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
  if (cmd.kind === 'dish') {
    const d = g.dishes.find(x => x.id === cmd.id);
    if (!d) return;
    const path = findPath(g, sim.x, sim.y, nearTiles(d.x, d.y));
    if (!path) return say(`${sim.name} non riesce ad arrivare ai piatti.`);
    sim.cur = { ...ACTIONS.sparecchia, dish: d.id, state: 'walk', t: 0, simId: sim.id, by: cmd.by };
    sim.path = path;
    return;
  }
  if (cmd.kind === 'social') {
    const p = other(g, sim);
    const a = SOCIAL.find(x => x.id === cmd.action);
    if (p.atWork || p.cur?.id === 'vaiLavoro') return say(`${p.name} è al lavoro.`);
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
  const needSeat = a.pose === 'sit' || a.pose === 'lie' || a.pose === 'swim' || a.inside;
  let seat = null;
  if (needSeat && seats.length) {
    seat = seats.findIndex((_, i) => !o.users.some(u => u.seat === i));
    if (seat < 0) return say(`${T.name}: è occupato.`);
  } else if (o.users.length && !seats.length) return say(`${T.name}: lo sta usando ${other(g, sim).name}.`);
  const path = findPath(g, sim.x, sim.y, useTiles(g, o));
  if (!path) return say(`${sim.name} non riesce ad arrivare a: ${T.name}.`);
  o.users.push({ sim: sim.id, seat });
  sim.cur = { ...a, obj: o.id, objRef: o, seat, q: T.q ?? 1, state: 'walk', t: 0, simId: sim.id, by: cmd.by };
  sim.path = path;
}

function walkStep(g, sim, dt, notify) {
  let move = WALK * dt;
  while (move > 0 && sim.path.length) {
    const [tx, ty] = sim.path[0];
    const dx = tx + 0.5 - sim.x, dy = ty + 0.5 - sim.y, d = Math.hypot(dx, dy);
    if (Math.abs(dx - dy) > 0.01) sim.face = dx - dy > 0 ? 1 : -1;
    sim.back = dx + dy < -0.01;
    if (d <= move) { sim.x = tx + 0.5; sim.y = ty + 0.5; sim.path.shift(); move -= d; }
    else { sim.x += (dx / d) * move; sim.y += (dy / d) * move; move = 0; }
  }
  sim.walk += dt * 6;
  if (sim.path.length) return;
  const c = sim.cur;
  if (c.id === 'go') { sim.cur = null; return; }
  if (c.id === 'vaiLavoro') { sim.cur = null; sim.atWork = true; return; }
  if (c.social) return startSocial(g, sim, notify);
  if (c.dish) {
    const d = g.dishes.find(x => x.id === c.dish);
    if (!d) { sim.cur = null; return; }
    faceTo(sim, d.x, d.y);
    c.state = 'do';
    return;
  }
  // Arrivato: si siede, si sdraia o entra (doccia, vasca, piscina), oppure resta in piedi davanti
  const o = c.objRef;
  if (c.seat != null) {
    const [lx, ly] = TYPES[o.type].seats[c.seat];
    const [x, y] = point(o, lx, ly);
    c.from = [sim.x, sim.y];
    sim.x = x; sim.y = y;
    sim.pose = c.pose ?? null;
    // seduto guarda "in avanti" rispetto al mobile
    const [fx, fy] = point(o, lx, ly + 1);
    faceTo(sim, fx, fy);
  } else {
    const f = footprint(o);
    faceTo(sim, f.x + f.w / 2, f.y + f.d / 2);
    sim.pose = null;
  }
  c.state = 'do';
  c.t = 0;
}
function faceTo(sim, x, y) {
  const dx = x - sim.x, dy = y - sim.y;
  sim.face = dx - dy > 0 ? 1 : -1;
  sim.back = dx + dy < 0;
}

function startSocial(g, sim, notify) {
  const c = sim.cur;
  const p = g.sims.find(s => s.id === c.partner);
  const busy = p.atWork || p.cur?.id === 'vaiLavoro' || p.cur?.id === 'dormi' || p.cur?.inside || p.cur?.social;
  if (busy) { if (c.by !== 'auto') notify(`${p.name} adesso non può.`); sim.cur = null; return; }
  if (g.rel < c.min) {   // rapporto troppo basso: rifiuta
    g.rel = clamp(g.rel - 3, 0, 100);
    notify(`🙅 ${p.name} non ne ha voglia: prima migliorate il rapporto (chiacchierate, scherzate).`);
    sim.cur = null;
    return;
  }
  stopCur(p, g);
  p.queue = [];
  faceTo(sim, p.x, p.y);
  faceTo(p, sim.x, sim.y);
  c.state = 'do';
  c.t = 0;
  p.cur = { ...c, partner: sim.id, simId: p.id, state: 'do', t: 0, follower: true };
}

function doStep(g, sim, dt, notify) {
  const c = sim.cur;
  c.t += dt;
  const frac = c.until ? dt / 60 : dt / c.dur;
  for (const [k, v] of Object.entries(c.gain ?? {})) sim.needs[k] = clamp(sim.needs[k] + v * frac * (v > 0 ? c.q ?? 1 : 1), 0, 100);
  if (c.skill) sim.skills[c.skill] = Math.min(10, (sim.skills[c.skill] ?? 0) + dt / 60 * 0.6 / (1 + (sim.skills[c.skill] ?? 0) * 0.15));
  if (c.social && !c.follower) g.rel = clamp(g.rel + (c.rel * dt) / c.dur, 0, 100);
  if (c.dance || c.run) sim.walk += dt * 8;
  const done = c.until ? sim.needs[c.until] >= 99.5 : c.t >= c.dur;
  if (!done) return;
  if (c.id === 'cucina' || c.id === 'grigliata') {   // il pasto: più bravo in cucina, più sazia
    const bonus = Math.round(sim.skills.cucina * 2 * (c.q ?? 1));
    sim.needs.fame = clamp(sim.needs.fame + bonus, 0, 100);
    if (Math.random() < 0.12 - sim.skills.cucina * 0.01) notify(`🔥 ${sim.name} ha bruciato un po' il pasto… si mangia lo stesso.`);
  }
  if (c.special === 'quadro') {   // il quadro si vende: più creatività, più soldi
    const price = Math.round(20 + sim.skills.creativita * 18 + Math.random() * 25);
    g.money += price;
    notify(`🎨 ${sim.name} ha venduto un quadro: +${price} €`);
  }
  if (c.dish) g.dishes = g.dishes.filter(d => d.id !== c.dish);
  if (c.special === 'jobs') notify('__jobs__' + sim.id);
  if (c.id === 'dormi' ? g.sims.every(s => s === sim || s.cur?.id === 'dormi') : true) gameEvent(g, sim, c.id, notify);
  // Dopo mangiato restano i piatti: sul tavolo (se si è mangiato lì) o per terra vicino
  if (c.dishes && g.dishes.length < 10) {
    const o = c.objRef;
    const top = o ? TYPES[o.type].top : 0;
    const [dx, dy] = o && c.seat != null ? point(o, TYPES[o.type].seats[c.seat][0], TYPES[o.type].seats[c.seat][1] + (TYPES[o.type].seats[c.seat][1] < 1 ? 0.45 : -0.45)) : [sim.x, sim.y];
    g.dishes.push({ id: Math.random().toString(36).slice(2, 8), x: dx, y: dy, h: top ?? 0 });
  }
  const then = c.then;
  const from = c.from;
  freeObject(c);
  sim.cur = null;
  sim.pose = null;
  if (from) { sim.x = from[0]; sim.y = from[1]; }
  if (then === 'mangia') {   // dopo aver cucinato si mangia al tavolo (se c'è un posto libero)
    const table = g.objects.find(o => TYPES[o.type].eat && (o.users ?? []).length < TYPES[o.type].seats.length);
    if (table) sim.queue.unshift({ kind: 'obj', obj: table.id, action: 'mangia', by: 'auto' });
    else sim.cur = { ...ACTIONS.mangia, state: 'do', t: 0, simId: sim.id, pose: null };
  }
}

// ---------------------------------------------------------------- libero arbitrio
function autonomy(g, sim) {
  sim.idle = 0;
  const needs = Object.entries(sim.needs).sort((a, b) => a[1] - b[1]);
  for (const [need, val] of needs) {
    if (val > 55) break;
    if (need === 'socialita') {
      const p = other(g, sim);
      if (!p.atWork && p.cur?.id !== 'vaiLavoro' && !p.cur?.inside && p.cur?.id !== 'dormi' && !p.cur?.social) {
        sim.queue.push({ kind: 'social', action: g.rel > 60 && Math.random() < 0.4 ? 'abbraccia' : 'chiacchiera', by: 'auto' });
        return;
      }
      continue;
    }
    if (need === 'energia' && val > 30 && g.minute > 8 * 60 && g.minute < 21 * 60) continue;   // di giorno si dorme solo se stanchissimi
    // L'oggetto libero che dà più punti per quel bisogno (i mobili migliori valgono di più)
    let best = null;
    for (const o of g.objects) {
      const T = TYPES[o.type];
      const users = o.users ?? [];
      const seats = T.seats?.length ?? 0;
      if (seats ? users.length >= seats : users.length) continue;
      for (const id of T.actions) {
        const a = ACTIONS[id];
        let gain = (a.gain?.[need] ?? 0) * (T.q ?? 1);
        if (a.then === 'mangia' && need === 'fame') gain = 65 * (T.q ?? 1);
        if (a.special) gain = 0;
        if (gain > 0 && (!best || gain > best.gain)) best = { o, a, gain };
      }
    }
    if (best) { sim.queue.push({ kind: 'obj', obj: best.o.id, action: best.a.id, by: 'auto' }); return; }
  }
  // Tutto a posto: se ci sono piatti sporchi, ogni tanto li porta via
  if (g.dishes.length && Math.random() < 0.5) sim.queue.push({ kind: 'dish', id: g.dishes[0].id, by: 'auto' });
}
