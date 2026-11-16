// Johan and Jolene answer in their own voices when a typed order does not
// match anything they know how to do. Same device, same words, no model.

function seed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function pick(list, n) {
  return list[Math.floor(n * list.length) % list.length];
}

function quote(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'that';
  return clean.length > 64 ? `${clean.slice(0, 61).trim()}…` : clean;
}

const JOHAN_OPENER = [
  'Johan sets the chisel down.',
  'Johan turns the words over once, then again.',
  'Johan does not lift his eyes from the table.',
  'Johan drags one finger along the edge of the world.',
  'Johan leans back, and the chair complains.',
];

const JOHAN_CAN = [
  'I raise mountains, carve rivers, grow forests, fill lakes, make ground fertile and push up new land — and I can call weather down on any of it.',
  'Mountains, rivers, forests, lakes, fertile fields, new land. Storms, floods, fire, quakes, drought, plague. Those are my hands.',
  'What I do is ground: raise it, carve it, plant it, drown it, poison it, break it. What I cannot do is build a thing and call it mine.',
];

const JOHAN_ASK = [
  'Say it as ground and I will start.',
  'Tell me what the ground should become.',
  'Name the shape you want the land in.',
  'What are you trying to make happen out there?',
];

const JOLENE_OPENER = [
  'Jolene wipes her hands on her apron.',
  'Jolene keeps her eyes on the roofline.',
  'Jolene tilts her head at the table.',
  'Jolene sets the brush down, bristles up.',
];

const JOLENE_CAN = [
  'I paint, plant, fence and mend — trees, grass, water, a village, the whole board.',
  'I dress what already stands: trees, grass, water, the houses and the people under them.',
  'My work is the finish, not the frame. Trees, grass, water, rooftops, the shine on the whole board.',
];

const JOLENE_ASK = [
  'Tell me what to dress and I will dress it.',
  'Point me at a thing that exists.',
  'Say which part of the world wants finishing.',
];

export function johanReply(state, text, offset = 0) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  const n = (seed(lower) + offset) % 1;

  if (/^(hi|hey|hello|yo|morning|evening)\b/.test(lower)) {
    return {
      title: 'Johan grunts, not unkindly.',
      detail: `"You are here. Good. Look at what the world did while you were gone, then tell me what to change."`,
    };
  }
  if (/(how are you|are you (ok|okay|alright|well))/.test(lower)) {
    return {
      title: 'Johan considers it.',
      detail: '"Tired. The world does not stop when I do, so I stopped stopping." He nods at the table. "What do you need?"',
    };
  }
  if (/(who are you|what are you)/.test(lower)) {
    return {
      title: 'Johan looks up at last.',
      detail: '"Johan. I raise the ground and I live in it. Jolene and the others dress what I raise. You hold the eye."',
    };
  }
  if (/(thank|thanks|cheers)/.test(lower)) {
    return {
      title: 'Johan waves it away.',
      detail: '"Thank the ones doing the work. I only make the dirt."',
    };
  }
  if (/(what can you do|what do you do|how does this work|help|commands?)/.test(lower)) {
    return {
      title: 'Johan counts it off on the table.',
      detail: `"${pick(JOHAN_CAN, n)} I can give coin away too — to a person, to a building, to a whole settlement — I just cannot buy anything with it. Type it plainly: 'johan raise mountains', 'johan give to the baker'."`,
    };
  }
  if (/(build|castle|palace|tower|city|house|bridge|wall|road)/.test(lower)) {
    return {
      title: 'Johan shakes his head slowly.',
      detail: `"I do not build. That is the whole of it — I raise the ground and the world builds on it by itself. '${quote(raw)}' is a thing to be built, not raised."`,
    };
  }
  if (/(kill|destroy|murder|slay|wipe|army|war)/.test(lower)) {
    return {
      title: 'Johan goes very still.',
      detail: '"I break ground, not people. Quake, flood, fire, plague — those fall on whoever is standing there. I will not aim them at a name."',
    };
  }
  if (/(money|gold|rich|wealth|treasure)/.test(lower)) {
    return {
      title: 'Johan snorts.',
      detail: '"I do not make gold. I make ground that grows things, and the world turns that into money on its own — slowly, and badly."',
    };
  }
  if (/(own|buy|sell|deed|business|property)/.test(lower)) {
    return {
      title: 'Johan laughs once, without humour.',
      detail: '"No. Not land, not buildings, not businesses. Donations only, and the world decides what to do with them."',
    };
  }
  if (raw.endsWith('?')) {
    return {
      title: 'Johan meets the question flatly.',
      detail: `"I do not know. I have not been there." He taps the table. "${pick(JOHAN_ASK, n)}"`,
    };
  }

  return {
    title: pick(JOHAN_OPENER, n),
    detail: `"${quote(raw)}." He says it back like a stone he is testing the weight of. "${pick(JOHAN_CAN, (n * 3) % 1)} ${pick(JOHAN_ASK, (n * 7) % 1)}"`,
  };
}

export function joleneReply(state, text, offset = 0) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  const n = (seed(lower) + offset) % 1;

  if (/^(hi|hey|hello|yo|morning|evening)\b/.test(lower)) {
    return {
      title: 'Jolene smiles without stopping.',
      detail: '"You are the one with the eye. Good — look at the roofs, they came out straight."',
    };
  }
  if (/(who are you|what do you do)/.test(lower)) {
    return {
      title: 'Jolene wipes a brush on her apron.',
      detail: '"Jolene. I dress what Johan raises — trees, grass, water, the houses, the people standing under them. I do not claim a tile and I do not build one."',
    };
  }
  if (/(build|castle|palace|city|house|raise|found|dig)/.test(lower)) {
    return {
      title: 'Jolene steps back from the table.',
      detail: `"That is Johan's work, not mine. Ask him for ground and I will make it worth looking at. '${quote(raw)}' is his to raise."`,
    };
  }
  if (/(money|gold|own|buy|pay)/.test(lower)) {
    return {
      title: 'Jolene shrugs.',
      detail: '"I am paid in work. Nobody owns the ground here, and I would not know what to do with a deed."',
    };
  }
  if (raw.endsWith('?')) {
    return {
      title: 'Jolene thinks about it properly.',
      detail: `"Ask me for trees, grass, water, a village, or the whole board, and I will tell you what I can do with it. ${pick(JOLENE_ASK, n)}"`,
    };
  }

  return {
    title: pick(JOLENE_OPENER, n),
    detail: `"${quote(raw)}." She looks at the table, then at you. "${pick(JOLENE_CAN, (n * 3) % 1)} ${pick(JOLENE_ASK, (n * 7) % 1)}"`,
  };
}
