// La famiglia: proposta e matrimonio, gravidanza, neonato nella culla che cresce e diventa un bambino (va a scuola),
// animali domestici (cane e gatto) che girano per casa, e il tempo (sole, nuvole, pioggia).
import { TYPES } from './catalog.js';
import { canPlace, homeObjects, addMood, gameEvent, makePath, exitTile, floorAt, makeNpc } from './game.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = g => g.day * 1440 + g.minute;
const uid = () => Math.random().toString(36).slice(2, 9);
const pick = list => list[Math.floor(Math.random() * list.length)];
export const parents = g => g.sims.filter(s => !s.npc && !s.kid);

// ---------------------------------------------------------------- coppia
export const STAGES = { insieme: 'insieme', fidanzati: 'fidanzati 💍', sposati: 'sposati 💒' };
export const WEDDING_COST = 500;
/** Fine di una proposta: dice sì se il rapporto è forte e l'umore buono. */
export function proposal(g, sim, p, moodOf, notify) {
  if (g.couple.stage !== 'insieme') return;
  if (g.rel >= 80 && moodOf(p) >= 45) {
    g.couple = { stage: 'fidanzati', since: now(g) };
    for (const s of [sim, p]) addMood(g, s, 'fidanzati', '💍', 'Fidanzati!', 20, 2 * 1440);
    remember(g, '💍', `${sim.name} e ${p.name} si sono fidanzati`);
    notify(`💍 ${p.name} ha detto SÌ! ${sim.name} e ${p.name} sono fidanzati. Organizzate il matrimonio dal telefono (tocca il tuo Sim).`);
    gameEvent(g, sim, 'proposta', notify);
  } else {
    g.rel = clamp(g.rel - 10, 0, 100);
    addMood(g, sim, 'rifiutato', '💔', 'Proposta rifiutata', -15, 12 * 60);
    notify(`💔 ${p.name} non se la sente ancora… Fate crescere il rapporto (sopra l'80%) e riprovate quando è di buon umore.`);
  }
}
/** Il matrimonio: arrivano gli amici, la coppia si dice sì in giardino o in salotto. */
export function startWedding(g, notify) {
  if (g.couple.stage !== 'fidanzati') return 'Prima la proposta!';
  if (g.town.at) return 'Il matrimonio si fa a casa: tornate a casa.';
  if (g.money < WEDDING_COST) return `Servono ${WEDDING_COST} € per la festa.`;
  const [a, b] = parents(g);
  if (!a || !b || a.atWork || b.atWork) return 'Dovete esserci tutti e due.';
  g.money -= WEDDING_COST;
  const friends = Object.entries(g.town.friends).filter(([, f]) => f.rel >= 20).slice(0, 4);
  const [ex, ey] = exitTile(g);
  for (const [key] of friends) {
    if (g.sims.some(s => s.key === key)) continue;
    const person = g.town.people.find(x => x.key === key);
    if (person) g.sims.push(makeNpc(person, ex + 0.5 + Math.random(), ey + 0.5, { leaveAt: now(g) + 240, guest: true }));
  }
  g.party = { kind: 'matrimonio', until: now(g) + 180, guests: friends.length };
  for (const s of [a, b]) { s.queue = []; }
  a.queue.push({ kind: 'social', action: 'sposa', partner: b.id, by: 'you' });
  notify(`💒 Il giorno del matrimonio! ${friends.length ? `Arrivano gli invitati (${friends.map(([, f]) => f.name).join(', ')}).` : 'Una cerimonia intima, solo voi due.'}`);
  return null;
}
export function wedding(g, sim, p, notify) {
  g.couple = { stage: 'sposati', since: now(g) };
  const gifts = (g.party?.guests ?? 0) * 75;
  g.money += gifts;
  g.party = { kind: 'matrimonio', until: now(g) + 120, guests: g.party?.guests ?? 0, confetti: true };
  for (const s of [sim, p]) addMood(g, s, 'sposi', '💒', 'Appena sposati', 25, 3 * 1440);
  remember(g, '💒', `${sim.name} e ${p.name} si sono sposati`);
  notify(`💒 ${sim.name} e ${p.name} sono marito e moglie! Evviva gli sposi!${gifts ? ` Regali degli invitati: +${gifts} €` : ''}`);
  gameEvent(g, sim, 'matrimonio', notify);
}

// ---------------------------------------------------------------- bambini
const BABY_NAMES = { lei: ['Sofia', 'Aurora', 'Giulia', 'Ginevra', 'Beatrice', 'Alice', 'Emma', 'Vittoria'], lui: ['Leonardo', 'Francesco', 'Tommaso', 'Edoardo', 'Alessandro', 'Lorenzo', 'Mattia', 'Gabriele'] };
export const familySize = g => parents(g).length + g.sims.filter(s => s.kid).length + homeObjects(g).filter(o => o.baby).length + (g.pregnancy ? 1 : 0);
export function tryBaby(g, sim, p, notify) {
  if (g.pregnancy) return;
  if (familySize(g) >= 5) { notify('👨‍👩‍👧‍👦 La casa è già piena di bambini!'); return; }
  if (Math.random() < 0.6) {
    const mom = [sim, p].find(s => s.gender === 'lei') ?? p;
    g.pregnancy = { sim: mom.id, due: now(g) + 2 * 1440 };
    addMood(g, mom, 'incinta', '🤰', 'In dolce attesa', 10, 2 * 1440);
    notify(`🤰 ${mom.name} aspetta un bambino! Nascerà tra due giorni: preparate una culla (Arreda → Famiglia).`);
  } else notify('👶 Questa volta niente bebè… riprovate un\'altra volta!');
}
/** Nascita: il bimbo va nella culla (se non c'è, la regalano i nonni). */
function birth(g, notify) {
  let crib = g.objects.find(o => TYPES[o.type].crib && !o.baby);
  if (!crib) {
    const near = parents(g)[0] ?? g.sims[0];
    for (let r = 1; r < 8 && !crib; r++) {
      for (let dy = -r; dy <= r && !crib; dy++) for (let dx = -r; dx <= r && !crib; dx++) {
        const o = { id: uid(), type: 'culla', x: Math.floor(near.x) + dx, y: Math.floor(near.y) + dy, rot: 0, lv: near.lv, users: [] };
        if (floorAt(g, o.lv, o.x, o.y) !== 'erba' && canPlace(g, o)) { g.objects.push(o); crib = o; }
      }
    }
    if (crib) notify('🎁 I nonni vi hanno regalato una culla!');
  }
  if (!crib) { g.pregnancy.due = now(g) + 60; notify('🍼 Serve un posto per la culla: fate spazio in casa!'); return; }
  const gender = Math.random() < 0.5 ? 'lei' : 'lui';
  const name = pick(BABY_NAMES[gender]);
  const model = `${gender === 'lei' ? 'female' : 'male'}-${pick(['a', 'b', 'c', 'd', 'e', 'f'])}`;
  crib.baby = { name, gender, model, born: now(g), needs: { fame: 80, igiene: 80, energia: 80, socialita: 80 } };
  const mom = g.sims.find(s => s.id === g.pregnancy.sim);
  g.pregnancy = null;
  for (const s of parents(g)) addMood(g, s, 'genitori', '👶', 'Genitori felici', 20, 2 * 1440);
  remember(g, '👶', `È nat${gender === 'lei' ? 'a' : 'o'} ${name}`);
  notify(`👶 È nat${gender === 'lei' ? 'a' : 'o'} ${name}! Benvenut${gender === 'lei' ? 'a' : 'o'} in famiglia${mom ? `, ${mom.name} sta benissimo` : ''}. Tocca la culla per prendervene cura.`);
  notify('__baby__' + crib.id);
  gameEvent(g, null, 'bambino', notify);
}
const BABY_DECAY = { fame: 9, igiene: 6, energia: 5, socialita: 6 };
function babies(g, dt, notify) {
  for (const o of g.objects) {
    const b = o.baby;
    if (!b) continue;
    for (const k in BABY_DECAY) b.needs[k] = clamp(b.needs[k] - (BABY_DECAY[k] * dt) / 60, 0, 100);
    const low = Object.values(b.needs).some(v => v < 15);
    if (low && !b.cried) { b.cried = true; notify(`😭 ${b.name} piange! Tocca la culla.`); for (const s of parents(g)) addMood(g, s, 'pianto', '😭', 'Il bimbo piange', -8, 60); }
    if (!low) b.cried = false;
  }
}
function growUp(g, crib, notify, party = false) {
  const b = crib.baby;
  crib.baby = null;
  const household = g.sims.filter(s => !s.npc);
  const id = household.length;
  const kid = {
    id, kid: true, name: b.name, gender: b.gender, look: { model: b.model },
    needs: { fame: 80, energia: 80, igiene: 80, vescica: 80, svago: 70, socialita: 70 },
    x: crib.x + 0.5, y: crib.y + 1.5, lv: crib.lv ?? 0, path: [], queue: [], cur: null, face: 1, walk: 0,
    skills: { cucina: 0, fitness: 0, logica: 0, creativita: 0, carisma: 0, manualita: 0 }, job: { career: 'scuola', level: 1, perf: 0, days: 0 },
    atWork: false, alerted: {}, idle: 0, wishes: [], moodlets: [], since: now(g),
  };
  g.sims.splice(id, 0, kid);   // i Sim di famiglia stanno prima della gente in visita (l'indice è il loro numero)
  for (let i = 0; i < g.sims.length; i++) if (!g.sims[i].npc) g.sims[i].id = i;
  notify(`🎂 ${b.name} è cresciut${b.gender === 'lei' ? 'a' : 'o'}: adesso è un${b.gender === 'lei' ? 'a bambina' : ' bambino'}! Dal lunedì al venerdì va a scuola (8-14): aiutate${b.gender === 'lei' ? 'la' : 'lo'} con i compiti.`);
  remember(g, '🧒', `${b.name} è diventat${b.gender === 'lei' ? 'a una bambina' : 'o un bambino'}`);
  if (party) addMood(g, kid, 'compleanno', '🎂', 'Che bel compleanno!', 20, 1440);
}

// ---------------------------------------------------------------- età, compleanni e ricordi
const AGE_DAYS = { neonato: 3, bambino: 5, ragazzo: 7 };   // giorni prima del compleanno che fa cambiare età
/** Un ricordo per l'album di famiglia. */
export function remember(g, emoji, text) {
  g.memories ??= [];
  g.memories.push({ day: g.day, emoji, text });
  if (g.memories.length > 80) g.memories.shift();
}
/** Chi compie gli anni prossimamente: [{ who (Sim o culla), name, next (età), at (minuto) }], il più vicino prima. */
/** "una bambina", "un ragazzo", "grande": la prossima età detta bene. */
export function nextLabel(b) {
  const lei = (b.sim?.gender ?? b.crib?.baby?.gender) === 'lei';
  return b.next === 'adulto' ? 'grande' : b.next === 'bambino' ? (lei ? 'una bambina' : 'un bambino') : lei ? 'una ragazza' : 'un ragazzo';
}
export function birthdays(g) {
  const list = [];
  for (const o of g.objects) if (o.baby) list.push({ crib: o, name: o.baby.name, next: 'bambino', at: o.baby.born + AGE_DAYS.neonato * 1440 });
  for (const s of g.sims) if (s.kid) list.push({ sim: s, name: s.name, next: s.teen ? 'adulto' : 'ragazzo', at: (s.since ?? now(g)) + AGE_DAYS[s.teen ? 'ragazzo' : 'bambino'] * 1440 });
  return list.sort((a, b) => a.at - b.at);
}
function ageUp(g, b, notify, party = false) {
  if (b.crib) { growUp(g, b.crib, notify, party); return; }
  const s = b.sim;
  s.since = now(g);
  if (!s.teen) {
    s.teen = true;
    s.job = { career: 'liceo', level: s.job?.level ?? 1, perf: 0, days: 0 };
    notify(`🎂 ${s.name} è diventat${s.gender === 'lei' ? 'a una ragazza' : 'o un ragazzo'}! Adesso va al liceo (8-15) e può anche cucinare.`);
    remember(g, '🎂', `${s.name} è diventat${s.gender === 'lei' ? 'a una ragazza' : 'o un ragazzo'}`);
  } else {
    s.kid = false;
    s.teen = false;
    s.job = null;
    notify(`🎓 ${s.name} è diventat${s.gender === 'lei' ? 'a adulta' : 'o adulto'}! Adesso può cercarsi un lavoro (💼 Lavoro).`);
    remember(g, '🎓', `${s.name} è diventat${s.gender === 'lei' ? 'a adulta' : 'o adulto'}`);
  }
  if (party) addMood(g, s, 'compleanno', '🎂', 'Che bel compleanno!', 20, 1440);
}
/** Festa di compleanno con la torta: chi è più vicino al compleanno cresce subito, con coriandoli per tutti. */
export function celebrate(g, sim, cake, notify) {
  const b = birthdays(g)[0];
  if (!b) { notify('🎂 Nessuno compie gli anni… ma la torta è buona lo stesso!'); cake.party = true; cake.slices = 4; return; }
  notify(`🎉 Tanti auguri a ${b.name}! 🎂`);
  for (const s of g.sims) if (!s.atWork && !s.npc) addMood(g, s, 'festa', '🎉', 'Che festa!', 12, 360);
  g.party = { kind: 'compleanno', until: now(g) + 90, confetti: true, guests: 0 };
  cake.party = true;
  cake.slices = 4;
  ageUp(g, b, notify, true);
}
/** Torta: ordinata dal telefono, arriva subito accanto a chi l'ha ordinata. */
export function orderCake(g, sim, notify) {
  if (g.town.at) return 'Le torte si festeggiano a casa.';
  if (g.money < 40) return 'Non avete abbastanza soldi.';
  const o = placeNear(g, sim, 'torta');
  if (!o) return 'Non c\'è posto per la torta: fate spazio.';
  g.money -= 40;
  notify('🎂 È arrivata la torta! Toccala per festeggiare il compleanno.');
  return null;
}
function placeNear(g, near, type) {
  for (let r = 1; r < 8; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const o = { id: uid(), type, x: Math.floor(near.x) + dx, y: Math.floor(near.y) + dy, rot: 0, lv: near.lv, users: [] };
      if (floorAt(g, o.lv, o.x, o.y) !== 'erba' && canPlace(g, o)) { g.objects.push(o); return o; }
    }
  }
  return null;
}
function ages(g, notify) {
  for (const b of birthdays(g)) {
    const left = b.at - now(g);
    const key = (b.crib?.id ?? b.sim.id) + b.next;
    if (left <= 1440 && left > 0 && !g.reminded?.includes(key)) {
      (g.reminded ??= []).push(key);
      notify(`🎂 Domani ${b.name} diventa ${nextLabel(b)}! Ordinate una torta dal telefono per festeggiare.`);
    }
    if (left <= 0 && !g.town.at) ageUp(g, b, notify);
  }
}

// ---------------------------------------------------------------- animali domestici
export const PETS = {
  cane: { name: 'Cane', emoji: '🐶', price: 150, names: ['Fido', 'Rex', 'Pippo', 'Birba', 'Luna', 'Brio'], colors: ['#a16207', '#f5f5f4', '#1f2937', '#d97706'] },
  gatto: { name: 'Gatto', emoji: '🐱', price: 100, names: ['Micio', 'Tigre', 'Nuvola', 'Briciola', 'Romeo', 'Kiki'], colors: ['#f97316', '#e5e7eb', '#111827', '#9ca3af'] },
};
export const PET_ACTIONS = {
  accarezza: { id: 'accarezza', label: 'Accarezza', emoji: '🤗', dur: 8, gain: { socialita: 10, svago: 8 }, petGain: { svago: 25 } },
  giocaPet: { id: 'giocaPet', label: 'Gioca', emoji: '🎾', dur: 20, gain: { svago: 25, energia: -4 }, petGain: { svago: 55 } },
  nutri: { id: 'nutri', label: 'Dai da mangiare', emoji: '🦴', dur: 6, gain: {}, petGain: { fame: 70 } },
  lava: { id: 'lava', label: 'Fai il bagnetto', emoji: '🛁', dur: 15, gain: { igiene: -5 }, petGain: { igiene: 85 } },
  addestra: { id: 'addestra', label: 'Insegna un trucco', emoji: '🐾', dur: 25, gain: { svago: 10 }, petGain: { svago: 15 }, skill: 'carisma', special: 'trucco' },
};
export function adopt(g, kind, notify) {
  const P = PETS[kind];
  if (g.town.at) return 'Gli animali si adottano da casa.';
  if (g.pets.length >= 3) return 'Avete già tanti animali!';
  if (g.money < P.price) return 'Non avete abbastanza soldi.';
  g.money -= P.price;
  const [ex, ey] = exitTile(g);
  const pet = { id: uid(), kind, name: pick(P.names.filter(n => !g.pets.some(p => p.name === n))) ?? P.names[0], color: pick(P.colors), x: ex + 0.5, y: ey - 0.5, lv: 0,
    needs: { fame: 80, svago: 70, igiene: 80 }, path: [], state: 'idle', t: 0, tricks: 0 };
  g.pets.push(pet);
  remember(g, PETS[kind].emoji, `${pet.name} è entrato in famiglia`);
  notify(`${P.emoji} Benvenut${kind === 'gatto' ? 'o' : 'o'} ${pet.name}! Comprate una ciotola e una cuccia (Arreda → Famiglia). Toccatelo per coccolarlo.`);
  gameEvent(g, null, 'animale', notify);
  return null;
}
const PET_DECAY = { fame: 5, svago: 6, igiene: 2.5 };
const PET_WALK = 1.9;
function pets(g, dt, notify) {
  if (g.town.at) return;   // a casa vi aspettano (il tempo passa lo stesso)
  const hr = g.minute / 60;
  for (const p of g.pets) {
    for (const k in PET_DECAY) p.needs[k] = clamp(p.needs[k] - (PET_DECAY[k] * dt) / 60 * (p.state === 'sleep' ? 0.4 : 1), 0, 100);
    if (p.needs.fame < 10 && !p.hungry) { p.hungry = true; notify(`${PETS[p.kind].emoji} ${p.name} ha tanta fame! Riempite la ciotola o dategli da mangiare.`); }
    if (p.needs.fame > 40) p.hungry = false;
    // Tenuto da un Sim (coccole, gioco…): sta fermo finché il Sim non ha finito
    if (p.heldBy != null) {
      const s = g.sims.find(x => x.id === p.heldBy);
      if (s?.cur?.pet === p.id) { p.state = s.cur.state === 'do' ? 'play' : 'wait'; continue; }
      p.heldBy = null;
    }
    if (p.path.length) { petWalk(p, dt); continue; }
    p.t -= dt;
    if (p.state === 'eat' && p.bowl) { const b = g.objects.find(o => o.id === p.bowl); if (b) b.food = Math.max(0, (b.food ?? 0) - 1); p.bowl = null; }
    if (p.state === 'eat') { p.needs.fame = clamp(p.needs.fame + dt * 3, 0, 100); if (p.needs.fame >= 99 || p.t <= 0) { p.state = 'idle'; p.t = 5; } continue; }
    if (p.state === 'sleep' && hr >= 7 && hr < 22 && (p.t <= 0 || p.t > 60)) { p.state = 'idle'; p.t = 0; }   // sonnellino finito o è mattina
    if (p.state === 'sleep') continue;
    if (g.sims.some(s => !s.npc && !s.atWork && s.lv === p.lv && Math.hypot(s.x - p.x, s.y - p.y) < 2.5)) p.needs.svago = clamp(p.needs.svago + dt * 0.4, 0, 100);   // in compagnia si diverte
    if (p.t > 0) continue;
    // Cosa fare adesso: mangiare dalla ciotola, dormire, giocare, seguire qualcuno o girare
    const bowl = g.objects.find(o => TYPES[o.type].petFood && (o.food ?? 0) > 0 && (o.lv ?? 0) === p.lv);
    if (p.needs.fame < 45 && bowl) {
      if (goNear(g, p, bowl.x, bowl.y)) { p.next = { state: 'eat', t: 25, bowl: bowl.id }; continue; }
    }
    if (hr >= 22 || hr < 7) {
      const bed = g.objects.find(o => TYPES[o.type].petBed && (o.lv ?? 0) === p.lv);
      if (bed && !(Math.floor(p.x) === bed.x && Math.floor(p.y) === bed.y)) { if (goTo(g, p, bed.x, bed.y)) { p.next = { state: 'sleep', t: 600 }; continue; } }
      p.state = 'sleep'; p.t = 600; continue;
    }
    const toy = p.kind === 'gatto' && g.objects.find(o => TYPES[o.type].petToy && (o.lv ?? 0) === p.lv);
    if (toy && p.needs.svago < 50 && Math.random() < 0.6 && goNear(g, p, toy.x, toy.y)) { p.next = { state: 'play', t: 30, toy: true }; continue; }
    const fam = g.sims.filter(s => !s.npc && !s.atWork && s.lv === p.lv);
    if (fam.length && Math.random() < 0.45) { const s = pick(fam); goNear(g, p, Math.floor(s.x), Math.floor(s.y)); p.t = 6; continue; }
    if (Math.random() < 0.35) { p.state = p.kind === 'gatto' ? 'sleep' : 'idle'; p.t = 20 + Math.random() * 40; if (p.state === 'sleep') p.t = 40; continue; }
    const x = Math.floor(p.x + (Math.random() - 0.5) * 10), y = Math.floor(p.y + (Math.random() - 0.5) * 10);
    if (floorAt(g, p.lv, x, y) != null) goTo(g, p, x, y);
    p.t = 4 + Math.random() * 10;
  }
}
function goTo(g, p, x, y) {
  const path = makePath(g, p, [[x, y, p.lv]]);
  if (!path) return false;
  p.path = path;
  p.state = 'walk';
  return true;
}
function goNear(g, p, x, y) {
  const goals = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy, p.lv]);
  const path = makePath(g, p, goals);
  if (!path) return false;
  p.path = path;
  p.state = 'walk';
  p.faceTo = [x + 0.5, y + 0.5];
  return true;
}
function petWalk(p, dt) {
  let move = PET_WALK * dt;
  while (move > 0 && p.path.length) {
    const [tx, ty, tlv] = p.path[0];
    if ((tlv ?? p.lv) !== p.lv) { p.lv = tlv; p.x = tx + 0.5; p.y = ty + 0.5; p.path.shift(); continue; }
    const dx = tx + 0.5 - p.x, dy = ty + 0.5 - p.y, d = Math.hypot(dx, dy);
    if (d <= move) { p.x = tx + 0.5; p.y = ty + 0.5; p.path.shift(); move -= d; } else { p.x += (dx / d) * move; p.y += (dy / d) * move; move = 0; }
  }
  if (!p.path.length) {
    const n = p.next;
    p.next = null;
    p.state = n?.state ?? 'idle';
    p.t = n?.t ?? 3;
    if (n?.bowl) p.bowl = n.bowl;
  }
}
/** Il Sim ha finito un'azione con l'animale. */
export function petDone(g, sim, c, notify) {
  const p = g.pets.find(x => x.id === c.pet);
  if (!p) return;
  p.heldBy = null;
  p.state = 'idle';
  p.t = 3;
  if (c.special === 'trucco') {
    p.tricks = (p.tricks ?? 0) + 1;
    notify(p.tricks % 3 === 0 ? `🐾 ${p.name} ha imparato un trucco nuovo: ${pick(['dà la zampa', 'si siede', 'fa il morto', 'si gira', 'salta'])}!` : `🐾 ${p.name} ci sta provando…`);
  }
  addMood(g, sim, 'cucciolo', PETS[p.kind].emoji, `Coccole con ${p.name}`, 6, 180);
  gameEvent(g, sim, 'accarezza', notify);
}

// ---------------------------------------------------------------- tempo atmosferico
export const WEATHER = { sole: ['☀️', 'Sole'], nuvole: ['⛅', 'Nuvoloso'], pioggia: ['🌧️', 'Pioggia'] };
function weather(g) {
  g.weather ??= { kind: 'sole', until: now(g) + 300 };
  if (now(g) < g.weather.until) return;
  const r = Math.random();
  const kind = g.weather.kind === 'pioggia' ? (r < 0.6 ? 'nuvole' : 'sole') : r < 0.55 ? 'sole' : r < 0.82 ? 'nuvole' : 'pioggia';
  g.weather = { kind, until: now(g) + 120 + Math.random() * 300 };
}
const outdoor = (g, s) => { const f = floorAt(g, s.lv, Math.floor(s.x), Math.floor(s.y)); return s.lv === 0 && (f === 'erba' || f === 'pietra' || f == null); };

/** Tutto quello che succede in famiglia a ogni passo di tempo. */
export function familyTick(g, dt, notify) {
  weather(g);
  if (g.pregnancy && now(g) >= g.pregnancy.due && !g.town.at) birth(g, notify);
  if (!g.town.at) babies(g, dt, notify);
  ages(g, notify);
  pets(g, dt, notify);
  if (g.party && now(g) >= g.party.until) g.party = null;
  if (g.weather.kind === 'pioggia') for (const s of g.sims) if (!s.npc && !s.atWork && outdoor(g, s)) addMood(g, s, 'bagnato', '🌧️', 'Bagnat' + (s.gender === 'lei' ? 'a' : 'o') + ' dalla pioggia', -6, 90);
}
