// Simulazione di GA Life: tempo, bisogni, azioni, percorsi su più piani (tavernetta, piano terra, primo piano)
// collegati dalle scale, lavoro (a piedi o in auto), rapporto di coppia, ambiente, stati d'animo, piatti
// sporchi, pulizie, guasti, incendi, ladri, posta e bollette, pizza a domicilio e "libero arbitrio".
import { TYPES, ACTIONS, SOCIAL, NEEDS, footprint, point } from './catalog.js';
import { familyTick, proposal, tryBaby, wedding, petDone, PET_ACTIONS, celebrate, remember } from './family.js';

export const DAYS = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
export const SPEEDS = [0, 2, 8, 30];   // minuti di gioco al secondo: pausa, normale, veloce, velocissimo
export const LEVELS = [[-1, 'Tavernetta'], [0, 'Piano terra'], [1, 'Primo piano']];
const WALK = 1.6;                       // caselle per minuto di gioco
const TEEN_NO = new Set(['drink', 'aperitivo', 'lavoro', 'giocattoli']);
const KID_NO = new Set(['cucina', 'grigliata', 'lavoretti', 'mobiletto', 'drink', 'aperitivo', 'pesi', 'allenati', 'ripara', 'spegni', 'paga', 'lavoro', 'programma', 'riempi', 'dipingi']);

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
  liceo: { name: 'Liceo', emoji: '🎒', start: 8, end: 15, days: [0, 1, 2, 3, 4], pay: [0, 0, 0, 0, 0], skill: 'logica', school: true,
    titles: ['Voto 5', 'Voto 6', 'Voto 7', 'Voto 8', 'Voto 10'] },
  scuola: { name: 'Scuola', emoji: '🎒', start: 8, end: 14, days: [0, 1, 2, 3, 4], pay: [0, 0, 0, 0, 0], skill: 'logica', school: true,
    titles: ['Voto 5', 'Voto 6', 'Voto 7', 'Voto 8', 'Voto 10'] },
  meccanico: { name: 'Meccanico', emoji: '🔧', start: 8, end: 16, days: [0, 1, 2, 3, 4], pay: [14, 20, 27, 36, 48], skill: 'manualita',
    titles: ['Apprendista', 'Gommista', 'Meccanico', 'Capo officina', 'Titolare dell\'officina'] },
};

// ---------------------------------------------------------------- lotto, casa, muri
export const LOT = { W: 24, H: 20 };
const OX = 3, OY = 2, HW = 14, HD = 11;          // casa iniziale: angolo e misure
const DOOR_X = OX + 11;                           // porta d'ingresso (sul muro davanti)
export const exitTile = g => [g.exit?.[0] ?? DOOR_X, g.H - 1];   // dove si prende l'auto (se non ce n'è una vostra)

/*
 * Ogni piano ha pavimenti (una casella può non averlo: null) e muri. Muri: un pezzo per lato di casella.
 * 'v:x:y' è il muro sulla linea verticale x tra (x-1, y) e (x, y); 'h:x:y' sulla linea orizzontale y tra (x, y-1)
 * e (x, y). Valore: { door, garage, win, color }.
 */
export const wkey = (k, x, y) => `${k}:${x}:${y}`;
export const level = (g, lv) => g.levels[lv];
export const floorAt = (g, lv, x, y) => (x < 0 || y < 0 || x >= g.W || y >= g.H ? null : g.levels[lv].floors[y * g.W + x]);
function addLine(walls, k, fixed, from, to, extra = {}) {
  for (let i = from; i < to; i++) walls[k === 'h' ? wkey('h', i, fixed) : wkey('v', fixed, i)] = { ...(extra[i] ?? {}) };
}
function defaultHouse() {
  const walls = {};
  const win = { win: true };
  addLine(walls, 'h', OY, OX, OX + HW, { [OX + 2]: win, [OX + 6]: win, [OX + 8]: win, [OX + 12]: win });
  addLine(walls, 'h', OY + HD, OX, OX + HW, { [OX + 3]: win, [OX + 7]: win, [DOOR_X]: { door: true } });
  addLine(walls, 'v', OX, OY, OY + HD, { [OY + 7]: win, [OY + 9]: win });
  addLine(walls, 'v', OX + HW, OY, OY + HD, { [OY + 2]: win, [OY + 7]: win });
  addLine(walls, 'v', OX + 4, OY, OY + 5);
  addLine(walls, 'h', OY + 4, OX, OX + 4, { [OX + 1]: { door: true } });
  addLine(walls, 'v', OX + 10, OY, OY + 5);
  addLine(walls, 'h', OY + 5, OX + 4, OX + 10, { [OX + 6]: { door: true } });
  return walls;
}
function defaultFloors(W, H) {
  const floors = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const rx = x - OX, ry = y - OY;
      let f = 'erba';
      if (rx >= 0 && rx < HW && ry >= 0 && ry < HD) f = ry < 4 && rx < 4 ? 'bagno' : ry < 5 && rx >= 4 && rx < 10 ? 'camera' : ry < 5 && rx >= 10 ? 'cucina' : 'legno';
      else if (x === DOOR_X && y >= OY + HD) f = 'pietra';
      floors.push(f);
    }
  }
  return floors;
}
const emptyLevel = (W, H) => ({ floors: Array(W * H).fill(null), walls: {} });

// ---------------------------------------------------------------- partita nuova
export function newGame(simsInfo) {
  const { W, H } = LOT;
  const o = (type, rx, ry, rot = 0, color, abs = false) => ({ id: uid(), type, x: abs ? rx : OX + rx, y: abs ? ry : OY + ry, rot, color, lv: 0 });
  const objects = [
    o('doccia', 0, 0), o('wc', 1, 0), o('lavandino', 2, 0),
    o('letto', 6, 0, 0, '#60a5fa'), o('comodino', 5, 0), o('comodino', 8, 0), o('armadio', 4, 0, 1), o('pianta', 9, 0),
    o('frigo', 13, 0, 3), o('fornello', 13, 1, 3), o('lavello', 13, 2, 3), o('bancone', 13, 3, 3), o('tavolo', 10, 2, 0),
    o('divano', 3, 9, 2, '#ef4444'), o('tv', 3, 7, 0), o('tappeto', 3, 7, 0, '#1d4ed8'), o('computer', 0, 6, 1),
    o('libreria', 0, 9, 1), o('stereo', 13, 9, 3), o('pianta', 13, 10), o('poltrona', 6, 8, 3, '#f59e0b'),
    o('albero', 1, 1, 0, null, true), o('albero', 21, 3, 0, null, true), o('albero', 22, 16, 0, null, true), o('pino', 0, 17, 0, null, true),
    o('pino', 20, 11, 0, null, true), o('aiuola', OX + 2, OY + HD, 0, '#f472b6', true), o('aiuola', OX + 3, OY + HD, 0, '#facc15', true),
    o('aiuola', OX + 7, OY + HD, 0, '#a78bfa', true), o('aiuola', OX + 8, OY + HD, 0, '#f87171', true),
    o('panchina', 19, 7, 3, null, true), o('lampione', DOOR_X + 1, 16, 0, null, true), o('cassetta', DOOR_X - 1, H - 2, 0, null, true),
  ];
  const sims = simsInfo.map((s, i) => ({
    id: i, name: s.name, gender: s.gender, look: s.look,
    needs: { fame: 70, energia: 80, igiene: 75, vescica: 70, svago: 60, socialita: 65 },
    x: OX + 6.5 + i, y: OY + 7.5, lv: 0, path: [], queue: [], cur: null, face: 1, walk: 0,
    skills: { cucina: 0, fitness: 0, logica: 0, creativita: 0, carisma: 0, manualita: 0 }, job: null, atWork: false, alerted: {}, idle: 0, wishes: [], moodlets: [],
  }));
  const g = {
    v: 4, day: 0, minute: 8 * 60, money: 2000, speed: 1, W, H, objects, sims,
    levels: { '-1': emptyLevel(W, H), 0: { floors: defaultFloors(W, H), walls: defaultHouse() }, 1: emptyLevel(W, H) },
    rel: 60, bills: 7, bill: null, power: true, auto: true, wishDay: -1, goals: { done: [] }, dishes: [], exit: [DOOR_X, H - 1],
    town: newTown(), couple: { stage: 'insieme' }, pets: [],
  };
  g.memories = [{ day: 0, emoji: '🏡', text: `${sims.map(s => s.name).join(' e ')} vanno a vivere insieme` }];
  rollWishes(g);
  return g;
}
const uid = () => Math.random().toString(36).slice(2, 9);

/** Partite delle versioni precedenti: si portano al lotto grande e ai piani, senza perdere niente. */
export function migrate(g) {
  if ((g.v ?? 1) < 3) {   // casa piccola senza giardino → lotto grande
    const ox = 3, oy = 2, oldW = g.W, oldH = g.H;
    const walls = {};
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
    for (const s of g.sims) { s.x += ox; s.y += oy; }
    g.walls = walls;
    g.floors = floors;
    g.W = LOT.W; g.H = LOT.H;
    g.exit = [ox + oldW - 1, LOT.H - 1];
    g.objects.push({ id: uid(), type: 'albero', x: 20, y: 3, rot: 0 }, { id: uid(), type: 'albero', x: 21, y: 16, rot: 0 }, { id: uid(), type: 'pino', x: 1, y: 16, rot: 0 });
    g.v = 3;
  }
  if (g.v < 4) {   // piani: quello di prima diventa il piano terra; tavernetta e primo piano vuoti; arriva la cassetta della posta
    g.levels = { '-1': emptyLevel(g.W, g.H), 0: { floors: g.floors, walls: g.walls }, 1: emptyLevel(g.W, g.H) };
    delete g.floors;
    delete g.walls;
    for (const o of g.objects) o.lv = 0;
    const box = { id: uid(), type: 'cassetta', x: (g.exit?.[0] ?? DOOR_X) - 1, y: g.H - 2, rot: 0, lv: 0 };
    if (canPlace(g, box)) g.objects.push(box);
    g.v = 4;
  }
  g.town ??= newTown();
  g.couple ??= { stage: 'insieme' };
  g.pets ??= [];
  g.memories ??= [];
  for (const s of g.sims) if (s.kid) s.since ??= g.day * 1440 + g.minute;
  for (const o of g.town.home?.objects ?? []) o.users = [];
  g.dishes ??= [];
  for (const d of g.dishes) d.lv ??= 0;
  g.power ??= true;
  g.wishDay ??= -1;
  g.goals ??= { done: [] };
  for (const s of g.sims) {
    s.wishes ??= [];
    s.moodlets ??= [];
    s.lv ??= 0;
    s.path = [];
    s.skills = { cucina: 0, fitness: 0, logica: 0, creativita: 0, carisma: 0, manualita: 0, ...s.skills };
  }
  for (const o of g.objects) { o.users = []; o.lv ??= 0; }
  for (const s of g.sims) if (s.cur && s.cur.state !== 'do') { s.cur = null; s.queue = []; }   // percorsi interrotti: si ricomincia
  rollWishes(g);
  return g;
}

// ---------------------------------------------------------------- utilità
export const timeText = g => `${String(Math.floor(g.minute / 60)).padStart(2, '0')}:${String(Math.floor(g.minute % 60)).padStart(2, '0')}`;
export const dayText = g => `${DAYS[g.day % 7]} · giorno ${g.day + 1}`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const other = (g, sim) => g.sims.find(s => s !== sim && !s.npc && !s.kid);   // l'altro della coppia (o un genitore)
/** Oggetti di casa vostra (anche quando siete fuori, in città). */
/** Figli nati in casa (bambini, ragazzi o già grandi): non sono la coppia. */
export const inFamily = s => !s.npc && s.id > 1;
export const homeObjects = g => (g.town?.at ? g.town.home.objects : g.objects);

// ---------------------------------------------------------------- gente della città e amici
/** Un Sim "non giocabile": un abitante della città, al parco o in visita a casa vostra. */
export function makeNpc(p, x, y, extra = {}) {
  const r = () => 45 + Math.random() * 45;
  return {
    id: 'n' + p.key, key: p.key, npc: true, name: p.name, gender: p.gender, look: { model: p.model },
    needs: { fame: r(), energia: r(), igiene: r(), vescica: r(), svago: r(), socialita: r() },
    x, y, lv: 0, path: [], queue: [], cur: null, face: 1, walk: 0, skills: {}, job: null, atWork: false, alerted: {}, idle: Math.random() * 6,
    wishes: [], moodlets: [], ...extra,
  };
}
/** Amicizia tra due Sim: per la coppia è il rapporto, con gli altri l'amicizia (0-100). */
export function relOf(g, a, b) {
  if (inFamily(a) || inFamily(b)) return 100;   // figli (anche grandi): in famiglia ci si vuole bene
  const n = a.npc ? a : b.npc ? b : null;
  if (!n) return g.rel;
  if (a.npc && b.npc) return 50;
  return g.town.friends[n.key]?.rel ?? 0;
}
function addRel(g, a, b, v, notify) {
  if (inFamily(a) || inFamily(b)) return;
  const n = a.npc ? a : b.npc ? b : null;
  if (!n) { g.rel = clamp(g.rel + v, 0, 100); return; }
  if (a.npc && b.npc) return;
  const f = (g.town.friends[n.key] ??= { name: n.name, gender: n.gender, model: n.look.model, rel: 0 });
  const before = f.rel;
  f.rel = clamp(f.rel + v, 0, 100);
  const you = a.npc ? b : a;
  if (before < 30 && f.rel >= 30) {
    remember(g, '🤝', `${you.name} ha conosciuto ${n.name}: ora sono amici`);
    notify(`🤝 ${you.name} e ${n.name} sono diventati amici! Potete invitar${n.gender === 'lei' ? 'la' : 'lo'} a casa dal telefono (tocca il tuo Sim).`);
    gameEvent(g, you, 'amico', notify);
  }
  if (before < 70 && f.rel >= 70) notify(`💛 ${n.name} adesso è un${n.gender === 'lei' ? '\'' : 'o'} amic${n.gender === 'lei' ? 'a' : 'o'} del cuore!`);
}
/** Un amico che è venuto a trovarvi se ne va: cammina fino alla strada e sparisce. */
function sendAway(g, sim, notify) {
  stopCur(sim, g);
  sim.queue = [];
  sim.leaving = true;
  notify(`👋 ${sim.name} vi saluta e torna a casa.`);
  const path = findPath(g, sim, [[...exitTile(g), 0]]);
  if (!path) { sim.gone = true; return; }
  sim.cur = { id: 'vaiVia', label: 'Torna a casa', emoji: '👋', state: 'walk', simId: sim.id };
  sim.path = path;
}
const now = g => g.day * 1440 + g.minute;
export const oa = sim => (sim.gender === 'lei' ? 'a' : 'o');   // andato/andata

/** Stato d'animo temporaneo (come le "moodlet" di The Sims): alza o abbassa l'umore per un po'. */
export function addMood(g, sim, id, emoji, text, val, mins) {
  sim.moodlets = (sim.moodlets ?? []).filter(m => m.id !== id);
  sim.moodlets.push({ id, emoji, text, val, until: now(g) + mins });
}
export function moodlets(g, sim) {
  const list = (sim.moodlets ?? []).filter(m => m.until > now(g));
  if (!g.power) list.push({ id: 'corrente', emoji: '🔌', text: 'Senza corrente', val: -10 });
  if (sim.needs.igiene < 20) list.push({ id: 'puzza', emoji: '🦨', text: 'Puzzolente', val: -8 });
  const amb = sim.atWork ? 0 : ambiente(g, sim.x, sim.y, sim.lv);
  if (amb >= 10) list.push({ id: 'casa', emoji: '🏡', text: 'Casa bellissima', val: 0 });
  if (amb < 0) list.push({ id: 'disordine', emoji: '🗑️', text: 'Disordine', val: 0 });
  return list;
}

/** Ambiente intorno a un punto: i mobili belli vicini lo alzano, piatti sporchi e oggetti sporchi lo abbassano. */
export function ambiente(g, x, y, lv = 0) {
  let a = 0;
  for (const o of g.objects) {
    if ((o.lv ?? 0) !== lv) continue;
    const T = TYPES[o.type];
    const f = footprint(o);
    const dx = Math.max(f.x - x, 0, x - (f.x + f.w)), dy = Math.max(f.y - y, 0, y - (f.y + f.d));
    if (dx > 4 || dy > 4) continue;
    if (T.amb && !o.broken && !o.inUse) a += T.amb;
    if ((o.dirt ?? 0) >= 4) a -= 2;
    if (o.broken) a -= 1;
  }
  for (const d of g.dishes ?? []) if ((d.lv ?? 0) === lv && Math.abs(d.x - x) <= 4 && Math.abs(d.y - y) <= 4) a -= 3;
  return clamp(a, -10, 15);
}
export function mood(sim, g = null) {
  const vals = Object.values(sim.needs);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  let extra = 0;
  if (g) {
    if (!sim.atWork) extra += ambiente(g, sim.x, sim.y, sim.lv) * 0.8;
    for (const m of moodlets(g, sim)) extra += m.val;
  }
  return Math.round(clamp(Math.min(avg + extra, Math.min(...vals) + 35 + Math.max(0, extra)), 0, 100));
}

/** Le due caselle (vicine) dello stesso piano sono separate da un muro senza porta? */
export function wallBetween(g, lv, x1, y1, x2, y2) {
  const k = y1 === y2 ? wkey('v', Math.max(x1, x2), y1) : wkey('h', x1, Math.max(y1, y2));
  const w = g.levels[lv].walls[k];
  return !!w && !w.door && !w.garage;
}
/** Un oggetto non può stare a cavallo di un muro (né in una porta). walls: i muri del suo piano. */
export function crossesWall(walls, f) {
  for (const k in walls) {
    const [t, a, b] = k.split(':');
    const p = +a, q = +b;
    if (t === 'v' && p > f.x && p < f.x + f.w && q >= f.y && q < f.y + f.d) return true;
    if (t === 'h' && q > f.y && q < f.y + f.d && p >= f.x && p < f.x + f.w) return true;
  }
  return false;
}

/** Caselle occupate dagli oggetti di un piano (tappeti e auto in uscita si calpestano). */
function blocked(g, lv) {
  const b = new Set();
  for (const o of g.objects) {
    if ((o.lv ?? 0) !== lv || TYPES[o.type].passable || (o.inUse != null && o.inUse >= 0)) continue;   // auto fuori casa: posto libero
    const f = footprint(o);
    for (let x = f.x; x < f.x + f.w; x++) for (let y = f.y; y < f.y + f.d; y++) b.add(`${x},${y}`);
  }
  return b;
}
export function canPlace(g, o, ignoreId = null) {
  const lv = o.lv ?? 0;
  const f = footprint(o);
  if (f.x < 0 || f.y < 0 || f.x + f.w > g.W || f.y + f.d > g.H) return false;
  for (let x = f.x; x < f.x + f.w; x++) for (let y = f.y; y < f.y + f.d; y++) if (floorAt(g, lv, x, y) == null) return false;
  if (crossesWall(g.levels[lv].walls, f)) return false;
  if (TYPES[o.type].stairs && lv >= 1) return false;   // sopra il primo piano non c'è niente
  if (TYPES[o.type].passable) return true;
  for (const q of g.objects) {
    if (q.id === ignoreId || (q.lv ?? 0) !== lv || TYPES[q.type].passable) continue;
    const r = footprint(q);
    if (f.x < r.x + r.w && f.x + f.w > r.x && f.y < r.y + r.d && f.y + f.d > r.y) return false;
  }
  for (const s of g.sims) if (!s.atWork && s.lv === lv && Math.floor(s.x) >= f.x && Math.floor(s.x) < f.x + f.w && Math.floor(s.y) >= f.y && Math.floor(s.y) < f.y + f.d) return false;
  return true;
}

/** Scale: casella da cui si sale (davanti, al piano della scala) e casella dove si arriva (dietro, al piano sopra). */
export function stairEnds(o) {
  const [bx, by] = point(o, 0.5, 3.5), [tx, ty] = point(o, 0.5, -0.5);
  return { bottom: [Math.floor(bx), Math.floor(by), o.lv ?? 0], top: [Math.floor(tx), Math.floor(ty), (o.lv ?? 0) + 1] };
}

/** Percorso (anche tra piani, passando dalle scale) dal Sim fino a una delle caselle goal [x, y, piano]. */
/** Percorso usato anche dagli animali (stessa logica dei Sim). */
export const makePath = (g, who, goals) => findPath(g, who, goals);
function findPath(g, sim, goals) {
  const blocks = { '-1': blocked(g, -1), 0: blocked(g, 0), 1: blocked(g, 1) };
  const free = (lv, x, y) => floorAt(g, lv, x, y) != null && !blocks[lv].has(`${x},${y}`);
  const stairs = new Map();   // "piano|x|y" → [x, y, piano] dall'altra parte
  for (const o of g.objects) {
    if (!TYPES[o.type].stairs) continue;
    const { bottom, top } = stairEnds(o);
    if (!free(...rot3(bottom)) || !free(...rot3(top))) continue;
    stairs.set(bottom.join('|'), top);
    stairs.set(top.join('|'), bottom);
  }
  const sx = Math.floor(sim.x), sy = Math.floor(sim.y), slv = sim.lv ?? 0;
  const start = `${sx}|${sy}|${slv}`;
  const goalSet = new Set(goals.map(([x, y, lv]) => `${x}|${y}|${lv ?? 0}`));
  const prev = new Map([[start, null]]);
  const queue = [[sx, sy, slv]];
  for (let qi = 0; qi < queue.length; qi++) {
    const [x, y, lv] = queue[qi];
    const key = `${x}|${y}|${lv}`;
    if (goalSet.has(key)) {
      const path = [];
      for (let k = key; k && k !== start; k = prev.get(k)) path.unshift(k.split('|').map(Number));
      return path;
    }
    const st = stairs.get(key);
    if (st) { const nk = st.join('|'); if (!prev.has(nk)) { prev.set(nk, key); queue.push(st); } }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy, nk = `${nx}|${ny}|${lv}`;
      if (prev.has(nk) || !free(lv, nx, ny)) continue;
      if (dx && dy && (!free(lv, x + dx, y) || !free(lv, x, y + dy))) continue;
      if (!dx || !dy ? wallBetween(g, lv, x, y, nx, ny)
        : wallBetween(g, lv, x, y, x + dx, y) || wallBetween(g, lv, x + dx, y, nx, ny) || wallBetween(g, lv, x, y, x, y + dy) || wallBetween(g, lv, x, y + dy, nx, ny)) continue;
      prev.set(nk, key);
      queue.push([nx, ny, lv]);
    }
  }
  return null;
}
const rot3 = ([x, y, lv]) => [lv, x, y];

/** Caselle da cui si usa un oggetto: davanti prima, poi intorno (senza un muro in mezzo). [x, y, piano]. */
function useTiles(g, o) {
  const lv = o.lv ?? 0;
  const f = footprint(o);
  const front = [];
  if (o.rot === 0) for (let x = f.x; x < f.x + f.w; x++) front.push([x, f.y + f.d, x, f.y + f.d - 1]);
  if (o.rot === 1) for (let y = f.y; y < f.y + f.d; y++) front.push([f.x + f.w, y, f.x + f.w - 1, y]);
  if (o.rot === 2) for (let x = f.x; x < f.x + f.w; x++) front.push([x, f.y - 1, x, f.y]);
  if (o.rot === 3) for (let y = f.y; y < f.y + f.d; y++) front.push([f.x - 1, y, f.x, y]);
  const around = [];
  for (let x = f.x; x < f.x + f.w; x++) around.push([x, f.y - 1, x, f.y], [x, f.y + f.d, x, f.y + f.d - 1]);
  for (let y = f.y; y < f.y + f.d; y++) around.push([f.x - 1, y, f.x, y], [f.x + f.w, y, f.x + f.w - 1, y]);
  const block = blocked(g, lv);
  const ok = ([x, y, ox, oy]) => floorAt(g, lv, x, y) != null && !block.has(`${x},${y}`) && !wallBetween(g, lv, x, y, ox, oy);
  const f1 = front.filter(ok);
  return (f1.length ? f1 : around.filter(ok)).map(([x, y]) => [x, y, lv]);
}
const nearTiles = (x, y, lv) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].map(([dx, dy]) => [Math.floor(x) + dx, Math.floor(y) + dy, lv]);

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
  if (c?.partner != null && g) {
    const p = g.sims.find(s => s.id === c.partner);
    if (p?.cur?.partner === sim.id) { if (p.cur.from) { p.x = p.cur.from[0]; p.y = p.cur.from[1]; } p.cur = null; p.pose = null; }
  }
  sim.cur = null;
  sim.path = [];
  sim.pose = null;
}
function freeObject(c) {
  if (c.objRef?.users) c.objRef.users = c.objRef.users.filter(u => u.sim !== c.simId);
}

/** Azioni che si possono fare con un oggetto, secondo il suo stato (in fiamme, rotto, sporco, senza corrente). */
export function actionsFor(g, sim, o) {
  const T = TYPES[o.type];
  if (o.fire) return [ACTIONS.spegni];
  if (o.broken) return [ACTIONS.ripara];
  if (T.elec && !g.power) return [];
  if (T.mailbox) return g.bill ? [ACTIONS.paga] : [];
  if (T.crib) return o.baby && !sim.kid && !sim.npc ? [ACTIONS.biberon, ACTIONS.pannolino, ACTIONS.coccole, ACTIONS.ninna] : [];
  if (o.type === 'torta') return o.party ? [ACTIONS.fetta] : [ACTIONS.festa];
  // I bambini non cucinano, non lavorano e non bevono; i compiti e i giocattoli sono solo loro
  const list = T.actions.map(id => ACTIONS[id]).filter(a => (sim.kid ? !(sim.teen ? TEEN_NO : KID_NO).has(a.id) : !a.kidOnly) && !(sim.npc && a.kidOnly));
  if (T.eat) list.push({ id: 'siediTavolo', label: 'Siediti al tavolo', emoji: '🪑', dur: 20, gain: { energia: 2 }, pose: 'sit' });
  if ((o.dirt ?? 0) >= 2 && T.dirties) list.push(ACTIONS.pulisci);
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
    const home = !g.town?.at;   // fuori casa: niente ladri, pizza o incendi (la casa vi aspetta)
    if (home && before < 3 * 60 && g.minute >= 3 * 60) burglar(g, notify);
    if (home && g.pizzaAt && now(g) >= g.pizzaAt) deliverPizza(g, notify);
    if (home) fires(g, step, notify);
    for (const sim of g.sims) {
      if (sim.npc && sim.leaveAt && !sim.leaving && now(g) >= sim.leaveAt) sendAway(g, sim, notify);
      simStep(g, sim, step, before, notify);
    }
    if (g.sims.some(s => s.gone)) g.sims = g.sims.filter(s => !s.gone);
    familyTick(g, step, notify);
    g.rel = clamp(g.rel - step / (60 * 24) * 1.5, 0, 100);   // il rapporto cala piano se vi ignorate
  }
}

function newDay(g, notify) {
  if (g.day >= g.bills) {   // il lunedì arriva la posta con le bollette
    const value = homeObjects(g).reduce((a, o) => a + TYPES[o.type].price, 0);
    const amount = Math.round(60 + value * 0.015) + (g.bill?.amount ?? 0);
    g.bills = g.day + 7;
    if (!homeObjects(g).some(o => TYPES[o.type].mailbox)) {   // senza cassetta della posta si pagano da sole
      g.money -= amount;
      notify(`🧾 Bollette pagate: ${amount} €${g.money < 0 ? ' · siete in rosso!' : ''}`);
    } else {
      g.bill = { amount, since: g.day };
      notify(`📬 È arrivata la posta: bollette da ${amount} €. Pagatele dalla cassetta della posta entro 3 giorni.`);
    }
  }
  if (g.bill && g.power && g.day - g.bill.since >= 3) {
    g.power = false;
    notify('🔌 Bollette non pagate: vi hanno staccato la corrente! Pagatele dalla cassetta della posta.');
  }
  rollWishes(g);
}

/** Di notte, ogni tanto, passa un ladro: con l'antifurto scappa (e la polizia vi premia). */
function burglar(g, notify) {
  if (Math.random() > 0.08) return;
  if (g.objects.some(o => TYPES[o.type].alarm)) {
    g.money += 100;
    notify('🚨 L\'antifurto ha fatto scappare un ladro! La polizia vi dà 100 € di ricompensa.');
    return;
  }
  const loot = g.objects.filter(o => (o.lv ?? 0) === 0 && TYPES[o.type].price >= 300 && !TYPES[o.type].car && !TYPES[o.type].flat && !(o.users ?? []).length && TYPES[o.type].shop !== false);
  if (!loot.length) return;
  const o = loot[Math.floor(Math.random() * loot.length)];
  g.objects = g.objects.filter(x => x !== o);
  for (const s of g.sims) { s.queue = s.queue.filter(c => c.obj !== o.id); addMood(g, s, 'derubati', '🦹', 'Derubati!', -12, 24 * 60); }
  notify(`🦹 Stanotte è entrato un ladro e ha rubato: ${TYPES[o.type].name} (${TYPES[o.type].price} €). Un antifurto vi avrebbe protetto.`);
}

function deliverPizza(g, notify) {
  g.pizzaAt = null;
  const [ex] = exitTile(g);
  for (const [x, y] of [[ex, g.H - 3], [ex + 1, g.H - 3], [ex - 1, g.H - 3], [ex, g.H - 4], [ex + 1, g.H - 4]]) {
    const p = { id: uid(), type: 'pizza', x, y, rot: 0, lv: 0, users: [] };
    if (canPlace(g, p)) { g.objects.push(p); notify('🍕 È arrivata la pizza! È sul vialetto davanti a casa: toccala per mangiarla.'); return; }
  }
  notify('🍕 Il fattorino non ha trovato posto per la pizza: liberate il vialetto.');
}

/** Un fornello in fiamme: se nessuno lo spegne in un'ora e mezza si distrugge. */
function fires(g, dt, notify) {
  for (const o of g.objects) {
    if (!o.fire) continue;
    o.fireT = (o.fireT ?? 0) + dt;
    if (o.fireT >= 90) {
      g.objects = g.objects.filter(x => x !== o);
      notify(`🔥 ${TYPES[o.type].name} è andato distrutto nell'incendio!`);
    }
  }
}

// ---------------------------------------------------------------- desideri del giorno e guida iniziale
export const WISHES = [
  { id: 'tv', text: 'Guardare la TV', emoji: '📺' }, { id: 'cucina', text: 'Cucinare un pasto', emoji: '🍳' },
  { id: 'doccia', text: 'Fare una doccia', emoji: '🚿' }, { id: 'gioca', text: 'Giocare al computer', emoji: '🎮' },
  { id: 'social', text: 'Chattare con gli amici', emoji: '📱' }, { id: 'leggi', text: 'Leggere un libro', emoji: '📖' },
  { id: 'balla', text: 'Ballare', emoji: '💃' }, { id: 'allenati', text: 'Correre sul tapis roulant', emoji: '🏃' },
  { id: 'pisolino', text: 'Fare un pisolino', emoji: '😴' }, { id: 'abbraccia', text: 'Un abbraccio', emoji: '🤗' },
  { id: 'bacia', text: 'Un bacio', emoji: '💋' }, { id: 'chiacchiera', text: 'Chiacchierare un po\'', emoji: '💬' },
  { id: 'scherza', text: 'Ridere insieme', emoji: '😂' }, { id: 'balliamo', text: 'Ballare insieme', emoji: '💃' },
  { id: 'buy', text: 'Comprare qualcosa di nuovo', emoji: '🛍️' }, { id: 'vasca', text: 'Un bagno rilassante', emoji: '🛁' },
  { id: 'nuota', text: 'Fare una nuotata', emoji: '🏊' }, { id: 'chitarra', text: 'Suonare la chitarra', emoji: '🎸' },
  { id: 'dipingi', text: 'Dipingere un quadro', emoji: '🎨' }, { id: 'scacchi', text: 'Giocare a scacchi', emoji: '♟️' },
  { id: 'grigliata', text: 'Fare una grigliata', emoji: '🍖' }, { id: 'console', text: 'Giocare alla console', emoji: '🕹️' },
  { id: 'sparecchia', text: 'Rimettere in ordine la cucina', emoji: '🍽️' }, { id: 'mangiaPizza', text: 'Mangiare una pizza', emoji: '🍕' },
  { id: 'biliardo', text: 'Giocare a biliardo', emoji: '🎱' }, { id: 'drink', text: 'Un drink al bancone', emoji: '🍹' },
  { id: 'lavoretti', text: 'Fare qualche lavoretto', emoji: '🔨' }, { id: 'pulisci', text: 'Fare le pulizie', emoji: '🧽' },
  { id: 'citta', text: 'Uscire in città', emoji: '🗺️' }, { id: 'amico', text: 'Farsi un nuovo amico', emoji: '🤝' },
  { id: 'cena', text: 'Cenare al ristorante', emoji: '🍝' }, { id: 'aperitivo', text: 'Un aperitivo al locale', emoji: '🍸' },
];
const WISH_REWARD = 80;

/** Due desideri al giorno per ciascuno, tra quelli possibili con gli oggetti che avete (più qualche acquisto). */
export function rollWishes(g) {
  if (g.wishDay === g.day) return;
  g.wishDay = g.day;
  const have = new Set(g.objects.flatMap(o => TYPES[o.type].actions));
  const always = ['buy', 'sparecchia', 'mangiaPizza', 'pulisci', 'citta', 'amico', 'cena', 'aperitivo'];
  const possible = WISHES.filter(w => have.has(w.id) || SOCIAL.some(a => a.id === w.id) || always.includes(w.id) || Math.random() < 0.15);
  for (const s of g.sims) if (!s.npc && !s.kid) s.wishes = [...possible].sort(() => Math.random() - 0.5).slice(0, 2).map(w => w.id);
}

export const GOALS = [
  { key: 'doccia', text: 'Fai fare una doccia', hint: 'Tocca la doccia nel bagno e scegli "Fai la doccia"', reward: 100 },
  { key: 'cucina', text: 'Cucina un pasto', hint: 'Tocca i fornelli in cucina: dopo si mangia al tavolo', reward: 100 },
  { key: 'sparecchia', text: 'Porta via i piatti sporchi', hint: 'Dopo mangiato tocca i piatti sul tavolo', reward: 80 },
  { key: 'job', text: 'Trova un lavoro', hint: 'Tocca 💼 Lavoro in basso e scegli un\'offerta', reward: 150 },
  { key: 'chiacchiera', text: 'Fate due chiacchiere', hint: 'Tocca l\'altro Sim e scegli "Chiacchiera"', reward: 100 },
  { key: 'buy', text: 'Compra un mobile nuovo', hint: 'Tocca 🛋️ Arreda → Compra, scegli un oggetto e trascinalo in casa', reward: 100 },
  { key: 'paga', text: 'Paga le bollette', hint: 'Il lunedì arriva la posta: tocca la cassetta della posta in giardino', reward: 60 },
  { key: 'wall', text: 'Costruisci una stanza nuova', hint: 'Arreda → Costruisci → Muro: trascina il dito per tirare i muri', reward: 200 },
  { key: 'stairs', text: 'Costruisci un piano nuovo', hint: 'Compra → Casa → Scala; poi col pulsante ▲▼ vai al piano e posa il pavimento', reward: 250 },
  { key: 'dormi', text: 'Andate a dormire insieme', hint: 'La sera tocca il letto in camera e scegli "Dormi" per tutti e due', reward: 100 },
  { key: 'citta', text: 'Uscite in città', hint: 'Tocca 🗺️ Città in basso e scegliete un posto: parco, palestra, ristorante…', reward: 150 },
  { key: 'amico', text: 'Fatevi un amico', hint: 'In città tocca qualcuno e chiacchierate finché diventate amici', reward: 200 },
  { key: 'invito', text: 'Invitate un amico a casa', hint: 'Tocca il tuo Sim (il telefono) e scegli "Invita a casa"', reward: 150 },
  { key: 'proposta', text: 'Fate la proposta di matrimonio', hint: `Con il rapporto sopra l'80% tocca l'altro Sim → "Fai la proposta"`, reward: 200 },
  { key: 'matrimonio', text: 'Sposatevi', hint: `Da fidanzati, tocca il tuo Sim (telefono) → "Organizza il matrimonio"`, reward: 300 },
  { key: 'animale', text: 'Adottate un animale', hint: `Tocca il tuo Sim (telefono) → "Adotta un animale"`, reward: 100 },
  { key: 'bambino', text: 'Avete un bambino', hint: `Tocca l'altro Sim → "Provate ad avere un bambino"`, reward: 300 },
  { key: 'promo', text: 'Ottieni una promozione', hint: 'Andate al lavoro di buon umore: bisogni alti, casa bella', reward: 300 },
];
export const currentGoal = g => GOALS.find(x => !g.goals.done.includes(x.key));

/** Qualcosa è successo (azione finita, acquisto, muro, scala, assunzione, promozione): desideri e obiettivi. */
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
  // Lavoro: mezz'ora prima esce di casa (in auto se c'è, altrimenti a piedi fino alla strada)
  if (job && job.days.includes(g.day % 7)) {
    const leave = job.start * 60 - 30, back = job.end * 60;
    if (!sim.atWork && sim.cur?.id !== 'vaiLavoro' && before < leave && g.minute >= leave) goToWork(g, sim, notify);
    if (sim.atWork && before < back && g.minute >= back) backFromWork(g, sim, job, notify);
  }
  const decay = sim.atWork ? DECAY_WORK : DECAY;
  const sleeping = ['dormi', 'pisolino', 'divanoPisolino', 'amaca'].includes(sim.cur?.id);
  for (const [k] of NEEDS) {
    if (k === 'energia' && sleeping) continue;
    const slow = sleeping && (k === 'fame' || k === 'vescica') ? 0.4 : 1;
    sim.needs[k] = clamp(sim.needs[k] - (decay[k] * slow * dt) / 60, 0, 100);
  }
  if (sim.atWork) return;
  const leaving = sim.cur?.id === 'vaiLavoro' || sim.leaving;
  if (sim.npc) for (const [k] of NEEDS) sim.needs[k] = Math.max(sim.needs[k], 13);   // la gente della città se la cava da sola

  // Incendio in casa: chi è libero (o sta facendo altro) corre a spegnerlo
  const burning = g.objects.find(o => o.fire);
  if (burning && !sim.npc && !leaving && sim.cur?.id !== 'spegni' && !sim.queue.some(c => c.action === 'spegni') && !g.sims.some(s => s !== sim && (s.cur?.id === 'spegni' || s.queue.some(c => c.action === 'spegni')))) {
    stopCur(sim, g);
    sim.queue.unshift({ kind: 'obj', obj: burning.id, action: 'spegni', by: 'auto' });
  }
  // Vescica quasi vuota: si lascia tutto (anche il sonno) e si corre in bagno, se c'è
  const toilet = g.objects.find(o => TYPES[o.type].actions.includes('bagno') && !o.broken);
  if (!leaving && sim.needs.vescica < 12 && toilet && sim.cur?.id !== 'bagno' && !sim.queue.some(c => c.action === 'bagno') && !sim.cur?.social && sim.cur?.id !== 'spegni') {
    stopCur(sim, g);
    sim.queue.unshift({ kind: 'obj', obj: toilet.id, action: 'bagno', by: 'auto' });
  }
  if (sim.needs.vescica <= 0) {
    sim.needs.vescica = 100;
    sim.needs.igiene = clamp(sim.needs.igiene - 45, 0, 100);
    if (!leaving) stopCur(sim, g);
    addMood(g, sim, 'imbarazzato', '😳', 'Imbarazzat' + oa(sim), -15, 180);
    notify(`😳 ${sim.name} non ha fatto in tempo ad arrivare in bagno…`);
  }
  if (sim.needs.energia <= 0 && !sleeping && !leaving) {
    stopCur(sim, g);
    sim.queue = [];
    sim.cur = { id: 'dormi', label: 'Svenuto dal sonno', emoji: '💤', until: 'energia', gain: { energia: 7 }, state: 'do', t: 0, pose: 'lie', simId: sim.id, floor: true };
    sim.pose = 'lie';
    notify(`😵 ${sim.name} è crollat${oa(sim)} dal sonno sul pavimento!`);
  }
  for (const [k, , label] of NEEDS) {
    if (sim.needs[k] < 20 && !sim.alerted[k] && !sim.npc) { sim.alerted[k] = true; notify(`${sim.name}: ${label.toLowerCase()} bassa!`); }
    if (sim.needs[k] > 40) sim.alerted[k] = false;
  }

  if (!sim.cur && sim.queue.length) startNext(g, sim, notify);
  if (!sim.cur) {
    sim.idle += dt;
    if ((g.auto || sim.npc) && !sim.leaving && sim.idle > 6) autonomy(g, sim);
    return;
  }
  const c = sim.cur;
  if (c.state === 'walk') return walkStep(g, sim, dt, notify);
  doStep(g, sim, dt, notify);
}

function goToWork(g, sim, notify) {
  stopCur(sim, g);
  sim.queue = [];
  const car = sim.kid ? null : g.objects.find(o => TYPES[o.type].car && o.inUse == null && (o.lv ?? 0) === 0);
  const goals = car ? useTiles(g, car) : [[...exitTile(g), 0]];
  const path = findPath(g, sim, goals);
  notify(sim.kid ? `🎒 ${sim.name} va a scuola con lo scuolabus.` : `🚗 ${sim.name} esce per andare al lavoro${car ? ' in auto' : ''} (${CAREERS[sim.job.career].name}).`);
  if (!path) { sim.atWork = true; return; }
  sim.cur = { id: 'vaiLavoro', label: car ? 'Va al lavoro in auto' : 'Va al lavoro', emoji: '🚗', state: 'walk', simId: sim.id, car: car?.id };
  if (car) car.inUse = -1;   // prenotata
  sim.path = path;
}

function backFromWork(g, sim, job, notify) {
  sim.atWork = false;
  const hours = job.end - job.start;
  const pay = job.pay[sim.job.level] * hours;
  g.money += pay;
  const m = mood(sim, g);
  const skill = job.skill ? sim.skills[job.skill] * 2 : 0;
  sim.job.perf += Math.round((m - 45) / 2 + 8 + skill + (sim.car ? 3 : 0));
  sim.job.days++;
  let text = job.school ? `🎒 ${sim.name} è tornat${oa(sim)} da scuola` : `🏠 ${sim.name} è tornat${oa(sim)} dal lavoro: +${pay} €`;
  if (sim.job.perf >= 100 && sim.job.level < 4) {
    sim.job.level++;
    sim.job.perf = 0;
    if (job.school) {
      text = `📝 Pagella di ${sim.name}: ${job.titles[sim.job.level]}! Bravissim${oa(sim)}!`;
      for (const s of g.sims) if (!s.npc) addMood(g, s, 'pagella', '📝', 'Bel voto a scuola', 10, 24 * 60);
      g.money += 50;
    } else {
      text = `🎉 ${sim.name} è stat${oa(sim)} promoss${oa(sim)}: ${job.titles[sim.job.level]}! (+${pay} €)`;
      remember(g, '🎉', `${sim.name} è diventat${oa(sim)} ${job.titles[sim.job.level]}`);
      addMood(g, sim, 'promosso', '🎉', 'Promoss' + oa(sim) + '!', 15, 24 * 60);
      gameEvent(g, sim, 'promo', notify);
    }
  } else if (sim.job.perf < -60) {
    sim.job.perf = -60;
    if (job.school && sim.job.level > 0) { sim.job.level--; sim.job.perf = 0; text += ` · il voto scende: ${job.titles[sim.job.level]}. Più compiti e buon umore!`; }
    else text += job.school ? ' · la maestra dice che deve fare i compiti' : ' · il capo dice che deve arrivare più di buon umore';
  }
  const car = sim.car && homeObjects(g).find(o => o.id === sim.car);
  sim.lv = 0;
  if (car) {   // torna con l'auto: scende accanto
    car.inUse = null;
    const [x, y] = useTiles(g, car)[0] ?? exitTile(g);
    sim.x = x + 0.5; sim.y = y + 0.5;
  } else {
    const [ex, ey] = exitTile(g);
    sim.x = ex + 0.5; sim.y = ey + 0.5;
  }
  sim.car = null;
  sim.idle = 10;
  notify(text);
}

/** Inizia la prossima azione in coda: trova l'oggetto, la casella da cui usarlo e il percorso. */
function startNext(g, sim, notify) {
  const cmd = sim.queue.shift();
  const say = cmd.by === 'auto' ? () => {} : notify;   // se ha deciso da solo, niente avvisi
  if (cmd.kind === 'go') {
    const path = findPath(g, sim, [[cmd.x, cmd.y, cmd.lv ?? sim.lv]]);
    if (!path) return say(`${sim.name} non riesce ad arrivare lì.`);
    sim.cur = { id: 'go', label: 'Cammina', emoji: '👣', state: 'walk', simId: sim.id };
    sim.path = path;
    return;
  }
  if (cmd.kind === 'dish') {
    const d = g.dishes.find(x => x.id === cmd.id);
    if (!d) return;
    const path = findPath(g, sim, nearTiles(d.x, d.y, d.lv ?? 0));
    if (!path) return say(`${sim.name} non riesce ad arrivare ai piatti.`);
    sim.cur = { ...ACTIONS.sparecchia, dish: d.id, state: 'walk', t: 0, simId: sim.id, by: cmd.by };
    sim.path = path;
    return;
  }
  if (cmd.kind === 'social') {
    const p = cmd.partner != null ? g.sims.find(s => s.id === cmd.partner) : other(g, sim);
    const a = SOCIAL.find(x => x.id === cmd.action);
    if (!p || p.leaving) return;
    if (p.atWork || p.cur?.id === 'vaiLavoro') return say(`${p.name} è al lavoro.`);
    const goals = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) goals.push([Math.floor(p.x) + dx, Math.floor(p.y) + dy, p.lv]);
    const path = findPath(g, sim, goals) ?? [];
    sim.cur = { ...a, social: true, partner: p.id, state: 'walk', t: 0, simId: sim.id, by: cmd.by };
    sim.path = path;
    return;
  }
  if (cmd.kind === 'pet') {   // coccole, gioco, pappa, bagnetto all'animale
    const p = g.pets?.find(x => x.id === cmd.pet);
    const a = PET_ACTIONS[cmd.action];
    if (!p || !a) return;
    if (p.heldBy != null && p.heldBy !== sim.id) return say(`${p.name} è già con qualcun altro.`);
    const path = findPath(g, sim, nearTiles(p.x, p.y, p.lv).slice(1)) ?? findPath(g, sim, nearTiles(p.x, p.y, p.lv));
    if (!path) return say(`${sim.name} non riesce ad arrivare da ${p.name}.`);
    p.heldBy = sim.id;
    p.path = [];
    sim.cur = { ...a, pet: p.id, state: 'walk', t: 0, simId: sim.id, by: cmd.by };
    sim.path = path;
    return;
  }
  const o = g.objects.find(x => x.id === cmd.obj);
  if (!o) return;
  const a = cmd.action === 'siediTavolo' ? actionsFor(g, sim, o).find(x => x.id === 'siediTavolo') : ACTIONS[cmd.action];
  const T = TYPES[o.type];
  if (!actionsFor(g, sim, o).some(x => x.id === a.id) && a.id !== 'mangia') {
    if (o.broken) return say(`${T.name} è rotto: va riparato.`);
    if (T.elec && !g.power) return say('Senza corrente non funziona: pagate le bollette.');
    return;
  }
  const seats = T.seats ?? [];
  o.users ??= [];
  const needSeat = a.pose === 'sit' || a.pose === 'lie' || a.pose === 'swim' || a.inside;
  let seat = null;
  if (needSeat && seats.length) {
    seat = seats.findIndex((_, i) => !o.users.some(u => u.seat === i));
    if (seat < 0) return say(`${T.name}: è occupato.`);
  } else if (o.users.length && !seats.length) return say(`${T.name}: lo sta usando ${g.sims.find(s => s.id === o.users[0].sim)?.name ?? 'qualcun altro'}.`);
  const path = findPath(g, sim, useTiles(g, o));
  if (!path) return say(`${sim.name} non riesce ad arrivare a: ${T.name}.`);
  o.users.push({ sim: sim.id, seat });
  sim.cur = { ...a, obj: o.id, objRef: o, seat, q: T.q ?? 1, state: 'walk', t: 0, simId: sim.id, by: cmd.by };
  sim.path = path;
}

function walkStep(g, sim, dt, notify) {
  let move = WALK * dt;
  while (move > 0 && sim.path.length) {
    const [tx, ty, tlv] = sim.path[0];
    if ((tlv ?? sim.lv) !== sim.lv) {   // scale: si cambia piano
      sim.lv = tlv;
      sim.x = tx + 0.5; sim.y = ty + 0.5;
      sim.path.shift();
      move -= 1.5;
      continue;
    }
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
  if (c.id === 'vaiVia') { sim.gone = true; return; }
  if (c.id === 'vaiLavoro') {
    sim.cur = null;
    sim.atWork = true;
    const car = c.car && g.objects.find(o => o.id === c.car);
    if (car) { car.inUse = sim.id; sim.car = car.id; }
    return;
  }
  if (c.social) return startSocial(g, sim, notify);
  if (c.pet) {
    const p = g.pets.find(x => x.id === c.pet);
    if (!p) { sim.cur = null; return; }
    faceTo(sim, p.x, p.y);
    c.state = 'do';
    c.t = 0;
    return;
  }
  if (c.dish) {
    const d = g.dishes.find(x => x.id === c.dish);
    if (!d) { sim.cur = null; return; }
    faceTo(sim, d.x, d.y);
    c.state = 'do';
    return;
  }
  const o = c.objRef;
  if (c.seat != null) {
    const [lx, ly] = TYPES[o.type].seats[c.seat];
    const [x, y] = point(o, lx, ly);
    c.from = [sim.x, sim.y];
    sim.x = x; sim.y = y;
    sim.pose = c.pose ?? null;
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
  const busy = !p || p.leaving || p.atWork || p.cur?.id === 'vaiLavoro' || p.cur?.id === 'dormi' || p.cur?.inside || p.cur?.social || p.cur?.id === 'spegni';
  if (busy) { if (c.by !== 'auto' && p) notify(`${p.name} adesso non può.`); sim.cur = null; return; }
  if (relOf(g, sim, p) < c.min) {
    addRel(g, sim, p, -3, notify);
    if (!sim.npc) notify(`🙅 ${p.name} non ne ha voglia: prima ${p.npc ? 'diventate più amici' : 'migliorate il rapporto'} (chiacchierate, scherzate).`);
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
  const o = c.objRef;
  const dirty = o && (o.dirt ?? 0) >= 4;
  const frac = c.until ? dt / 60 : dt / c.dur;
  for (const [k, v] of Object.entries(c.gain ?? {})) {
    const mult = v > 0 ? (c.q ?? 1) * (dirty && k === 'igiene' ? 0.5 : 1) : 1;   // doccia sporca: lava la metà
    sim.needs[k] = clamp(sim.needs[k] + v * frac * mult, 0, 100);
  }
  if (c.skill) sim.skills[c.skill] = Math.min(10, (sim.skills[c.skill] ?? 0) + dt / 60 * 0.6 / (1 + (sim.skills[c.skill] ?? 0) * 0.15));
  if (c.social && !c.follower) { const p = g.sims.find(s => s.id === c.partner); if (p) addRel(g, sim, p, (c.rel * dt) / c.dur * (p.npc || sim.npc ? 2.5 : 1), notify); }
  if (c.baby && o?.baby) for (const [k, v] of Object.entries(c.baby)) o.baby.needs[k] = clamp(o.baby.needs[k] + v * frac, 0, 100);
  if (c.pet) { const p = g.pets.find(x => x.id === c.pet); if (p) for (const [k, v] of Object.entries(c.petGain ?? {})) p.needs[k] = clamp(p.needs[k] + v * frac, 0, 100); }
  if (c.dance || c.run) sim.walk += dt * 8;
  if (o?.fire && c.id !== 'spegni') { stopCur(sim, g); return; }   // è scoppiato un incendio: si molla tutto
  const done = c.until ? sim.needs[c.until] >= 99.5 : c.t >= c.dur;
  if (!done) return;
  finishAction(g, sim, c, notify);
}

function finishAction(g, sim, c, notify) {
  const o = c.objRef;
  const T = o && TYPES[o.type];
  if (c.id === 'cucina' || c.id === 'grigliata') {
    const bonus = Math.round(sim.skills.cucina * 2 * (c.q ?? 1));
    sim.needs.fame = clamp(sim.needs.fame + bonus, 0, 100);
    if (sim.skills.cucina >= 4) addMood(g, sim, 'pasto', '😋', 'Pasto delizioso', 10, 180);
    if (o && c.id === 'cucina' && Math.random() < Math.max(0, 0.06 - sim.skills.cucina * 0.01)) {   // principianti: può prendere fuoco
      o.fire = true;
      o.fireT = 0;
      for (const s of g.sims) if (!s.atWork) addMood(g, s, 'spaventato', '😱', 'Spaventat' + oa(s), -15, 120);
      notify(`🔥 ${T.name} ha preso fuoco! Spegnetelo subito (toccatelo).`);
    }
  }
  if (c.id === 'dormi' && sim.needs.energia >= 99) addMood(g, sim, 'riposato', '😌', (c.q ?? 1) > 1 ? 'Dormito benissimo' : 'Ben riposat' + oa(sim), (c.q ?? 1) > 1 ? 15 : 10, 240);
  if (c.id === 'bacia') { addMood(g, sim, 'innamorato', '😍', 'Innamorat' + oa(sim), 10, 180); }
  if (c.id === 'nuota' || c.id === 'vasca') addMood(g, sim, 'rinfrescato', '💦', 'Rinfrescat' + oa(sim), 8, 120);
  if (c.special === 'quadro') {
    const price = Math.round(20 + sim.skills.creativita * 18 + Math.random() * 25);
    g.money += price;
    notify(`🎨 ${sim.name} ha venduto un quadro: +${price} €`);
  }
  if (c.special === 'mobiletto') {
    const price = Math.round(35 + sim.skills.manualita * 16 + Math.random() * 20);
    g.money += price;
    notify(`🪚 ${sim.name} ha venduto il mobiletto che ha costruito: +${price} €`);
  }
  // Famiglia: compiti, proposta, bebè, matrimonio, ciotola, animali
  if (c.special === 'compiti' && CAREERS[sim.job?.career]?.school) { sim.job.perf += 15; if (c.by !== 'auto') notify(`📝 ${sim.name} ha finito i compiti.`); }
  const lead = c.social && !c.follower ? g.sims.find(s => s.id === c.partner) : null;
  if (lead) {
    const kid = [sim, lead].find(s => s.kid);
    if (c.special === 'aiutaCompiti' && kid?.job) { kid.job.perf += 20; notify(`📝 ${kid.name} ha fatto i compiti con un aiuto: a scuola andrà meglio!`); }
    if (c.special === 'proposta') proposal(g, sim, lead, s => mood(s, g), notify);
    if (c.special === 'bambino') tryBaby(g, sim, lead, notify);
    if (c.special === 'sposa') wedding(g, sim, lead, notify);
  }
  if (c.special === 'festa' && o && !o.party) celebrate(g, sim, o, notify);
  if (c.special === 'fetta' && o) { o.slices = (o.slices ?? 1) - 1; if (o.slices <= 0) g.objects = g.objects.filter(x => x !== o); }
  if (c.special === 'riempi' && o) { o.food = 12; if (c.by !== 'auto') notify('🥣 Ciotola piena: gli animali mangiano da soli.'); }
  if (c.pet) petDone(g, sim, c, notify);
  if (c.special === 'pulisci' && o) { o.dirt = 0; if (c.by !== 'auto') notify(`🧽 ${T.name}: pulito e splendente.`); }
  if (c.special === 'spegni' && o) { o.fire = false; o.fireT = 0; notify(`🧯 ${sim.name} ha spento l'incendio!`); }
  if (c.special === 'paga' && g.bill) {
    g.money -= g.bill.amount;
    notify(`🧾 Bollette pagate: ${g.bill.amount} €${g.power ? '' : ' · la corrente è tornata'}${g.money < 0 ? ' · siete in rosso!' : ''}`);
    g.bill = null;
    g.power = true;
  }
  if (c.special === 'ripara' && o) {
    if (Math.random() < 0.45 + sim.skills.manualita * 0.06) { o.broken = false; notify(`🔧 ${sim.name} ha riparato: ${T.name}!`); }
    else if (Math.random() < 0.35) {
      sim.needs.energia = clamp(sim.needs.energia - 25, 0, 100);
      addMood(g, sim, 'scossa', '⚡', 'Ha preso la scossa', -10, 120);
      notify(`⚡ ${sim.name} ha preso la scossa! ${T.name} è ancora rotto.`);
    } else notify(`🔧 ${sim.name} non è riuscit${oa(sim)} a ripararlo: riprova o chiama il tecnico (tocca il tuo Sim).`);
  }
  if (c.special === 'pizza' && o) g.objects = g.objects.filter(x => x !== o);
  if (c.dish) g.dishes = g.dishes.filter(d => d.id !== c.dish);
  if (c.special === 'jobs') notify('__jobs__' + sim.id);
  // Usarli sporca bagni e fornelli; gli elettrodomestici a volte si rompono
  if (o && T.dirties && !c.special) o.dirt = (o.dirt ?? 0) + 1;
  if (o && T.breaks && !c.special && Math.random() < 0.025) { o.broken = true; notify(`💥 ${T.name} si è rotto! Si può provare a ripararlo o chiamare il tecnico.`); }
  if (c.cost && !sim.npc) { g.money -= c.cost; notify(`💳 ${sim.name} ha pagato il conto: ${c.cost} €`); }
  if (!sim.npc && c.id !== 'bambino' && (c.id === 'dormi' ? g.sims.every(s => s === sim || s.npc || s.cur?.id === 'dormi') : true)) gameEvent(g, sim, c.id, notify);
  // Dopo mangiato restano i piatti: sul tavolo (se si è mangiato lì) o per terra vicino
  if (c.dishes && g.dishes.length < 10) {
    const seat = o && c.seat != null ? T.seats?.[c.seat] : null;
    const [dx, dy] = seat ? point(o, seat[0], seat[1] + (seat[1] < 1 ? 0.45 : -0.45)) : [sim.x, sim.y];
    g.dishes.push({ id: uid(), x: dx, y: dy, h: seat ? T.top ?? 0 : 0, lv: sim.lv });
  }
  const then = c.then;
  const from = c.from;
  freeObject(c);
  sim.cur = null;
  sim.pose = null;
  if (from) { sim.x = from[0]; sim.y = from[1]; }
  if (then === 'mangia') {
    const table = g.objects.find(t => TYPES[t.type].eat && (t.users ?? []).length < TYPES[t.type].seats.length);
    if (table) sim.queue.unshift({ kind: 'obj', obj: table.id, action: 'mangia', by: 'auto' });
    else sim.cur = { ...ACTIONS.mangia, state: 'do', t: 0, simId: sim.id, pose: null };
  }
}

// ---------------------------------------------------------------- libero arbitrio
function autonomy(g, sim) {
  sim.idle = 0;
  // Genitori: prima il bebè (se piange) e la pappa degli animali, poi il resto
  if (!sim.npc && !sim.kid && Math.min(...Object.values(sim.needs)) > 15) {
    const BABY_ACT = { fame: 'biberon', igiene: 'pannolino', socialita: 'coccole', energia: 'ninna' };
    for (const crib of g.objects) {
      if (!crib.baby || (crib.users ?? []).length || g.sims.some(s => s !== sim && s.queue.some(c => c.obj === crib.id))) continue;
      const [k, v] = Object.entries(crib.baby.needs).sort((a, b) => a[1] - b[1])[0];
      if (v < 45) { sim.queue.push({ kind: 'obj', obj: crib.id, action: BABY_ACT[k], by: 'auto' }); return; }
    }
    const hungry = g.pets?.find(p => p.needs.fame < 30 && p.heldBy == null && !g.sims.some(s => s.cur?.pet === p.id || s.queue.some(c => c.pet === p.id)));
    if (hungry) {
      const bowl = g.objects.find(o => TYPES[o.type].petFood);
      if (bowl && !(bowl.food > 0)) sim.queue.push({ kind: 'obj', obj: bowl.id, action: 'riempi', by: 'auto' });
      else if (!bowl) sim.queue.push({ kind: 'pet', pet: hungry.id, action: 'nutri', by: 'auto' });
      if (sim.queue.length) return;
    }
    const needy = g.pets?.find(p => (p.needs.svago < 25 || p.needs.igiene < 20) && p.state !== 'sleep' && p.heldBy == null && p.lv === sim.lv && !g.sims.some(s => s.cur?.pet === p.id || s.queue.some(c => c.pet === p.id)));
    if (needy && Math.random() < 0.5) { sim.queue.push({ kind: 'pet', pet: needy.id, action: needy.needs.igiene < 20 ? 'lava' : 'giocaPet', by: 'auto' }); return; }
  }
  const needs = Object.entries(sim.needs).sort((a, b) => a[1] - b[1]);
  for (const [need, val] of needs) {
    if (val > 55) break;
    if (need === 'socialita') {
      const p = sim.npc ? null : other(g, sim);
      const free = q => !q.atWork && !q.leaving && q.cur?.id !== 'vaiLavoro' && !q.cur?.inside && q.cur?.id !== 'dormi' && !q.cur?.social;
      if (p && free(p)) {
        sim.queue.push({ kind: 'social', action: g.rel > 60 && Math.random() < 0.4 ? 'abbraccia' : 'chiacchiera', partner: p.id, by: 'auto' });
        return;
      }
      // Qualcuno vicino con cui scambiare due parole (la gente della città non disturba chi è occupato)
      const near = g.sims.filter(q => q !== sim && q.lv === sim.lv && free(q) && (sim.npc || q.npc)
        && (!sim.npc || q.npc || (!q.cur && !q.queue.length)) && Math.hypot(q.x - sim.x, q.y - sim.y) < 9);
      if (near.length) {
        const q = near[Math.floor(Math.random() * near.length)];
        sim.queue.push({ kind: 'social', action: Math.random() < 0.3 ? 'scherza' : 'chiacchiera', partner: q.id, by: 'auto' });
        return;
      }
      continue;
    }
    if (need === 'energia' && val > 30 && g.minute > 8 * 60 && g.minute < 21 * 60) continue;
    let best = null;
    for (const o of g.objects) {
      const T = TYPES[o.type];
      const users = o.users ?? [];
      const seats = T.seats?.length ?? 0;
      if (seats ? users.length >= seats : users.length) continue;
      for (const a of actionsFor(g, sim, o)) {
        if (!T.actions.includes(a.id)) continue;
        let gain = (a.gain?.[need] ?? 0) * (T.q ?? 1);
        if (a.then === 'mangia' && need === 'fame') gain = 65 * (T.q ?? 1);
        if (a.special && a.special !== 'pizza' && a.special !== 'fetta') gain = 0;
        if (gain > 0 && (!best || gain > best.gain)) best = { o, a, gain };
      }
    }
    if (best) { sim.queue.push({ kind: 'obj', obj: best.o.id, action: best.a.id, by: 'auto' }); return; }
  }
  if (sim.npc) {   // la gente della città: qualcosa di divertente da fare, oppure due passi in giro
    const fun = g.objects.filter(o => !(o.users ?? []).length && actionsFor(g, sim, o).some(a => (a.gain?.svago ?? 0) > 0 && !a.cost && TYPES[o.type].actions.includes(a.id)));
    if (fun.length && Math.random() < 0.6) {
      const o = fun[Math.floor(Math.random() * fun.length)];
      const a = actionsFor(g, sim, o).find(x => (x.gain?.svago ?? 0) > 0 && !x.cost);
      sim.queue.push({ kind: 'obj', obj: o.id, action: a.id, by: 'auto' });
      return;
    }
    const x = Math.floor(sim.x + (Math.random() - 0.5) * 12), y = Math.floor(sim.y + (Math.random() - 0.5) * 12);
    if (floorAt(g, sim.lv, x, y) != null) sim.queue.push({ kind: 'go', x, y, lv: sim.lv, by: 'auto' });
    return;
  }
  // Tutto a posto: faccende di casa
  const mailbox = g.objects.find(o => TYPES[o.type].mailbox);
  if (g.bill && mailbox && g.money >= g.bill.amount && (g.day - g.bill.since >= 1 || Math.random() < 0.3)) { sim.queue.push({ kind: 'obj', obj: mailbox.id, action: 'paga', by: 'auto' }); return; }
  if (g.dishes.length && Math.random() < 0.5) { sim.queue.push({ kind: 'dish', id: g.dishes[0].id, by: 'auto' }); return; }
  const dirty = g.objects.find(o => (o.dirt ?? 0) >= 4 && !(o.users ?? []).length);
  if (dirty && Math.random() < 0.25) sim.queue.push({ kind: 'obj', obj: dirty.id, action: 'pulisci', by: 'auto' });
}

// ---------------------------------------------------------------- abitanti della città
const PEOPLE = [['Marco', 'lui'], ['Giulia', 'lei'], ['Luca', 'lui'], ['Sara', 'lei'], ['Davide', 'lui'], ['Chiara', 'lei'], ['Matteo', 'lui'],
  ['Elena', 'lei'], ['Andrea', 'lui'], ['Francesca', 'lei'], ['Simone', 'lui'], ['Martina', 'lei'], ['Paolo', 'lui'], ['Alice', 'lei']];
function newTown() {
  const letters = ['a', 'b', 'c', 'd', 'e', 'f'];
  const people = PEOPLE.map(([name, gender], i) => ({ key: 'p' + i, name, gender, model: `${gender === 'lei' ? 'female' : 'male'}-${letters[(i * 5 + 2) % 6]}` }));
  return { at: null, home: null, friends: {}, people };
}
