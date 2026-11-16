// The mind of one villager: what they are good at, what they want, and what they
// do about it. Everything here is a small, cheap step run once a day per person;
// the point is that a town fills with people who learn their trade from the
// people beside them, chase their own wants, and raise families without being
// told to.
//
// This module never imports life.js — life.js imports it — so the helpers it
// needs are kept local.

const DESIRES = ['wealth', 'family', 'craft', 'fame', 'faith', 'wander'];

function pick(arr, rand) {
  return arr[Math.floor(rand() * arr.length)];
}

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function cohesion(rand) {
  return Math.round((0.12 + rand() * 0.8) * 100) / 100;
}

// Who someone is, before the town gets to them: a feel for one trade and a set
// of wants weighted by their character.
export function seedMind(npc, rand = Math.random) {
  npc.skill = npc.age > 16 ? cohesion(rand) : 0.05;
  npc.teacherId = null;
  npc.masteryDay = null;
  npc.desires = {
    wealth: clamp(npc.traits.ambition * 0.7 + rand() * 0.2, 0.05, 0.95),
    family: clamp(npc.traits.kindness * 0.7 + rand() * 0.25, 0.05, 0.95),
    craft: clamp(npc.traits.creativity * 0.75 + rand() * 0.2, 0.05, 0.95),
    fame: clamp(npc.traits.ambition * 0.5 + npc.traits.aggression * 0.35 + rand() * 0.15, 0.05, 0.95),
    faith: clamp(npc.traits.piety * 0.8 + rand() * 0.2, 0.05, 0.95),
    wander: clamp(npc.traits.curiosity * 0.5 + rand() * 0.3, 0.05, 0.9),
  };
  npc.focus = DESIRES.reduce((best, k) => (npc.desires[k] > npc.desires[best] ? k : best), 'craft');
  npc.mind = { learned: 0, taught: 0, lastEventDay: -999 };
  return npc;
}

// One pass over the town per day keeps the learning cheap: people looking for a
// teacher read this instead of every person scanning every other person.
export function buildTeachingIndex(state) {
  const index = new Map();
  for (const npc of state.npcs) {
    if (!npc.alive || npc.age < 14 || !npc.job || npc.job === 'child') continue;
    if (npc.skill === undefined) continue;
    const key = `${npc.settlementId ?? 'wild'}|${npc.job}`;
    let list = index.get(key);
    if (!list) index.set(key, (list = []));
    if (list.length < 4) {
      list.push(npc);
      list.sort((a, b) => b.skill - a.skill);
    } else if (npc.skill > list[3].skill) {
      list[3] = npc;
      list.sort((a, b) => b.skill - a.skill);
    }
  }
  return index;
}

// A person worth learning from: same trade, further along in it.
function findTeacher(npc, index, state) {
  if (!index) return null;
  const list = index.get(`${npc.settlementId ?? 'wild'}|${npc.job}`);
  if (!list) return null;
  let best = null;
  let bestSkill = npc.skill + 0.08;
  for (const other of list) {
    if (other.id === npc.id || other.skill <= bestSkill) continue;
    best = other;
    bestSkill = other.skill;
  }
  return best;
}

function say(state, npc, title, detail, extra = {}) {
  if (npc.mind.lastEventDay === state.world.day) return;
  npc.mind.lastEventDay = state.world.day;
  state.events.push({
    id: ++state.eventSeq,
    day: state.world.day,
    category: 'life',
    type: 'choice',
    title,
    detail,
    where: extra.where || `${npc.x},${npc.y}`,
    actors: [npc.id],
    consequence: extra.consequence || '',
  });
  if (state.events.length > 4000) state.events.shift();
}

// The day of one mind: practise the trade, learn from whoever is further along,
// then try to get one thing that is wanted.
export function tickMind(state, npc, rand = Math.random, index = null) {
  // towns saved before people had minds, and children born on the same day, are
  // given one here rather than crashing the day
  if (!npc.skill || !npc.desires || !npc.mind) seedMind(npc, rand);
  const s = state.settlements.find((x) => x.id === npc.settlementId && x.alive) || null;
  const working = npc.age >= 14 && npc.job !== 'child' && npc.job !== 'infant';

  if (working) {
    const teacher = findTeacher(npc, index, state);
    if (teacher) {
      if (!teacher.mind) teacher.mind = { learned: 0, taught: 0, lastEventDay: -999 };
      npc.teacherId = teacher.id;
      // watching a better pair of hands is worth more than working alone
      npc.skill = clamp(npc.skill + 0.0034 * (0.5 + npc.traits.curiosity), 0, 0.99);
      npc.mind.learned += 1;
      teacher.skill = clamp(teacher.skill + 0.0008 * (0.5 + teacher.traits.kindness), 0, 0.99);
      teacher.mind.taught += 1;
      if (rand() < 0.012 && npc.skill > 0.35) {
        say(state, npc, `${npc.firstName} learns ${npc.job} from ${teacher.firstName}`,
          `${npc.firstName} ${npc.familyName} works beside ${teacher.name}, who knows the ${npc.job}'s trade better. Day by day the work comes easier.`,
          { where: s ? s.name : `${npc.x},${npc.y}`, consequence: `Skill now ${Math.round(npc.skill * 100)}%.` });
      }
    } else {
      npc.teacherId = null;
      npc.skill = clamp(npc.skill + 0.0012 * (0.4 + npc.traits.curiosity), 0, 0.99);
    }
    // mastery is worth a line in the journal once
    if (npc.skill > 0.88 && !npc.masteryDay) {
      npc.masteryDay = state.world.day;
      say(state, npc, `${npc.firstName} is a master ${npc.job}`,
        `After years at the work, ${npc.name} of ${s ? s.name : 'the wilds'} is spoken of as a master ${npc.job}.`,
        { where: s ? s.name : `${npc.x},${npc.y}`, consequence: 'Their hands make better work, and the town knows it.' });
    }
  }

  // wants grow when nothing feeds them, at the pace of the want itself: a hunger
  // for the road is slower to fill a person than a hunger for better work
  const GROWTH = { wealth: 0.006, family: 0.007, craft: 0.006, fame: 0.004, faith: 0.003, wander: 0.0018 };
  for (const key of DESIRES) {
    const fed = desireFed(npc, key);
    npc.desires[key] = clamp(npc.desires[key] + (fed ? -0.02 : GROWTH[key] * (0.6 + rand() * 0.8)), 0.02, 1);
  }
  npc.focus = DESIRES.reduce((best, k) => (npc.desires[k] > npc.desires[best] ? k : best), npc.focus || 'craft');

  if (npc.desires[npc.focus] < 0.62 || npc.age < 14) return;
  act(state, npc, npc.focus, s, rand);
}

function desireFed(npc, key) {
  if (key === 'family') return !!npc.partnerId;
  if (key === 'wealth') return npc.wealth > 40;
  if (key === 'craft') return npc.skill > 0.7;
  if (key === 'fame') return !!npc.renown && npc.renown > 0.4;
  if (key === 'faith') return npc.happiness > 0.7;
  return false;
}

function act(state, npc, focus, s, rand) {
  switch (focus) {
    case 'wealth': {
      // they take on more work, and once they have capital they want a trade
      npc.wealth += 1.2 + npc.skill * 2.4;
      if (!npc.businessId && npc.wealth > 22 && rand() < 0.2) {
        npc.wantsBusiness = true;
        if (rand() < 0.12) {
          say(state, npc, `${npc.firstName} saves for a shop`,
            `${npc.name} of ${s ? s.name : 'the wilds'} is putting by coin to open a ${pick(['smithy', 'mill', 'tavern', 'pottery', 'trading post'], rand)} of their own.`,
            { where: s ? s.name : `${npc.x},${npc.y}`, consequence: 'Capital gathers in the town.' });
        }
      }
      npc.desires.wealth *= 0.5;
      break;
    }
    case 'family': {
      // with a partner the want becomes children; the chance to conceive rises
      if (npc.partnerId) {
        npc.wantsChild = true;
        npc.desires.family *= 0.7;
      } else {
        npc.courting = true;
        npc.desires.family *= 0.85;
      }
      break;
    }
    case 'craft': {
      if (s) s.culture += 0.0006 + npc.skill * 0.0012;
      npc.happiness = clamp(npc.happiness + 0.03, 0.05, 1);
      npc.desires.craft *= 0.55;
      if (rand() < 0.05 && npc.skill > 0.5) {
        npc.renown = clamp((npc.renown || 0) + 0.12, 0, 1);
        say(state, npc, `${npc.firstName}'s ${npc.job} work is noticed`,
          `A piece of ${npc.name}'s ${npc.job} work went further than the town gate, and people in ${s ? s.name : 'the region'} began to ask who made it.`,
          { where: s ? s.name : `${npc.x},${npc.y}`, consequence: 'Their name travels.' });
      }
      break;
    }
    case 'fame': {
      npc.renown = clamp((npc.renown || 0) + 0.05, 0, 1);
      if (s && s.leaderId !== npc.id && npc.traits.ambition > 0.55 && rand() < 0.03) {
        const leader = state.npcs.find((n) => n.id === s.leaderId && n.alive);
        if (leader) {
          // an ambitious settler stands against a weak or old leader
          const weak = leader.age > 52 || leader.happiness < 0.4 || leader.renown < npc.renown;
          if (weak) {
            s.leaderId = npc.id;
            say(state, npc, `${npc.firstName} takes charge of ${s.name}`,
              `${npc.name} argued the town's business better than ${leader.name}, and ${s.name} followed them for it.`,
              { where: s.name, consequence: 'A new hand at the head of the town.' });
          }
        }
      }
      npc.desires.fame *= 0.7;
      break;
    }
    case 'faith': {
      npc.happiness = clamp(npc.happiness + 0.05, 0.05, 1);
      if (s) s.culture += 0.0008;
      npc.desires.faith *= 0.6;
      if (rand() < 0.02 && s) {
        say(state, npc, `${npc.firstName} keeps a shrine`,
          `${npc.name} set stones and a lamp at the edge of ${s.name}, and others now stop there on the way to the fields.`,
          { where: s.name, consequence: 'Settlers gather where the lamp burns.' });
      }
      break;
    }
    case 'wander': {
      if (s && s.population > 10) {
        npc.happiness = clamp(npc.happiness + 0.02, 0.05, 1);
        if (rand() < 0.15) npc.readyToLeave = true;
        if (rand() < 0.03) {
          say(state, npc, `${npc.firstName} talks of the road`,
            `${npc.name} has been asking travellers what lies past ${s.name}, and keeps a pack by the door.`,
            { where: s.name });
        }
      }
      npc.desires.wander *= 0.75;
      break;
    }
    default:
      break;
  }
}

// The job a young person takes up: their parents' trade if they watched it, the
// work of whoever taught them, or whatever suits their curiosity.
export function chooseTrade(npc, state, rand = Math.random) {
  const parents = state.npcs.filter((n) => npc.parentIds.includes(n.id));
  const line = parents.filter((p) => p.job && p.job !== 'child');
  if (line.length && rand() < 0.7) {
    const trade = pick(line, rand);
    return { job: trade.job, skill: clamp(0.18 + trade.skill * 0.35, 0, 0.6) };
  }
  const trades = ['forager', 'farmer', 'woodcutter', 'fisher', 'potter', 'weaver', 'smith', 'trader', 'healer', 'builder', 'herder', 'miner', 'scholar', 'guard'];
  return { job: pick(trades, rand), skill: clamp(0.08 + rand() * 0.2, 0, 0.5) };
}

export function mindSummary(npc) {
  if (!npc?.desires) return '';
  const wants = DESIRES
    .filter((k) => npc.desires[k] > 0.55)
    .sort((a, b) => npc.desires[b] - npc.desires[a])
    .slice(0, 2)
    .map((k) => ({ wealth: 'coin', family: 'a family', craft: 'better work', fame: 'a name', faith: 'quiet', wander: 'the road' }[k]));
  const skill = Math.round((npc.skill || 0) * 100);
  return `${skill}% at ${npc.job}${wants.length ? ` · wants ${wants.join(', ')}` : ''}`;
}

export { DESIRES };
