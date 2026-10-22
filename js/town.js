// La città: posti dove uscire (parco, palestra, ristorante, locale, biblioteca) con la gente del posto da conoscere,
// e gli amici da invitare a casa. Un posto è un lotto come la casa (pavimenti, muri, oggetti): andandoci, la casa
// resta da parte (g.town.home) e torna com'era al rientro.
import { TYPES } from './catalog.js';
import { canPlace, wkey, makeNpc, homeObjects, exitTile, gameEvent } from './game.js';

export const PLACES = {
  parco: { name: 'Parco', emoji: '🌳', text: 'Panchine, fontana, barbecue, altalene e scacchi all\'aperto.', open: [6, 23] },
  palestra: { name: 'Palestra', emoji: '🏋️', text: 'Tapis roulant, pesi e piscina coperta: si allena il fitness.', open: [6, 23] },
  ristorante: { name: 'Ristorante', emoji: '🍝', text: 'Una cena fuori (30 € a testa): pancia piena, svago e romanticismo.', open: [12, 24] },
  locale: { name: 'Locale', emoji: '🍸', text: 'Aperitivi (12 €), pista da ballo, biliardo e freccette. Apre alle 18.', open: [18, 28] },
  biblioteca: { name: 'Biblioteca', emoji: '📚', text: 'Libri, computer e scacchi in silenzio: si allenano logica e cucina.', open: [9, 20] },
};
const TAXI = 15;
/** Il posto è aperto a quest'ora? (il locale chiude alle 4 di notte) */
export function isOpen(id, minute) {
  const [a, b] = PLACES[id].open, h = minute / 60;
  return b > 24 ? h >= a || h < b - 24 : h >= a && h < b;
}
const hours = id => { const [a, b] = PLACES[id].open; return `${a}:00-${b % 24}:00`; };
export { hours };
/** Con l'auto di casa (libera) si va gratis, altrimenti il taxi. */
export const ownCar = g => homeObjects(g).some(o => TYPES[o.type].car && o.inUse == null);
export const travelCost = g => (ownCar(g) ? 0 : TAXI);

// ---------------------------------------------------------------- i posti
function blank(g, floor) {
  const L = { floors: Array(g.W * g.H).fill(floor), walls: {} };
  return { levels: { '-1': { floors: Array(g.W * g.H).fill(null), walls: {} }, 0: L, 1: { floors: Array(g.W * g.H).fill(null), walls: {} } }, L };
}
const rect = (g, L, x0, y0, x1, y1, f) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) L.floors[y * g.W + x] = f; };
/** Muri intorno alle caselle x0..x1 × y0..y1, con la porta (o le porte) sul lato davanti e qualche finestra. */
function room(L, x0, y0, x1, y1, color, doors = [], wins = []) {
  for (let x = x0; x <= x1; x++) {
    L.walls[wkey('h', x, y0)] = { color, ...(wins.includes(x) ? { win: true } : {}) };
    L.walls[wkey('h', x, y1 + 1)] = { color, ...(doors.includes(x) ? { door: true } : wins.includes(x) ? { win: true } : {}) };
  }
  for (let y = y0; y <= y1; y++) {
    L.walls[wkey('v', x0, y)] = { color, ...(wins.includes(-y) ? { win: true } : {}) };
    L.walls[wkey('v', x1 + 1, y)] = { color, ...(wins.includes(-y) ? { win: true } : {}) };
  }
}
let n = 0;
/** Mette gli oggetti dove ci stanno: [tipo, x, y, rot, colore]. */
function furnish(g, levels, list) {
  const tmp = { W: g.W, H: g.H, levels, objects: [], sims: [] };
  for (const [type, x, y, rot = 0, color] of list) {
    const o = { id: `v${++n}${Math.random().toString(36).slice(2, 6)}`, type, x, y, rot, lv: 0, users: [], color: color ?? TYPES[type].colors?.[0] };
    if (canPlace(tmp, o)) tmp.objects.push(o);
    else console.warn('posto: non ci sta', type, x, y);
  }
  return tmp.objects;
}
const path = (g, L, x0, x1) => rect(g, L, x0, 15, x1, g.H - 1, 'pietra');

const BUILD = {
  parco(g) {
    const { levels, L } = blank(g, 'erba');
    rect(g, L, 11, 8, 12, g.H - 1, 'pietra');
    rect(g, L, 3, 8, 20, 9, 'pietra');
    rect(g, L, 9, 3, 14, 7, 'pietra');
    rect(g, L, 20, 15, 21, 16, 'bagno');
    room(L, 20, 15, 21, 16, '#fde68a', [20]);
    const objects = furnish(g, levels, [
      ['fontana', 11, 4], ['aiuola', 9, 3, 0, '#f472b6'], ['aiuola', 14, 3, 0, '#facc15'], ['aiuola', 9, 7, 0, '#a78bfa'], ['aiuola', 14, 7, 0, '#f87171'],
      ['panchina', 7, 6, 0], ['panchina', 15, 6, 0], ['panchina', 7, 10, 2], ['panchina', 15, 10, 2],
      ['barbecue', 3, 4], ['barbecue', 5, 4], ['tavolo', 3, 5], ['altalena', 18, 3], ['altalena', 18, 5], ['amaca', 19, 11],
      ['scacchi', 4, 12], ['scacchi', 6, 12], ['lampione', 10, 11], ['lampione', 13, 11], ['lampione', 10, 16], ['lampione', 13, 16],
      ['albero', 1, 1], ['albero', 22, 1], ['albero', 2, 16], ['albero', 16, 14], ['albero', 7, 16], ['pino', 1, 10], ['pino', 22, 8], ['pino', 17, 17],
      ['siepe', 0, 14], ['siepe', 1, 14], ['siepe', 23, 13], ['wc', 20, 15], ['lavandino', 21, 15], ['chitarra', 3, 10],
    ]);
    return { levels, objects };
  },
  palestra(g) {
    const { levels, L } = blank(g, 'erba');
    rect(g, L, 3, 2, 20, 14, 'legno');
    rect(g, L, 3, 8, 11, 14, 'bagno');
    room(L, 3, 2, 20, 14, '#bfdbfe', [11, 12], [6, 10, 15, -5, -11]);
    path(g, L, 11, 12);
    const objects = furnish(g, levels, [
      ['tapis', 4, 2], ['tapis', 6, 2], ['tapis', 8, 2], ['tapis', 10, 2], ['pesi', 13, 2], ['pesi', 15, 2], ['pesi', 17, 2],
      ['piscina', 5, 9], ['doccia', 3, 8], ['doccia', 3, 9], ['wc', 3, 13, 1], ['lavandino', 10, 8], ['stereo', 19, 2], ['specchio', 20, 5, 3],
      ['lampada', 12, 7], ['lampada', 19, 8], ['banconeBar', 15, 12], ['poltrona', 14, 9, 2, '#2563eb'], ['poltrona', 17, 9, 2, '#2563eb'], ['piantaGrande', 20, 14], ['piantaGrande', 3, 2],
      ['albero', 1, 17], ['albero', 21, 17], ['lampione', 10, 17], ['lampione', 13, 17],
    ]);
    return { levels, objects };
  },
  ristorante(g) {
    const { levels, L } = blank(g, 'erba');
    rect(g, L, 4, 2, 19, 13, 'marmo');
    rect(g, L, 16, 2, 19, 6, 'cucina');
    room(L, 4, 2, 19, 13, '#fecaca', [11, 12], [6, 9, 14, -4, -8, -11]);
    L.walls[wkey('v', 16, 2)] = { color: '#f5f5f4' }; L.walls[wkey('v', 16, 3)] = { color: '#f5f5f4' }; L.walls[wkey('v', 16, 4)] = { color: '#f5f5f4', door: true };
    L.walls[wkey('h', 16, 7)] = { color: '#f5f5f4' }; L.walls[wkey('h', 17, 7)] = { color: '#f5f5f4' }; L.walls[wkey('h', 18, 7)] = { color: '#f5f5f4' }; L.walls[wkey('h', 19, 7)] = { color: '#f5f5f4' };
    L.walls[wkey('v', 16, 5)] = { color: '#f5f5f4' }; L.walls[wkey('v', 16, 6)] = { color: '#f5f5f4' };
    path(g, L, 11, 12);
    const objects = furnish(g, levels, [
      ['tavoloRistorante', 5, 3], ['tavoloRistorante', 9, 3], ['tavoloRistorante', 12, 3], ['tavoloRistorante', 5, 7], ['tavoloRistorante', 9, 7],
      ['tavoloRistorante', 12, 7], ['tavoloRistorante', 5, 11], ['tavoloRistorante', 14, 10],
      ['lampada', 8, 10], ['lampada', 11, 6], ['lampada', 15, 4],
      ['cucinaPro', 19, 2, 3], ['fornello', 19, 3, 3], ['lavello', 19, 4, 3], ['frigoLusso', 17, 2, 0], ['bancone', 18, 2, 0],
      ['piantaGrande', 4, 13], ['piantaGrande', 19, 13], ['statua', 15, 7], ['jukebox', 19, 9, 3], ['wc', 4, 9, 1], ['lavandino', 4, 8, 1],
      ['aiuola', 9, 14, 0, '#f472b6'], ['aiuola', 14, 14, 0, '#facc15'], ['lampione', 10, 16], ['lampione', 13, 16], ['albero', 2, 16], ['albero', 21, 16],
    ]);
    return { levels, objects };
  },
  locale(g) {
    const { levels, L } = blank(g, 'erba');
    rect(g, L, 3, 2, 20, 13, 'legnoScuro');
    rect(g, L, 8, 5, 15, 10, 'moquetteRossa');
    room(L, 3, 2, 20, 13, '#c7d2fe', [11, 12], [-6, -10]);
    path(g, L, 11, 12);
    const objects = furnish(g, levels, [
      ['banconeBar', 4, 2], ['banconeBar', 6, 2], ['jukebox', 9, 2], ['stereo', 14, 2], ['biliardo', 17, 3], ['freccette', 20, 9, 3],
      ['divanoLusso', 3, 11, 1, '#78350f'], ['poltrona', 5, 12, 0, '#7c3aed'], ['tavolo', 17, 8], ['lampada', 3, 6], ['lampada', 20, 2],
      ['wc', 20, 13, 3], ['lavandino', 20, 12, 3], ['piantaGrande', 3, 2], ['lampione', 10, 16], ['lampione', 13, 16], ['albero', 2, 17], ['albero', 21, 17],
    ]);
    return { levels, objects };
  },
  biblioteca(g) {
    const { levels, L } = blank(g, 'erba');
    rect(g, L, 3, 2, 20, 13, 'camera');
    room(L, 3, 2, 20, 13, '#dcfce7', [11, 12], [5, 9, 14, 18, -6, -10]);
    path(g, L, 11, 12);
    const shelves = [];
    for (let x = 3; x <= 20; x++) if (x !== 11 && x !== 12) shelves.push(['libreria', x, 2]);
    const objects = furnish(g, levels, [
      ...shelves, ['tavoloQuattro', 5, 5], ['tavoloQuattro', 9, 5], ['tavoloQuattro', 14, 5],
      ['computer', 3, 9, 1], ['computer', 3, 11, 1], ['scacchi', 9, 10], ['scacchi', 12, 10], ['poltrona', 16, 10, 2, '#16a34a'], ['poltrona', 18, 10, 2, '#16a34a'],
      ['lampada', 20, 8], ['lampada', 15, 13], ['piantaGrande', 20, 13], ['tappetoGrande', 15, 10, 0, '#b45309'], ['wc', 20, 5, 3],
      ['lampione', 10, 16], ['lampione', 13, 16], ['albero', 2, 16], ['albero', 21, 16],
    ]);
    return { levels, objects };
  },
};

// ---------------------------------------------------------------- andare e tornare
function resetSim(s, x, y) {
  s.cur = null; s.queue = []; s.path = []; s.pose = null; s.lv = 0; s.idle = 0;
  s.x = x; s.y = y;
}
/** Andate in un posto della città (o 'casa' per tornare). Restituisce un messaggio se non si può. */
export function travel(g, place, notify) {
  const team = g.sims.filter(s => !s.npc && !s.atWork);
  if (place !== 'casa') {
    if (!isOpen(place, g.minute)) return `${PLACES[place].name}: è chiuso (orari ${hours(place)}).`;
    if (!team.length) return 'Sono tutti al lavoro.';
  }
  const cost = place === 'casa' && !g.town.at ? 0 : travelCost(g);
  if (cost && g.money < cost) return 'Non avete i soldi per il taxi.';
  g.money -= cost;
  if (!g.town.at) g.town.home = { objects: g.objects, levels: g.levels, dishes: g.dishes, exit: g.exit };
  g.sims = g.sims.filter(s => !s.npc);   // la gente del posto (o gli ospiti) resta lì
  const how = cost ? `in taxi (−${cost} €)` : 'in auto';
  if (place === 'casa') {
    Object.assign(g, { objects: g.town.home.objects, levels: g.town.home.levels, dishes: g.town.home.dishes, exit: g.town.home.exit });
    g.town.home = null;
    g.town.at = null;
    for (const o of g.objects) o.users = [];
    const [ex, ey] = exitTile(g);
    team.forEach((s, i) => resetSim(s, ex + 0.5 + i, ey + 0.5 - 1));
    notify(`🏠 Siete tornati a casa ${how}.`);
    return null;
  }
  const v = BUILD[place](g);
  Object.assign(g, { objects: v.objects, levels: v.levels, dishes: [], exit: [12, g.H - 1] });
  g.town.at = place;
  team.forEach((s, i) => resetSim(s, 11.5 + i, g.H - 1.5));
  // La gente del posto: qualcuno che conoscete già e qualche faccia nuova
  const people = [...g.town.people].sort(() => Math.random() - 0.5).slice(0, place === 'locale' ? 5 : 4);
  const free = [];
  for (let y = 2; y < g.H - 3; y++) for (let x = 1; x < g.W - 1; x++) {
    const tmp = { type: 'pizza', x, y, rot: 0, lv: 0 };
    if (canPlace(g, tmp)) free.push([x, y]);
  }
  for (const p of people) {
    const [x, y] = free.splice(Math.floor(Math.random() * free.length), 1)[0] ?? [12, 12];
    g.sims.push(makeNpc(p, x + 0.5, y + 0.5));
  }
  notify(`${PLACES[place].emoji} Siete arrivati: ${PLACES[place].name} ${how}. Tocca la gente per fare amicizia!`);
  for (const s of team) gameEvent(g, s, 'citta', notify);
  return null;
}

/** Invita a casa un amico: arriva dalla strada e resta qualche ora. */
export function invite(g, key, notify) {
  if (g.town.at) return 'Prima tornate a casa.';
  if (g.minute < 8 * 60 || g.minute > 22 * 60) return 'È tardi per invitare qualcuno: domani!';
  if (g.sims.some(s => s.key === key)) return 'È già qui!';
  const p = g.town.people.find(x => x.key === key);
  const [ex, ey] = exitTile(g);
  const sim = makeNpc(p, ex + 0.5, ey + 0.5, { leaveAt: g.day * 1440 + g.minute + 180 + Math.random() * 120, guest: true });
  sim.needs.socialita = 30;   // ha voglia di chiacchierare
  g.sims.push(sim);
  notify(`🔔 ${p.name} sta arrivando a trovarvi!`);
  gameEvent(g, null, 'invito', notify);
  return null;
}
