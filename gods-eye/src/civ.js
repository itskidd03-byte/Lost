// A hundred settlers on the land you walk into.
//
// They start with nothing but what the ground gives them: berries in the grass,
// timber in the forest, fish in the pond, deer on the meadow. They carry what
// they gather back to the fire, raise huts with the wood, and the knowledge
// that piles up around the fire carries them from the Stone Age into the modern
// era. Everything here is simulated on the tiles of the region, so what you see
// walking is what is actually happening.

import * as THREE from 'three';

export const ERAS = [
  {
    id: 'stone',
    name: 'Stone Age',
    blurb: 'Foragers, flint and hide tents',
    huts: 3,
  },
  {
    id: 'bronze',
    name: 'Bronze Age',
    blurb: 'Kilns, cast bronze and the first fields',
    huts: 6,
    need: { pop: 26, food: 70, wood: 70, knowledge: 140 },
  },
  {
    id: 'iron',
    name: 'Iron Age',
    blurb: 'Iron ploughs and hill forts',
    huts: 9,
    need: { pop: 42, food: 110, wood: 100, knowledge: 420 },
  },
  {
    id: 'medieval',
    name: 'Medieval',
    blurb: 'Mills, guilds and stone keeps',
    huts: 12,
    need: { pop: 58, food: 150, wood: 130, knowledge: 880 },
  },
  {
    id: 'industrial',
    name: 'Industrial',
    blurb: 'Steam, rails and chimneys',
    huts: 15,
    need: { pop: 74, food: 200, wood: 170, knowledge: 1500 },
  },
  {
    id: 'modern',
    name: 'Modern Era',
    blurb: 'Glass, power lines and dishes on the roofs',
    huts: 18,
    need: { pop: 88, food: 260, wood: 210, knowledge: 2400 },
  },
];

const FIRST = [
  'Ash', 'Bryn', 'Cael', 'Dara', 'Ede', 'Fenn', 'Gorm', 'Hild', 'Ivo', 'Jori',
  'Kesh', 'Lios', 'Mara', 'Nemi', 'Orin', 'Pell', 'Quin', 'Rill', 'Saga', 'Tove',
];
const SECOND = ['of the ford', 'the quick', 'the patient', 'of the pines', 'the fisher', 'two-knives', 'the quiet', 'of the marsh'];

const BIOME_WOOD = new Set(['forest', 'deepforest', 'swamp']);
const BIOME_BERRIES = new Set(['grass', 'meadow', 'island', 'blackgrass', 'hills', 'tundra']);
const WATER = new Set(['ocean', 'coast', 'lake', 'river']);

function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function pick(list, r) {
  return list[Math.floor(r * list.length) % list.length];
}

export class Civ {
  constructor(region) {
    this.region = region;
    this.scene = region.scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.agents = [];
    this.huts = [];
    this.deer = [];
    this.food = 55;
    this.wood = 18;
    this.knowledge = 0;
    this.era = 0;
    this.home = { x: 0, z: 0, top: 0 };
    this.spots = { berries: [], wood: [], fish: [], grass: [] };
    this.onEra = null;
    this.lastAdvanceCheck = 0;
    this.time = 0;
    this.built = false;

    this.mats = this.makeMaterials();
    this.stoneGeo = new THREE.CapsuleGeometry(0.19, 0.68, 3, 6);
    this.headGeo = new THREE.SphereGeometry(0.14, 8, 6);
    this.legGeo = new THREE.CylinderGeometry(0.065, 0.055, 0.52, 5);
    this.deerGeo = new THREE.BoxGeometry(0.45, 0.42, 0.95);
    this.deerHeadGeo = new THREE.BoxGeometry(0.24, 0.24, 0.36);
  }

  makeMaterials() {
    const stone = new THREE.MeshStandardMaterial({ color: 0x8d8578, roughness: 0.95 });
    const hide = new THREE.MeshStandardMaterial({ color: 0x7a5c42, roughness: 0.95 });
    const thatch = new THREE.MeshStandardMaterial({ color: 0x9a7f45, roughness: 0.95 });
    const timber = new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.9 });
    const plaster = new THREE.MeshStandardMaterial({ color: 0xcfc3a8, roughness: 0.95 });
    const brick = new THREE.MeshStandardMaterial({ color: 0x7d4a3c, roughness: 0.95 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xbcdbe6, roughness: 0.25, metalness: 0.2 });
    const modern = new THREE.MeshStandardMaterial({ color: 0xd8dde0, roughness: 0.55 });
    const fur = new THREE.MeshStandardMaterial({ color: 0x6b5138, roughness: 1 });
    const ember = new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff5a12, emissiveIntensity: 2 });
    return { stone, hide, thatch, timber, plaster, brick, glassMat, modern, fur, ember };
  }

  /* ------------------------------- spawning -------------------------------- */

  spawn(saved = null) {
    if (this.built) return this;
    this.built = true;
    this.findHome();
    this.classifySpots();
    this.buildVillageCore();
    this.spawnDeer();

    const count = saved?.agentCount ?? 100;
    for (let i = 0; i < count; i++) this.spawnAgent(i);
    this.buildAgentMeshes();

    if (saved) {
      this.era = Math.min(saved.era ?? 0, ERAS.length - 1);
      this.food = saved.food ?? this.food;
      this.wood = saved.wood ?? this.wood;
      this.knowledge = saved.knowledge ?? 0;
      for (const hut of saved.huts || []) this.addHut(hut.x, hut.z, false);
      this.dressAgentsForEra();
    }
    return this;
  }

  findHome() {
    const center = this.region.tiles.get(`${this.region.center.x},${this.region.center.y}`);
    let best = null;
    if (center && center.land) best = center;
    if (!best) {
      for (const info of this.region.tiles.values()) {
        if (!info.land) continue;
        if (!best || Math.abs(info.x) + Math.abs(info.z) < Math.abs(best.x) + Math.abs(best.z)) best = info;
      }
    }
    this.home = best
      ? { x: best.x, z: best.z, top: best.top }
      : { x: 0, z: 0, top: this.region.groundAt(0, 0) };
  }

  classifySpots() {
    const info = [...this.region.tiles.values()];
    const isWater = (i) => WATER.has(i.tile?.biome);
    for (const i of info) {
      const biomeId = i.tile?.biome;
      if (i.land && BIOME_WOOD.has(biomeId)) this.spots.wood.push(i);
      if (i.land && BIOME_BERRIES.has(biomeId)) this.spots.berries.push(i);
      if (i.land && (i.tile?.fertility || 0) > 0.3) this.spots.grass.push(i);
      if (isWater(i) && info.some((n) => n.land && Math.abs(n.x - i.x) <= 4.1 && Math.abs(n.z - i.z) <= 4.1)) {
        this.spots.fish.push(i);
      }
    }
    // no pond in the patch? the sea still feeds them
    if (!this.spots.fish.length) this.spots.fish = info.filter(isWater);
    const near = (list) => list.sort(
      (a, b) => (Math.abs(a.x - this.home.x) + Math.abs(a.z - this.home.z))
        - (Math.abs(b.x - this.home.x) + Math.abs(b.z - this.home.z)),
    );
    near(this.spots.wood);
    near(this.spots.berries);
    near(this.spots.fish);
    near(this.spots.grass);
  }

  buildVillageCore() {
    const { x, z, top } = this.home;
    // the fire the whole village is named for
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.1, 6, 14), this.mats.stone);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, top + 0.06, z);
    this.group.add(ring);
    for (let i = 0; i < 6; i++) {
      const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.42, 5), this.mats.timber);
      const a = (i / 6) * Math.PI * 2;
      stake.position.set(x + Math.cos(a) * 0.5, top + 0.2, z + Math.sin(a) * 0.5);
      stake.rotation.z = Math.cos(a) * 0.3;
      this.group.add(stake);
    }
    const embers = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), this.mats.ember);
    embers.position.set(x, top + 0.16, z);
    this.group.add(embers);
    const light = new THREE.PointLight(0xffa04a, 2.2, 9, 2);
    light.position.set(x, top + 0.7, z);
    this.group.add(light);
    this.fire = light;
    this.fireBase = 2.2;
  }

  spawnDeer() {
    const spots = this.spots.grass.length ? this.spots.grass : this.spots.berries;
    if (!spots.length) return;
    for (let i = 0; i < 9; i++) {
      const spot = spots[i % spots.length];
      const x = spot.x + (hash(i * 3.1) - 0.5) * 5;
      const z = spot.z + (hash(i * 7.7) - 0.5) * 5;
      const group = new THREE.Group();
      const body = new THREE.Mesh(this.deerGeo, this.mats.fur);
      body.position.y = 0.75;
      const head = new THREE.Mesh(this.deerHeadGeo, this.mats.fur);
      head.position.set(0, 1.05, 0.5);
      group.add(body, head);
      group.position.set(x, this.region.groundAt(x, z), z);
      this.group.add(group);
      this.deer.push({ group, x, z, homeX: x, homeZ: z, alive: true, respawn: 0, phase: hash(i * 11) * 9 });
    }
  }

  spawnAgent(index) {
    const r = hash(index * 5.7);
    const r2 = hash(index * 13.3);
    const a = r * Math.PI * 2;
    const rad = 0.9 + r2 * 2.4;
    const x = this.home.x + Math.cos(a) * rad;
    const z = this.home.z + Math.sin(a) * rad;
    const name = `${pick(FIRST, r)} ${pick(SECOND, r2)}`;
    const agent = {
      id: index,
      name,
      x,
      z,
      y: this.region.groundAt(x, z),
      yaw: a,
      task: 'wandering',
      target: null,
      timer: 0,
      carrying: null,
      gait: r2 * 9,
    };
    this.agents.push(agent);
    this.chooseTask(agent);
    return agent;
  }

  // A hundred bodies is a hundred draws if each one is a mesh. They all share
  // one capsule and one head, so two instanced meshes carry the whole crowd.
  buildAgentMeshes() {
    const n = Math.max(1, this.agents.length);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc9a483, roughness: 0.9 });
    this.bodyMesh = new THREE.InstancedMesh(this.stoneGeo, bodyMat, n);
    this.bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.headMesh = new THREE.InstancedMesh(this.headGeo, new THREE.MeshStandardMaterial({ color: 0xb5896a, roughness: 0.9 }), n);
    this.headMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.legMesh = new THREE.InstancedMesh(this.legGeo, new THREE.MeshStandardMaterial({ color: 0x5a4634, roughness: 0.95 }), n * 2);
    this.legMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodyMesh.frustumCulled = false;
    this.headMesh.frustumCulled = false;
    this.legMesh.frustumCulled = false;
    this.group.add(this.bodyMesh, this.headMesh, this.legMesh);
    this.dummy = new THREE.Object3D();
    const skins = [0xc9a483, 0xb98f6b, 0x9a6f4f, 0xd6b193, 0xbf9a7a];
    const color = new THREE.Color();
    for (let i = 0; i < this.agents.length; i++) {
      this.bodyMesh.setColorAt(i, color.setHex(skins[i % skins.length]));
    }
    this.bodyMesh.instanceColor.needsUpdate = true;
    this.updateAgentMatrices();
  }

  updateAgentMatrices() {
    const d = this.dummy;
    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i];
      const swing = Math.sin(agent.gait) * 0.13;
      const fx = Math.sin(agent.yaw);
      const fz = Math.cos(agent.yaw);
      d.position.set(agent.x, agent.y + 0.78, agent.z);
      d.rotation.set(0, agent.yaw, 0);
      d.updateMatrix();
      this.bodyMesh.setMatrixAt(i, d.matrix);
      d.position.y = agent.y + 1.4;
      d.updateMatrix();
      this.headMesh.setMatrixAt(i, d.matrix);
      // two legs, swinging opposite each other
      d.position.set(agent.x + fx * swing, agent.y + 0.26, agent.z + fz * swing);
      d.rotation.set(0, agent.yaw, 0);
      d.updateMatrix();
      this.legMesh.setMatrixAt(i * 2, d.matrix);
      d.position.set(agent.x - fx * swing, agent.y + 0.26, agent.z - fz * swing);
      d.updateMatrix();
      this.legMesh.setMatrixAt(i * 2 + 1, d.matrix);
    }
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.headMesh.instanceMatrix.needsUpdate = true;
    this.legMesh.instanceMatrix.needsUpdate = true;
  }

  dressAgentsForEra() {
    if (!this.bodyMesh?.instanceColor) return;
    const palette = ['#c9a483', '#a98a6a', '#8d8a72', '#7a8494', '#8a7264', '#7d8a92'][this.era] || '#c9a483';
    const color = new THREE.Color(palette);
    for (let i = 0; i < this.agents.length; i++) this.bodyMesh.setColorAt(i, color.clone().offsetHSL(0, 0, (hash(i * 3.3) - 0.5) * 0.12));
    this.bodyMesh.instanceColor.needsUpdate = true;
  }

  /* -------------------------------- tasks ---------------------------------- */

  chooseTask(agent) {
    const pop = this.agents.length;
    const wantFood = pop * 1.6;
    const hutCost = 32;
    const cap = ERAS[this.era].huts;
    const r = hash(agent.id * 17.7 + this.time * 0.37);

    if (this.food < wantFood && r < 0.72) {
      const options = [];
      if (this.spots.berries.length) options.push(['forage', this.spots.berries, 1.5]);
      if (this.spots.fish.length) options.push(['fish', this.spots.fish, 1.9]);
      if (this.deer.some((d) => d.alive)) options.push(['hunt', null, 2.6]);
      if (options.length) {
        const pickIndex = Math.floor(hash(agent.id * 3.3 + this.time) * options.length) % options.length;
        const [kind, list, amount] = options[pickIndex];
        this.assignGather(agent, kind, list, amount);
        return;
      }
    }

    if (this.huts.length < cap && this.wood >= hutCost) {
      this.assignBuild(agent);
      return;
    }

    if ((this.wood < hutCost * 1.4 || this.huts.length < cap) && this.spots.wood.length) {
      this.assignGather(agent, 'wood', this.spots.wood, 1.6);
      return;
    }

    if (r < 0.34) {
      // sitting by the fire is how the era moves: talk, teach, remember
      agent.task = 'learning';
      agent.target = { x: this.home.x + (hash(agent.id * 2.1) - 0.5) * 2.2, z: this.home.z + (hash(agent.id * 4.4) - 0.5) * 2.2, kind: 'learn' };
      agent.timer = 0;
      return;
    }
    if (this.spots.berries.length && this.food < wantFood * 1.8) {
      this.assignGather(agent, 'forage', this.spots.berries, 1.5);
      return;
    }
    // otherwise a slow wander around the village
    agent.task = 'wandering';
    const a = hash(agent.id * 9.9 + this.time) * Math.PI * 2;
    const rad = 1.4 + hash(agent.id * 6.1) * 3.4;
    agent.target = { x: this.home.x + Math.cos(a) * rad, z: this.home.z + Math.sin(a) * rad, kind: 'wander' };
    agent.timer = 0;
  }

  assignGather(agent, kind, list, amount) {
    if (!list || !list.length) {
      agent.task = 'wandering';
      agent.target = { x: this.home.x, z: this.home.z, kind: 'wander' };
      return;
    }
    let spot = list[Math.floor(hash(agent.id * 2.7 + this.time * 0.7) * list.length) % list.length];
    for (let i = 0; i < 4; i++) {
      const cand = list[Math.floor(hash(agent.id * 3.1 + i * 7.7 + this.time * 0.3) * list.length) % list.length];
      const dCand = Math.hypot(cand.x - agent.x, cand.z - agent.z);
      if (dCand < Math.hypot(spot.x - agent.x, spot.z - agent.z)) spot = cand;
    }
    agent.task = kind;
    agent.yield = amount;
    agent.timer = 0;
    agent.target = {
      x: spot.x + (hash(agent.id * 5.5) - 0.5) * 2.2,
      z: spot.z + (hash(agent.id * 8.1) - 0.5) * 2.2,
      kind,
    };
  }

  assignBuild(agent) {
    // huts ring the fire outward, each with a little space around it
    const slot = this.huts.length + Math.floor(hash(agent.id * 5.1) * 1.6);
    const a = slot * 1.9 + hash(agent.id * 2.3) * 0.5;
    const rad = 3.2 + (slot % 3) * 1.3;
    const x = this.home.x + Math.cos(a) * rad;
    const z = this.home.z + Math.sin(a) * rad;
    agent.task = 'building';
    agent.timer = 0;
    agent.target = { x, z, kind: 'build' };
  }

  /* -------------------------------- update --------------------------------- */

  update(dt, elapsed, playerPos = null) {
    if (!this.built) return;
    // The sim runs on real time, not on frames: a slow phone should still see
    // the village work, so a long frame advances the whole settlement.
    this.time += dt;
    const speed = 1.3 + this.era * 0.24;
    for (const agent of this.agents) {
      const t = agent.target;
      if (!t) {
        this.chooseTask(agent);
        continue;
      }
      const dx = t.x - agent.x;
      const dz = t.z - agent.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.22) {
        const step = Math.min(dist, speed * dt);
        agent.x += (dx / dist) * step;
        agent.z += (dz / dist) * step;
        agent.yaw = Math.atan2(dx, dz);
        agent.gait += dt * 7;
      } else if (agent.task === 'forage' || agent.task === 'wood' || agent.task === 'fish' || agent.task === 'hunt' || agent.task === 'building' || agent.task === 'learning') {
        // working on the spot: a moment of labour, then the pot or the pile grows
        agent.timer += dt;
        const work = agent.task === 'building' ? 7 : agent.task === 'learning' ? 9 : 3.4;
        if (agent.timer >= work) {
          this.completeTask(agent);
          this.chooseTask(agent);
        }
      } else {
        agent.timer += dt;
        if (agent.timer > 2.2) this.chooseTask(agent);
      }

      const ground = this.region.groundAt(agent.x, agent.z);
      const bob = Math.abs(Math.sin(agent.gait)) * 0.045;
      agent.y = ground + bob;
      // keep a little space from the person watching them
      if (playerPos) {
        const ox = agent.x - playerPos.x;
        const oz = agent.z - playerPos.z;
        const d = Math.hypot(ox, oz);
        if (d < 0.9 && d > 0.001) {
          agent.x += (ox / d) * (0.9 - d) * 0.5;
          agent.z += (oz / d) * (0.9 - d) * 0.5;
        }
      }
    }
    if (this.bodyMesh) this.updateAgentMatrices();

    this.updateDeer(dt, this.time);
    if (this.fire) this.fire.intensity = this.fireBase + Math.sin(this.time * 5.5) * 0.35;

    if (this.time - this.lastAdvanceCheck > 0.75) {
      this.lastAdvanceCheck = this.time;
      this.grow();
    }
  }

  completeTask(agent) {
    const amount = agent.yield || 1.5;
    if (agent.task === 'forage') {
      this.food += amount * 2.4;
      this.knowledge += 0.085;
    } else if (agent.task === 'fish') {
      this.food += amount * 3.0;
      this.knowledge += 0.11;
    } else if (agent.task === 'wood') {
      this.wood += amount * 2.4;
      this.knowledge += 0.09;
    } else if (agent.task === 'hunt') {
      const deer = this.nearestDeer(agent.x, agent.z, 3.4);
      if (deer) {
        deer.alive = false;
        deer.group.visible = false;
        deer.respawn = 26;
        this.food += 7.5;
        this.knowledge += 0.12;
      } else {
        this.food += 1.2;
      }
    } else if (agent.task === 'building') {
      const cost = 32;
      if (this.wood >= cost && this.huts.length < ERAS[this.era].huts) {
        const hut = this.addHut(agent.target.x, agent.target.z, true);
        if (hut) {
          this.wood -= cost;
          this.knowledge += 0.5;
        }
      }
    } else if (agent.task === 'learning') {
      this.knowledge += 1.4 + (this.food > this.agents.length ? 0.6 : 0);
    }
    agent.yield = 0;
  }

  nearestDeer(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const d of this.deer) {
      if (!d.alive) continue;
      const dist = Math.hypot(d.x - x, d.z - z);
      if (dist < bestD) {
        bestD = dist;
        best = d;
      }
    }
    return best;
  }

  updateDeer(dt, elapsed) {
    for (const d of this.deer) {
      if (!d.alive) {
        d.respawn -= dt;
        if (d.respawn <= 0) {
          d.alive = true;
          d.group.visible = true;
          d.x = d.homeX;
          d.z = d.homeZ;
        }
        continue;
      }
      const t = elapsed * 0.4 + d.phase;
      d.x = d.homeX + Math.sin(t) * 2.2;
      d.z = d.homeZ + Math.cos(t * 0.8) * 2.0;
      d.group.position.set(d.x, this.region.groundAt(d.x, d.z), d.z);
      d.group.rotation.y = Math.sin(t) * 0.9;
    }
  }

  grow() {
    // the fire burns through the food you have stored
    const eat = this.agents.length * 0.11;
    this.food = Math.max(0, this.food - eat);
    this.food = Math.min(this.food, 280 + this.agents.length * 3);
    this.wood = Math.min(this.wood, 240 + this.agents.length * 2);

    const next = ERAS[this.era + 1];
    if (!next || !next.need) return;
    const pop = this.agents.length;
    const need = next.need;
    const villageBuilt = this.huts.length >= ERAS[this.era].huts;
    if (villageBuilt && pop >= need.pop && this.food >= need.food && this.wood >= need.wood && this.knowledge >= need.knowledge) {
      this.era += 1;
      this.dressAgentsForEra();
      this.rebuildHuts();
      if (this.onEra) this.onEra(ERAS[this.era], ERAS[this.era - 1]);
    }
  }

  /* ------------------------------- building -------------------------------- */

  addHut(x, z, announce) {
    if (this.huts.length >= 24) return null;
    for (const hut of this.huts) {
      if (Math.hypot(hut.x - x, hut.z - z) < 2.2) return null;
    }
    const group = this.hutMesh(this.era, this.huts.length);
    group.position.set(x, this.region.groundAt(x, z), z);
    group.rotation.y = hash(this.huts.length * 3.7) * Math.PI * 2;
    this.group.add(group);
    const hut = { x, z, group, era: this.era };
    this.huts.push(hut);
    if (announce) this.knowledge += 0.3;
    return hut;
  }

  rebuildHuts() {
    for (const hut of this.huts) {
      this.group.remove(hut.group);
    }
    const copy = this.huts.map((h) => ({ x: h.x, z: h.z }));
    this.huts.length = 0;
    for (const c of copy) this.addHut(c.x, c.z, false);
  }

  hutMesh(era, index) {
    const m = this.mats;
    const group = new THREE.Group();
    const variant = hash(index * 4.3);
    if (era === 0) {
      // hide tent over a few poles
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.05, 1.7, 7), m.hide);
      tent.position.y = 0.85;
      group.add(tent);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.05), m.timber);
      door.position.set(0, 0.4, 0.92);
      group.add(door);
    } else if (era === 1) {
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 1.0, 10), m.stone);
      wall.position.y = 0.5;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.1, 10), m.thatch);
      roof.position.y = 1.5;
      group.add(wall, roof);
    } else if (era === 2) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.15, 1.6), m.stone);
      wall.position.y = 0.58;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.9, 4), m.thatch);
      roof.position.y = 1.55;
      roof.rotation.y = Math.PI / 4;
      group.add(wall, roof);
    } else if (era === 3) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.35, 1.7), m.plaster);
      wall.position.y = 0.68;
      const beams = new THREE.Mesh(new THREE.BoxGeometry(2.14, 0.12, 1.74), m.timber);
      beams.position.y = 1.25;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.1, 4), m.thatch);
      roof.position.y = 1.9;
      roof.rotation.y = Math.PI / 4;
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.7, 0.28), m.brick);
      chimney.position.set(0.6, 2.15, -0.4);
      group.add(wall, beams, roof, chimney);
    } else if (era === 4) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.9, 1.8), m.brick);
      wall.position.y = 0.95;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 1.9), m.stone);
      roof.position.y = 1.95;
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.1, 8), m.brick);
      stack.position.set(0.8, 2.4, -0.5);
      const window1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), m.glassMat);
      window1.position.set(-0.45, 1.15, 0.92);
      group.add(wall, roof, stack, window1);
    } else {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.0, 1.9), m.modern);
      wall.position.y = 1.0;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.14, 2.0), m.stone);
      roof.position.y = 2.05;
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 0.06), m.glassMat);
      glass.position.set(0, 1.35, 0.96);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.1, 0.06), m.timber);
      door.position.set(0.85, 0.55, 0.96);
      const dish = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), m.modern);
      dish.position.set(-0.7, 2.2, -0.3);
      dish.rotation.x = -0.7;
      group.add(wall, roof, glass, door, dish);
    }
    if (variant > 0.6) group.scale.setScalar(0.9 + variant * 0.2);
    return group;
  }

  /* ------------------------------ readouts --------------------------------- */

  progressToNext() {
    const next = ERAS[this.era + 1];
    if (!next?.need) return 1;
    const n = next.need;
    const pop = this.agents.length;
    const parts = [
      Math.min(1, pop / n.pop),
      Math.min(1, this.food / n.food),
      Math.min(1, this.wood / n.wood),
      Math.min(1, this.knowledge / n.knowledge),
      Math.min(1, this.huts.length / ERAS[this.era].huts),
    ];
    return parts.reduce((a, b) => a + b, 0) / parts.length;
  }

  snapshot(playerPos = null) {
    const era = ERAS[this.era];
    const next = ERAS[this.era + 1] || null;
    let near = null;
    if (playerPos) {
      let bestD = Infinity;
      for (const agent of this.agents) {
        const d = Math.hypot(agent.x - playerPos.x, agent.z - playerPos.z);
        if (d < bestD) {
          bestD = d;
          near = agent;
        }
      }
    }
    return {
      era: era.name,
      blurb: era.blurb,
      next: next ? next.name : null,
      progress: this.progressToNext(),
      population: this.agents.length,
      food: Math.round(this.food),
      wood: Math.round(this.wood),
      huts: this.huts.length,
      hutCap: era.huts,
      knowledge: Math.round(this.knowledge),
      deer: this.deer.filter((d) => d.alive).length,
      task: near ? { name: near.name, doing: this.describe(near) } : null,
    };
  }

  describe(agent) {
    switch (agent.task) {
      case 'forage': return 'gathering berries and roots';
      case 'wood': return 'felling timber in the woods';
      case 'fish': return 'fishing the water';
      case 'hunt': return 'stalking a deer';
      case 'building': return 'raising a hut';
      case 'learning': return 'talking by the fire';
      default: return 'walking the village';
    }
  }

  serialize() {
    return {
      era: this.era,
      food: Math.round(this.food),
      wood: Math.round(this.wood),
      knowledge: Math.round(this.knowledge),
      huts: this.huts.map((h) => ({ x: +h.x.toFixed(2), z: +h.z.toFixed(2) })),
      agentCount: this.agents.length,
    };
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose?.();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m?.dispose?.();
      }
    });
    this.bodyMesh?.dispose?.();
    this.headMesh?.dispose?.();
    this.legMesh?.dispose?.();
    this.agents.length = 0;
    this.huts.length = 0;
    this.deer.length = 0;
  }
}
