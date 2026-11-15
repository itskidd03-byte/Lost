import * as THREE from 'three';
import { REGIONS, SEA_LEVEL, WORLD_SIZE, heightAt, terrainColor, isLand } from '../world/worldgen';
import { RNG, clamp } from '../core/rng';
import { BUILDING_BY_ID } from '../data/buildings';
import type { BuildingDef, BuildingInstance, NPC, World } from '../core/types';
import type { GccTheme } from '../data/graphics';
import { artDirection, type MaterialKey } from './artDirection';

const MATERIAL_COLORS: Record<string, number> = {
  Thatch: 0xb99a5b, Mudbrick: 0x9a7b56, Hide: 0x8a6a4a, Wattle: 0x9c8c62, Log: 0x7a5c3a,
  Stone: 0x8d8d86, Granite: 0x7d7d78, Timber: 0x7b5a38, Brick: 0x9c5a45, Slate: 0x555760,
  Marble: 0xd8d6cc, Glass: 0x9fc9d6, Steel: 0x8d97a3, Iron: 0x6a6f76, Copper: 0xa9714a,
  Bronze: 0xa8823f, Industrial: 0x6d6259, Modern: 0x93a0aa
};

/** Which memory-bank material a building's fabric belongs to. */
function materialKeyFor(def: BuildingDef): MaterialKey {
  const name = def.name.toLowerCase();
  if (/thatch|reed|turf|hide|wattle|bone|earth|mudbrick/.test(name)) return 'thatch';
  if (/iron|steel|copper|bronze|rivet|smokestack|industrial|glass|modern|modular|automated|solar/.test(name)) return 'metal';
  if (/log|timber|wood|carpent|palisade/.test(name)) return 'wood';
  if (/fabric|cloth|banner|tent/.test(name)) return 'fabric';
  return 'stone';
}

function materialColorFor(def: BuildingDef): number {
  const referenced = artDirection.color(materialKeyFor(def));
  // A little age-based lightening keeps successive eras visually distinct.
  const shade = 0.92 + Math.min(7, def.age) * 0.018;
  return new THREE.Color(referenced).multiplyScalar(shade).getHex();
}

export class WorldRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  private container: HTMLElement;

  private terrainMesh: THREE.Mesh | null = null;
  private water: THREE.Mesh | null = null;
  private sun: THREE.DirectionalLight;
  private ambient: THREE.HemisphereLight;
  private treeGroup = new THREE.Group();
  private resourceGroup = new THREE.Group();
  private plantingGroup = new THREE.Group();
  private plantingCount = -1;
  private themeTokens: GccTheme['tokens'] | null = null;
  private themePrimaryColor = new THREE.Color();
  private themeAccentColor = new THREE.Color();
  private themeBackgroundColor = new THREE.Color();
  private themeMutedColor = new THREE.Color();
  private themeTextColor = new THREE.Color();
  private terrainBaseColors: Float32Array | null = null;
  private interiorState: { building: BuildingInstance; def: BuildingDef; world: World } | null = null;
  private npcGroup = new THREE.Group();
  private buildingGroup = new THREE.Group();
  private corpseGroup = new THREE.Group();
  private interiorGroup = new THREE.Group();
  private npcMeshes = new Map<string, THREE.Group>();
  private buildingMeshes = new Map<string, THREE.Group>();
  private corpseMeshes = new Map<string, THREE.Object3D>();
  private raycaster = new THREE.Raycaster();
  private ghost: THREE.Mesh | null = null;
  private homeMarker: THREE.Mesh | null = null;
  private interiorMode = false;
  private interiorPosition = new THREE.Vector3(0, 0, 4);
  private lastWorldSeed = -1;
  private clockTime = 0;

  yaw = 0;
  /** Last travel direction of the player, so the body turns with the stick. */
  playerYaw: number | null = null;
  pitch = -0.18;
  cameraDistance = 11;
  /** Height the player is lifted while FLYING. */
  playerLift = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(62, container.clientWidth / container.clientHeight, 0.1, 3200);
    this.scene.fog = new THREE.Fog(0x9fc2d6, 260, 1500);

    this.ambient = new THREE.HemisphereLight(0xbfe0ff, 0x4a4a34, 0.85);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.5);
    this.sun.position.set(120, 240, 80);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 600;
    this.sun.shadow.camera.left = -160;
    this.sun.shadow.camera.right = 160;
    this.sun.shadow.camera.top = 160;
    this.sun.shadow.camera.bottom = -160;
    this.scene.add(this.sun);
    this.scene.add(this.treeGroup, this.resourceGroup, this.plantingGroup, this.npcGroup, this.buildingGroup, this.corpseGroup, this.interiorGroup);
    this.interiorGroup.visible = false;

    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  get portalMode(): boolean {
    return this.interiorMode;
  }

  /** Blend a base colour toward one role of the active world theme. */
  private themedColor(base: THREE.ColorRepresentation, role: keyof GccTheme['tokens'], amount: number): THREE.Color {
    const color = new THREE.Color(base);
    if (!this.themeTokens) return color;
    return color.lerp(new THREE.Color(this.themeTokens[role]), amount);
  }

  private refreshThemeColors(): void {
    const tokens = this.themeTokens;
    if (!tokens) return;
    this.themePrimaryColor.set(tokens.primary);
    this.themeAccentColor.set(tokens.accent);
    this.themeBackgroundColor.set(tokens.background);
    this.themeMutedColor.set(tokens.muted);
    this.themeTextColor.set(tokens.text);
  }

  /** Recolour the terrain vertices without rebuilding the planet. */
  private recolorTerrain(): void {
    if (!this.terrainMesh || !this.terrainBaseColors) return;
    const attribute = this.terrainMesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const target = attribute.array as Float32Array;
    const base = this.terrainBaseColors;
    if (!this.themeTokens) {
      target.set(base);
    } else {
      const p = this.themePrimaryColor;
      const a = this.themeAccentColor;
      const b = this.themeBackgroundColor;
      for (let i = 0; i < target.length; i += 3) {
        let r = base[i], g = base[i + 1], bl = base[i + 2];
        r += (p.r - r) * 0.26; g += (p.g - g) * 0.26; bl += (p.b - bl) * 0.26;
        r += (a.r - r) * 0.1; g += (a.g - g) * 0.1; bl += (a.b - bl) * 0.1;
        r += (b.r - r) * 0.12; g += (b.g - g) * 0.12; bl += (b.b - bl) * 0.12;
        target[i] = clamp(r, 0, 1);
        target[i + 1] = clamp(g, 0, 1);
        target[i + 2] = clamp(bl, 0, 1);
      }
    }
    attribute.needsUpdate = true;
  }

  private treeColors(): { trunk: THREE.Color; leaf: THREE.Color } {
    return {
      trunk: this.themedColor(artDirection.color('wood'), 'muted', 0.42),
      leaf: this.themedColor(artDirection.color('foliage'), 'primary', 0.34).lerp(this.themeAccentColor, this.themeTokens ? 0.1 : 0)
    };
  }

  private recolorTrees(): void {
    const trunks = this.treeGroup.children[0] as THREE.InstancedMesh | undefined;
    const leaves = this.treeGroup.children[1] as THREE.InstancedMesh | undefined;
    const colors = this.treeColors();
    if (trunks) (trunks.material as THREE.MeshLambertMaterial).color.copy(colors.trunk);
    if (leaves) (leaves.material as THREE.MeshLambertMaterial).color.copy(colors.leaf);
  }

  private recolorResources(): void {
    for (const child of this.resourceGroup.children) {
      const mesh = child as THREE.Mesh;
      const base = mesh.userData.baseColor as number | undefined;
      if (!base || !mesh.material) continue;
      (mesh.material as THREE.MeshLambertMaterial).color.copy(this.themedColor(base, 'accent', 0.18));
    }
  }

  buildTerrain(terrain: World['terrain']): void {
    if (this.lastWorldSeed === terrain.seed) return;
    this.lastWorldSeed = terrain.seed;
    if (this.terrainMesh) {
      this.scene.remove(this.terrainMesh);
      this.terrainMesh.geometry.dispose();
    }
    const res = terrain.resolution;
    const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, res - 1, res - 1);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(positions.count * 3);
    const rng = new RNG(terrain.seed ^ 0xabcdef);
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const h = heightAt(terrain, x, z);
      positions.setY(i, h);
      const gx = Math.round(((x + WORLD_SIZE / 2) / WORLD_SIZE) * (res - 1));
      const gz = Math.round(((z + WORLD_SIZE / 2) / WORLD_SIZE) * (res - 1));
      const idx = gz * res + gx;
      const biome = terrain.biome[clamp(idx, 0, res * res - 1)];
      const [r, g, b] = terrainColor(biome, h);
      const jitter = rng.range(-0.035, 0.035);
      colors[i * 3] = clamp(r + jitter, 0, 1);
      colors[i * 3 + 1] = clamp(g + jitter, 0, 1);
      colors[i * 3 + 2] = clamp(b + jitter, 0, 1);
    }
    this.terrainBaseColors = colors.slice();
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.terrainMesh = new THREE.Mesh(geometry, material);
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);
    // The whole island takes the active library palette, not just the sky.
    this.recolorTerrain();

    if (this.water) this.scene.remove(this.water);
    const waterGeo = new THREE.PlaneGeometry(WORLD_SIZE * 2.4, WORLD_SIZE * 2.4);
    waterGeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(waterGeo, new THREE.MeshPhongMaterial({
      color: 0x1f5468, transparent: true, opacity: 0.82, shininess: 90, specular: 0x9fd6ff
    }));
    this.water.position.y = SEA_LEVEL;
    this.scene.add(this.water);

    this.scatterTrees(terrain, rng);
  }

  private scatterTrees(terrain: World['terrain'], rng: RNG): void {
    this.treeGroup.clear();
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 5);
    const leafGeo = new THREE.ConeGeometry(1.7, 4.6, 6);
    const palette = this.treeColors();
    const trunkMat = new THREE.MeshLambertMaterial({ color: palette.trunk });
    const leafMat = new THREE.MeshLambertMaterial({ color: palette.leaf });
    const count = 2200;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
    leaves.castShadow = false;
    const matrix = new THREE.Matrix4();
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 12) {
      attempts++;
      const x = rng.range(-WORLD_SIZE / 2 + 30, WORLD_SIZE / 2 - 30);
      const z = rng.range(-WORLD_SIZE / 2 + 30, WORLD_SIZE / 2 - 30);
      if (!isLand(terrain, x, z)) continue;
      const h = heightAt(terrain, x, z);
      if (h < SEA_LEVEL + 1.2 || h > SEA_LEVEL + 32) continue;
      const region = REGIONS[terrain.regionIndex[
        Math.round(((z + WORLD_SIZE / 2) / WORLD_SIZE) * (terrain.resolution - 1)) * terrain.resolution
        + Math.round(((x + WORLD_SIZE / 2) / WORLD_SIZE) * (terrain.resolution - 1))
      ]];
      const density = region.biome === 'forest' ? 0.92 : region.biome === 'vale' ? 0.55 : region.biome === 'desert' ? 0.04 : region.biome === 'saltflat' ? 0.02 : 0.3;
      if (!rng.chance(density)) continue;
      const scale = rng.range(0.7, 1.5);
      matrix.makeTranslation(x, h + 1.2 * scale, z);
      matrix.scale(new THREE.Vector3(scale, scale, scale));
      trunks.setMatrixAt(placed, matrix);
      matrix.makeTranslation(x, h + 3.4 * scale, z);
      matrix.scale(new THREE.Vector3(scale, scale, scale));
      leaves.setMatrixAt(placed, matrix);
      placed++;
    }
    trunks.count = placed;
    leaves.count = placed;
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    this.treeGroup.add(trunks, leaves);
  }

  buildResources(world: World): void {
    this.resourceGroup.clear();
    const resources = world.resources;
    const geo = new THREE.DodecahedronGeometry(0.62, 0);
    const colors: Record<string, number> = {
      wood: 0x6b4a26, stone: 0x8f8f8a, iron: 0x7c8490, copper: 0xb1764a, gold: 0xd8b63f,
      clay: 0xa9744e, herbs: 0x6ea84f, fish: 0x6fa8c7, peat: 0x4a3a2a, salt: 0xefefe6, game: 0x9a7a52
    };
    for (const node of resources) {
      if (node.amount <= 0) continue;
      const base = colors[node.type] ?? 0x9a9a9a;
      const mat = new THREE.MeshLambertMaterial({ color: this.themedColor(base, 'accent', 0.18) });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.baseColor = base;
      const h = heightAt(world.terrain, node.position.x, node.position.z);
      mesh.position.set(node.position.x, h + 0.5, node.position.z);
      mesh.scale.setScalar(0.7 + Math.min(1.4, node.amount / 180));
      this.resourceGroup.add(mesh);
      if (this.resourceGroup.children.length > 900) break;
    }
  }

  private makeNPC(group: THREE.Group, npc: NPC, factionColor: number, playerColor: number): void {
    group.clear();
    const skinBase = new THREE.Color().setHSL(0.08, 0.35, clamp(npc.appearance.skin * 0.55, 0.25, 0.8));
    const skin = new THREE.Color(artDirection.blend(skinBase.getHex(), 'skin', 0.35)).lerp(this.themeTextColor, this.themeTokens ? 0.1 : 0);
    const cloth = new THREE.Color(npc.isPlayer ? playerColor : artDirection.blend(factionColor, 'fabric', 0.4));
    if (this.themeTokens) cloth.lerp(this.themePrimaryColor, 0.32);
    const bodyMat = new THREE.MeshLambertMaterial({ color: cloth });
    const skinMat = new THREE.MeshLambertMaterial({ color: skin });
    const height = clamp(npc.appearance.height, 1.4, 2);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.44, height * 0.62, 8), bodyMat);
    body.position.y = height * 0.42;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), skinMat);
    head.position.y = height * 0.82;
    const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, height * 0.36, 6), new THREE.MeshLambertMaterial({ color: this.themedColor(0x3d3229, 'muted', 0.3) }));
    legs.position.y = height * 0.16;
    group.add(body, head, legs);

    // Missing limbs are visible on the model.
    const rightArmLost = npc.body['upperArm:R']?.dismembered;
    const leftArmLost = npc.body['upperArm:L']?.dismembered;
    const rightHandLost = npc.body['hand:R']?.dismembered;
    const leftHandLost = npc.body['hand:L']?.dismembered;
    if (!leftArmLost) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, height * 0.42, 5), skinMat);
      arm.position.set(-0.46, height * 0.56, 0);
      group.add(arm);
      if (!leftHandLost) {
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), skinMat);
        hand.position.set(-0.46, height * 0.34, 0);
        group.add(hand);
      }
    }
    if (!rightArmLost) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, height * 0.42, 5), skinMat);
      arm.position.set(0.46, height * 0.56, 0);
      group.add(arm);
      if (!rightHandLost) {
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), skinMat);
        hand.position.set(0.46, height * 0.34, 0);
        group.add(hand);
      }
    }
    if (npc.body['shin:L']?.dismembered || npc.body['shin:R']?.dismembered || npc.body['foot:L']?.dismembered) {
      const crutch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, height * 0.8, 4), new THREE.MeshLambertMaterial({ color: 0x7a5a35 }));
      crutch.position.set(0.55, height * 0.4, 0.1);
      crutch.rotation.z = 0.16;
      group.add(crutch);
    }
    if (npc.weapon && npc.weapon.kind !== 'fist') {
      const weaponMat = new THREE.MeshLambertMaterial({ color: weaponColor(npc.weapon.kind) });
      const weaponMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, npc.weapon.ranged ? 1.4 : 1.1), weaponMat);
      weaponMesh.position.set(0.5, height * 0.45, 0.35);
      weaponMesh.rotation.x = npc.weapon.ranged ? 0 : 0.4;
      group.add(weaponMesh);
    }
    // Blood and injury markers.
    const wounded = Object.values(npc.body).some((p) => p.injuries.some((i) => i.severity > 0));
    if (wounded) {
      const bandage = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), new THREE.MeshLambertMaterial({ color: 0x8c2f2f }));
      bandage.position.set(0.22, height * 0.5, 0.3);
      group.add(bandage);
    }
    group.userData.npcId = npc.id;
    group.traverse((child) => {
      child.userData.npcId = npc.id;
    });
  }

  syncNPCs(world: World): void {
    const seen = new Set<string>();
    for (const npc of world.npcs.values()) {
      if (!npc.alive) continue;
      seen.add(npc.id);
      let group = this.npcMeshes.get(npc.id);
      const faction = npc.factionId ? world.factions.find((f) => f.id === npc.factionId) : null;
      if (!group) {
        group = new THREE.Group();
        this.npcMeshes.set(npc.id, group);
        this.npcGroup.add(group);
        this.makeNPC(group, npc, faction?.color ?? 0x9a9a9a, 0xf2d06b);
        group.userData.builtAt = 0;
      }
      // Rebuild the model when the body changes (dismemberment is permanent and visible).
      const lostSignature = `${Object.entries(npc.body).filter(([, p]) => p.dismembered).map(([k]) => k).join(',')}|${artDirection.version}`;
      if (group.userData.lostSignature !== lostSignature) {
        this.makeNPC(group, npc, faction?.color ?? 0x9a9a9a, 0xf2d06b);
        group.userData.lostSignature = lostSignature;
      }
      const h = heightAt(world.terrain, npc.position.x, npc.position.z);
      group.position.set(npc.position.x, h, npc.position.z);
      const moving = ['walking to forage', 'travelling to work', 'heading home', 'closing on', 'walking to market', 'on patrol', 'approaching', 'walking to water', 'seeking treatment'];
      const isMoving = moving.some((a) => npc.activity.includes(a));
      if (isMoving) {
        const bob = Math.sin(this.clockTime * 8 + npc.position.x) * 0.09;
        group.position.y = h + Math.abs(bob);
        group.rotation.y = Math.atan2(
          (npc.activityTarget?.x ?? 0) - npc.position.x,
          (npc.activityTarget?.z ?? 0) - npc.position.z
        );
      }
      if (npc.isPlayer) {
        if (this.playerYaw !== null) {
          const turn = Math.atan2(Math.sin(this.playerYaw - group.rotation.y), Math.cos(this.playerYaw - group.rotation.y));
          group.rotation.y += turn * 0.35;
        }
        const invisible = world.cheats?.powers?.invisible && world.cheats.bloodline?.includes('invisible');
        group.visible = world.currentInteriorId === null && !invisible;
        if (group.visible && this.playerLift > 0) group.position.y += this.playerLift;
      }
      const scale = npc.age < 16 ? 0.62 + npc.age * 0.02 : 1;
      group.scale.setScalar(scale);
      if (npc.age < 16) group.scale.y = scale * 0.92;
      if (npc.inCombat) group.scale.x *= 1.05;
    }
    for (const [id, group] of this.npcMeshes) {
      if (!seen.has(id)) {
        this.npcGroup.remove(group);
        this.npcMeshes.delete(id);
      }
    }
  }

  syncBuildings(world: World): void {
    const seen = new Set<string>();
    for (const building of world.buildings) {
      seen.add(building.id);
      let group = this.buildingMeshes.get(building.id);
      const stage = building.built ? 'complete' : this.constructionStageFor(building.progress);
      const signature = `${building.built}:${stage}:${building.defId}:${artDirection.version}`;
      if (!group) {
        group = new THREE.Group();
        this.buildingMeshes.set(building.id, group);
        this.buildingGroup.add(group);
        group.userData.signature = '';
      }
      if (group.userData.signature !== signature) {
        this.buildBuildingMesh(group, building, world);
        group.userData.signature = signature;
      }
      const bar = group.userData.progressBar as THREE.Object3D | undefined;
      if (bar) bar.scale.x = Math.max(0.02, building.progress);
      const h = heightAt(world.terrain, building.position.x, building.position.z);
      group.position.set(building.position.x, h, building.position.z);
      group.rotation.y = building.rotation;
      group.userData.buildingId = building.id;
    }
    for (const [id, group] of this.buildingMeshes) {
      if (!seen.has(id)) {
        this.buildingGroup.remove(group);
        this.buildingMeshes.delete(id);
      }
    }
  }

  private constructionStageFor(progress: number): 'foundations' | 'framing' | 'building' {
    if (progress >= 0.66) return 'building';
    if (progress >= 0.33) return 'framing';
    return 'foundations';
  }

  private buildBuildingMesh(group: THREE.Group, building: BuildingInstance, world: World): void {
    group.clear();
    group.userData.progressBar = null;
    const def = BUILDING_BY_ID.get(building.defId);
    const faction = building.factionId ? world.factions.find((f) => f.id === building.factionId) : null;
    const wallColor = this.themedColor(def ? materialColorFor(def) : 0x9a8a74, 'primary', 0.28);
    const size = building.size;
    const height = 2.6 + (def?.age ?? 0) * 0.22;
    if (!building.built) {
      this.buildConstructionMesh(group, building, size, height);
      return;
    }
    const wallMat = new THREE.MeshLambertMaterial({ color: wallColor });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(size, height, size * 0.86), wallMat);
    walls.position.y = height / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);

    const roofColor = this.themedColor(faction?.color ?? 0xc9b071, 'accent', 0.32);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(size * 0.78, 1.7 + (def?.age ?? 0) * 0.12, 4), new THREE.MeshLambertMaterial({ color: roofColor }));
    roof.position.y = height + 0.75;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    group.add(roof);

    // Windows glow at night; a door faces the settlement.
    const windowMat = new THREE.MeshBasicMaterial({ color: this.themedColor(0xffd88a, 'accent', 0.55) });
    for (const offset of [-0.9, 0.9]) {
      const window = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.1), windowMat);
      window.position.set(offset, height * 0.62, size * 0.44);
      group.add(window);
    }
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.12), new THREE.MeshLambertMaterial({ color: this.themedColor(0x3b2b1c, 'muted', 0.25) }));
    door.position.set(0, 0.8, size * 0.44);
    group.add(door);

    if (building.factionId === null && building.ownerId) {
      const banner = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.06), new THREE.MeshLambertMaterial({ color: this.themedColor(0xf2d06b, 'accent', 0.4) }));
      banner.position.set(size * 0.4, height + 0.3, 0);
      group.add(banner);
    }
    // Tall industrial buildings get a chimney.
    if ((def?.age ?? 0) >= 6 && def?.category !== 'Residential') {
      const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 3.4, 6), new THREE.MeshLambertMaterial({ color: this.themedColor(0x5a5148, 'muted', 0.3) }));
      chimney.position.set(size * 0.3, height + 1.6, -size * 0.2);
      group.add(chimney);
    }
  }

  /** Foundations, then framing, then walls: three visible stages before completion. */
  private buildConstructionMesh(group: THREE.Group, building: BuildingInstance, size: number, height: number): void {
    const stage = this.constructionStageFor(building.progress);
    const stone = new THREE.MeshLambertMaterial({ color: this.themedColor(0x8b8172, 'muted', 0.3) });
    const timber = new THREE.MeshLambertMaterial({ color: this.themedColor(0x7a5a35, 'primary', 0.25) });
    const stageColor = stage === 'foundations'
      ? this.themedColor(0x8d99a6, 'muted', 0.4)
      : stage === 'framing' ? this.themedColor(0xd8b45a, 'accent', 0.4) : this.themedColor(0x6ad07a, 'accent', 0.3);

    const pad = new THREE.Mesh(new THREE.BoxGeometry(size * 1.08, 0.28, size * 0.94), stone);
    pad.position.y = 0.14;
    pad.receiveShadow = true;
    group.add(pad);

    const postGeo = new THREE.BoxGeometry(0.18, height, 0.18);
    const corners: [number, number][] = [
      [-size * 0.42, -size * 0.36], [size * 0.42, -size * 0.36],
      [-size * 0.42, size * 0.36], [size * 0.42, size * 0.36]
    ];
    if (stage === 'foundations') {
      for (const [x, z] of corners) {
        const stake = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), timber);
        stake.position.set(x, 0.55, z);
        group.add(stake);
      }
      // String line around the footprint.
      const line = new THREE.Mesh(new THREE.BoxGeometry(size * 0.94, 0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0xd8b45a }));
      line.position.set(0, 0.62, size * 0.38);
      group.add(line);
    } else {
      for (const [x, z] of corners) {
        const post = new THREE.Mesh(postGeo, timber);
        post.position.set(x, height / 2 + 0.28, z);
        post.castShadow = true;
        group.add(post);
      }
      // Top ring beams and one diagonal brace.
      for (const z of [-size * 0.36, size * 0.36]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(size * 0.95, 0.16, 0.16), timber);
        beam.position.set(0, height + 0.32, z);
        group.add(beam);
      }
      for (const x of [-size * 0.42, size * 0.42]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, size * 0.8), timber);
        beam.position.set(x, height + 0.32, 0);
        group.add(beam);
      }
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.12, height * 1.1, 0.12), timber);
      brace.position.set(-size * 0.4, height * 0.52, size * 0.36);
      brace.rotation.z = 0.55;
      group.add(brace);
    }

    if (stage === 'building') {
      const walls = new THREE.Mesh(
        new THREE.BoxGeometry(size * 0.96, height * 0.82, size * 0.84),
        new THREE.MeshLambertMaterial({ color: 0xa9997c })
      );
      walls.position.y = height * 0.41 + 0.28;
      walls.castShadow = true;
      group.add(walls);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.6, 0.12), new THREE.MeshLambertMaterial({ color: this.themedColor(0x3b2b1c, 'muted', 0.25) }));
      door.position.set(0, 1.08, size * 0.43);
      group.add(door);
      const scaffold = new THREE.Mesh(
        new THREE.BoxGeometry(size * 1.12, height * 1.04, size),
        new THREE.MeshBasicMaterial({ color: 0xd8b45a, wireframe: true, opacity: 0.5, transparent: true })
      );
      scaffold.position.y = (height * 1.04) / 2;
      group.add(scaffold);
    }

    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(2.2, 0.16, 0.16),
      new THREE.MeshBasicMaterial({ color: stageColor })
    );
    bar.position.set(0, 0.34, size * 0.52);
    bar.scale.x = Math.max(0.02, building.progress);
    group.add(bar);
    group.userData.progressBar = bar;
  }

  syncCorpses(world: World): void {
    const seen = new Set<string>();
    for (const corpse of world.corpses) {
      seen.add(corpse.id);
      if (this.corpseMeshes.has(corpse.id)) continue;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.25, 1.9),
        new THREE.MeshLambertMaterial({ color: 0x4a2b2b })
      );
      const h = heightAt(world.terrain, corpse.position.x, corpse.position.z);
      mesh.position.set(corpse.position.x, h + 0.14, corpse.position.z);
      mesh.rotation.y = (corpse.tick % 6) * 0.5;
      this.corpseGroup.add(mesh);
      this.corpseMeshes.set(corpse.id, mesh);
    }
    for (const [id, mesh] of this.corpseMeshes) {
      if (!seen.has(id)) {
        this.corpseGroup.remove(mesh);
        this.corpseMeshes.delete(id);
      }
    }
  }

  sync(world: World): void {
    this.buildTerrain(world.terrain);
    this.syncNPCs(world);
    this.syncBuildings(world);
    this.syncCorpses(world);
    this.syncPlantings(world);
  }

  /** Trees Vela actually planted. Rebuilt only when the planting list grows. */
  syncPlantings(world: World): void {
    const plantings = world.plantings ?? [];
    if (plantings.length === this.plantingCount) return;
    this.plantingCount = plantings.length;
    this.plantingGroup.clear();
    if (!plantings.length) return;
    const palette = this.treeColors();
    const trunkMat = new THREE.MeshLambertMaterial({ color: palette.trunk });
    const leafMat = new THREE.MeshLambertMaterial({ color: palette.leaf });
    plantings.forEach((planting, index) => {
      const group = new THREE.Group();
      const height = 2.2 + ((index % 5) * 0.28);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, height, 5), trunkMat);
      trunk.position.y = height / 2;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.5 + height * 0.18, 3.6 + height * 0.3, 6), leafMat);
      crown.position.y = height + 1.5;
      group.add(trunk, crown);
      group.position.set(planting.x, heightAt(world.terrain, planting.x, planting.z), planting.z);
      group.rotation.y = (index % 7) * 0.9;
      this.plantingGroup.add(group);
    });
  }

  private updateHomeMarker(world: World): void {
    const player = world.npcs.get(world.playerId);
    const home = player?.homeId ? world.buildings.find((building) => building.id === player.homeId) : null;
    if (!this.homeMarker) {
      this.homeMarker = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.6, 0),
        new THREE.MeshBasicMaterial({
          color: 0xffd76a,
          transparent: true,
          opacity: 0.92,
          depthTest: false,
          depthWrite: false
        })
      );
      this.homeMarker.renderOrder = 40;
      this.scene.add(this.homeMarker);
    }
    if (!home?.built) {
      this.homeMarker.visible = false;
      return;
    }
    this.homeMarker.visible = true;
    const bob = Math.sin(this.clockTime * 2) * 0.25;
    const y = heightAt(world.terrain, home.position.x, home.position.z) + 7 + bob;
    this.homeMarker.position.set(home.position.x, y, home.position.z);
    this.homeMarker.rotation.y = this.clockTime * 1.2;
    const material = this.homeMarker.material as THREE.MeshBasicMaterial;
    material.color.setHex(0xffd76a);
  }

  updateEnvironment(world: World, dt: number): void {
    this.clockTime += dt;
    this.updateHomeMarker(world);
    const hour = world.minutes / 60;
    const dayFactor = Math.sin(((hour - 6) / 24) * Math.PI * 2) * 0.5 + 0.5;
    const light = clamp(dayFactor * 1.4, 0.12, 1.25);
    this.sun.intensity = light * (world.weather.current === 'Storm' ? 0.4 : world.weather.current === 'Overcast' ? 0.65 : 1.3);
    this.sun.position.set(
      Math.cos(((hour - 6) / 24) * Math.PI * 2) * 260,
      Math.max(20, Math.sin(((hour - 6) / 24) * Math.PI) * 300),
      Math.sin(((hour - 6) / 24) * Math.PI * 2) * 160
    );
    this.ambient.intensity = 0.25 + light * 0.7;
    const fogColor = new THREE.Color().setHSL(0.57, 0.35, 0.12 + light * 0.5);
    // A permanently adopted library theme must survive the day/night cycle.
    if (this.themeTokens) fogColor.lerp(this.themeBackgroundColor, 0.55);
    (this.scene.fog as THREE.Fog).color.copy(fogColor);
    this.scene.background = fogColor;
    if (this.water) {
      const mat = this.water.material as THREE.MeshPhongMaterial;
      mat.color.setHSL(0.53, 0.5, 0.16 + light * 0.12);
      if (this.themeTokens) {
        mat.color.lerp(this.themePrimaryColor, 0.38).lerp(this.themeAccentColor, 0.08);
      }
      this.water.position.y = SEA_LEVEL + Math.sin(this.clockTime * 0.6) * 0.08;
    }
    this.sun.castShadow = world.settings.shadows && light > 0.35;
    if (world.weather.current === 'Fog') {
      (this.scene.fog as THREE.Fog).near = 40;
      (this.scene.fog as THREE.Fog).far = 320;
    } else {
      (this.scene.fog as THREE.Fog).near = 220;
      (this.scene.fog as THREE.Fog).far = 1400;
    }
    if (world.weather.current === 'Rain' || world.weather.current === 'Storm') {
      const storm = new THREE.Color(0x4a5a66);
      if (this.themeTokens) storm.lerp(this.themeBackgroundColor, 0.45);
      this.scene.background = storm;
      (this.scene.fog as THREE.Fog).color.copy(storm);
    }
  }

  updateCamera(world: World, player: NPC, dt: number): void {
    if (world.finishing.active && world.finishing.victimId) {
      const victim = world.npcs.get(world.finishing.victimId);
      if (victim) {
        const state = world.finishing;
        state.cameraAngle += dt * 0.55;
        const angle = state.cameraAngle;
        const victimY = heightAt(world.terrain, victim.position.x, victim.position.z);
        const radius = state.phase === 'choosing' ? 6.5 : 5.2;
        const targetPos = new THREE.Vector3(
          victim.position.x + Math.cos(angle) * radius,
          victimY + 2.2 + Math.sin(angle * 0.7) * 0.6,
          victim.position.z + Math.sin(angle) * radius
        );
        const lookAt = new THREE.Vector3(victim.position.x, victimY + 1.2, victim.position.z);
        this.camera.position.lerp(targetPos, clamp(dt * 3.2, 0, 1));
        this.camera.lookAt(lookAt);
        return;
      }
    }
    if (this.interiorMode) {
      this.camera.position.set(this.interiorPosition.x, 1.68, this.interiorPosition.z);
      const dir = new THREE.Vector3(
        Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        Math.cos(this.yaw) * Math.cos(this.pitch)
      );
      this.camera.lookAt(this.camera.position.clone().add(dir));
      return;
    }
    const groundY = heightAt(world.terrain, player.position.x, player.position.z) + this.playerLift;
    const eye = new THREE.Vector3(player.position.x, groundY + 1.68, player.position.z);
    if (world.settings.firstPerson) {
      this.camera.position.copy(eye);
      const dir = new THREE.Vector3(
        Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        Math.cos(this.yaw) * Math.cos(this.pitch)
      );
      this.camera.lookAt(eye.clone().add(dir));
      return;
    }
    const focus = new THREE.Vector3(player.position.x, groundY + 1.35, player.position.z);
    const offset = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(-this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch)
    ).multiplyScalar(-this.cameraDistance);
    const desired = focus.clone().add(offset);
    desired.y = Math.max(desired.y, heightAt(world.terrain, desired.x, desired.z) + 1.1);
    this.camera.position.lerp(desired, clamp(dt * 9, 0, 1));
    this.camera.lookAt(focus);
  }

  /** Returns the NPC under the reticle, if any. */
  raycastNPC(world: World, maxDistance = 90): NPC | null {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const meshes: THREE.Object3D[] = [];
    for (const group of this.npcMeshes.values()) {
      if (group.visible) meshes.push(...group.children);
    }
    const hits = this.raycaster.intersectObjects(meshes, false);
    for (const hit of hits) {
      const id = hit.object.userData.npcId as string | undefined;
      if (!id) continue;
      const npc = world.npcs.get(id);
      if (npc?.alive && hit.distance <= maxDistance) return npc;
    }
    // Fall back to a soft aim assist: nearest NPC in front of the crosshair.
    const origin = this.camera.position;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    let best: NPC | null = null;
    let bestScore = 0.965;
    for (const npc of world.npcs.values()) {
      if (!npc.alive || npc.isPlayer) continue;
      const h = heightAt(world.terrain, npc.position.x, npc.position.z);
      const toNpc = new THREE.Vector3(npc.position.x, h + 1.05, npc.position.z).sub(origin);
      const distance = toNpc.length();
      if (distance > maxDistance) continue;
      const dot = toNpc.normalize().dot(dir);
      if (dot > bestScore) {
        bestScore = dot;
        best = npc;
      }
    }
    return best;
  }

  enterInterior(building: BuildingInstance, def: BuildingDef, world: World): void {
    this.interiorState = { building, def, world };
    this.interiorGroup.clear();
    this.interiorMode = true;
    this.interiorGroup.visible = true;
    this.interiorPosition.set(0, 0, 3);
    this.yaw = 0;
    this.pitch = -0.05;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(9, 0.2, 8),
      new THREE.MeshLambertMaterial({ color: this.themedColor(artDirection.color('wood'), 'primary', 0.25) })
    );
    floor.position.y = 0;
    this.interiorGroup.add(floor);

    const wallMat = new THREE.MeshLambertMaterial({ color: this.themedColor(artDirection.color('stone'), 'muted', 0.28) });
    const back = new THREE.Mesh(new THREE.BoxGeometry(9, 3.2, 0.24), wallMat);
    back.position.set(0, 1.6, -4);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.24, 3.2, 8), wallMat);
    left.position.set(-4.5, 1.6, 0);
    const right = left.clone();
    right.position.x = 4.5;
    const frontLeft = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 0.24), wallMat);
    frontLeft.position.set(-2.9, 1.6, 4);
    const frontRight = frontLeft.clone();
    frontRight.position.x = 2.9;
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(9, 0.2, 8), new THREE.MeshLambertMaterial({ color: this.themedColor(artDirection.color('thatch'), 'accent', 0.22) }));
    ceiling.position.y = 3.2;
    this.interiorGroup.add(back, left, right, frontLeft, frontRight, ceiling);

    const light = new THREE.PointLight(this.themedColor(0xffcf87, 'accent', 0.45), 22, 16);
    light.position.set(0, 2.6, 0);
    this.interiorGroup.add(light);
    this.interiorGroup.add(new THREE.AmbientLight(this.themedColor(0x9a8f7a, 'text', 0.3), 0.7));

    const furniture = def.interior;
    const rng = new RNG(building.id.length * 7919 + world.seed);
    furniture.forEach((item, index) => {
      const angle = (index / Math.max(1, furniture.length)) * Math.PI * 2;
      const radius = 2.4 + rng.range(-0.4, 0.6);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius * 0.7;
      this.interiorGroup.add(this.makeFurniture(item, x, z));
    });
    // Chest with the building's inventory.
    if (Object.keys(building.inventory).length) {
      const chest = this.makeFurniture('chest', 3.2, -3);
      this.interiorGroup.add(chest);
    }
    // Lord Slayer keeps the studio inside your own house.
    const owner = world.npcs.get(world.playerId);
    const slayer = world.designBotId ? world.npcs.get(world.designBotId) : null;
    if (slayer?.alive && owner?.homeId === building.id) {
      const figure = new THREE.Group();
      this.makeNPC(figure, slayer, 0x9a9a9a, 0xf2d06b);
      figure.position.set(2.6, 0, -1.7);
      figure.rotation.y = -0.5;
      this.interiorGroup.add(figure);
    }
    this.camera.position.set(0, 1.68, 3);
  }

  private makeFurniture(kind: string, x: number, z: number): THREE.Object3D {
    const group = new THREE.Group();
    group.position.set(x, 0.1, z);
    const wood = new THREE.MeshLambertMaterial({ color: this.themedColor(artDirection.color('wood'), 'primary', 0.3) });
    const cloth = new THREE.MeshLambertMaterial({ color: this.themedColor(artDirection.color('fabric'), 'accent', 0.22) });
    const metal = new THREE.MeshLambertMaterial({ color: this.themedColor(artDirection.color('metal'), 'muted', 0.3) });
    switch (kind) {
      case 'bed':
      case 'bunk':
      case 'cot': {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 2.1), wood);
        frame.position.y = 0.3;
        const mattress = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.2, 1.8), cloth);
        mattress.position.y = 0.62;
        group.add(frame, mattress);
        break;
      }
      case 'hearth':
      case 'furnace':
      case 'kiln': {
        const stone = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.1), new THREE.MeshLambertMaterial({ color: 0x6d6a63 }));
        stone.position.y = 0.7;
        const fire = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff8a3a }));
        fire.position.set(0, 0.5, 0.55);
        group.add(stone, fire);
        break;
      }
      case 'counter':
      case 'desk':
      case 'table':
      case 'mapTable': {
        const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.9), wood);
        top.position.y = 0.9;
        const legGeo = new THREE.BoxGeometry(0.1, 0.88, 0.1);
        for (const [dx, dz] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]]) {
          const leg = new THREE.Mesh(legGeo, wood);
          leg.position.set(dx, 0.44, dz);
          group.add(leg);
        }
        group.add(top);
        break;
      }
      case 'chair':
      case 'stool':
      case 'bench': {
        const seat = new THREE.Mesh(new THREE.BoxGeometry(kind === 'bench' ? 1.8 : 0.6, 0.12, 0.6), wood);
        seat.position.y = 0.5;
        group.add(seat);
        break;
      }
      case 'shelf':
      case 'bookshelf':
      case 'herbShelf':
      case 'weaponRack':
      case 'armorStand':
      case 'toolRack': {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2, 0.4), wood);
        frame.position.y = 1;
        group.add(frame);
        for (let i = 0; i < 3; i++) {
          const item = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.3), i % 2 ? cloth : metal);
          item.position.set(0, 0.6 + i * 0.5, 0.12);
          group.add(item);
        }
        break;
      }
      case 'chest':
      case 'crate':
      case 'barrel':
      case 'basket': {
        if (kind === 'barrel') {
          const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.1, 10), wood);
          barrel.position.y = 0.55;
          group.add(barrel);
        } else {
          const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.7), wood);
          box.position.y = 0.35;
          group.add(box);
        }
        break;
      }
      default: {
        const prop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), metal);
        prop.position.y = 0.35;
        group.add(prop);
      }
    }
    return group;
  }

  moveInterior(dx: number, dz: number): void {
    this.interiorPosition.x = clamp(this.interiorPosition.x + dx, -4, 4);
    this.interiorPosition.z = clamp(this.interiorPosition.z + dz, -3.4, 3.6);
  }

  exitInterior(): void {
    this.interiorState = null;
    this.interiorMode = false;
    this.interiorGroup.visible = false;
    this.interiorGroup.clear();
  }

  atInteriorDoor(): boolean {
    return this.interiorMode && this.interiorPosition.z > 3.1;
  }

  /** Apply the Graphics Command Center theme tokens to the scene and its people. */
  applyTheme(theme: GccTheme | null): void {
    if (!theme?.tokens) return;
    const current = this.themeTokens;
    if (current
      && current.primary === theme.tokens.primary
      && current.accent === theme.tokens.accent
      && current.background === theme.tokens.background
      && current.muted === theme.tokens.muted
      && current.text === theme.tokens.text) return;
    this.themeTokens = theme.tokens;
    this.refreshThemeColors();
    const background = this.themeBackgroundColor.clone();
    this.scene.background = background;
    this.renderer.setClearColor(background, 1);
    if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(background);
    this.sun.color.set(theme.tokens.primary);
    this.ambient.color.set(theme.tokens.text);
    this.ambient.groundColor.set(theme.tokens.muted);
    this.recolorTerrain();
    this.recolorTrees();
    this.recolorResources();
    if (this.water) {
      const material = this.water.material as THREE.MeshPhongMaterial;
      material.color.set(theme.tokens.primary).lerp(this.themeAccentColor, 0.12);
    }
    // Force rigs to rebuild with the themed palette on the next sync.
    for (const group of this.buildingMeshes.values()) group.userData.signature = '';
    for (const group of this.npcMeshes.values()) group.userData.lostSignature = '';
    this.plantingGroup.clear();
    this.plantingCount = -1;
    // If someone is indoors, repaint the room around them without moving them.
    if (this.interiorMode && this.interiorState) {
      const position = this.interiorPosition.clone();
      const yaw = this.yaw;
      const pitch = this.pitch;
      this.enterInterior(this.interiorState.building, this.interiorState.def, this.interiorState.world);
      this.interiorPosition.copy(position);
      this.yaw = yaw;
      this.pitch = pitch;
    }
  }

  /** Rebuild palette-dependent geometry after the reference library answers. */
  applyArtDirection(): void {
    this.recolorTrees();
    this.recolorResources();
    for (const group of this.buildingMeshes.values()) group.userData.signature = '';
    for (const group of this.npcMeshes.values()) group.userData.lostSignature = '';
    this.plantingGroup.clear();
    this.plantingCount = -1;
  }

  showGhost(world: World, position: { x: number; z: number }, valid: boolean): void {
    if (!this.ghost) {
      this.ghost = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 3, 3.6),
        new THREE.MeshBasicMaterial({ color: 0x6ad07a, transparent: true, opacity: 0.32, wireframe: true })
      );
      this.scene.add(this.ghost);
    }
    this.ghost.visible = true;
    const y = heightAt(world.terrain, position.x, position.z) + 1.5;
    this.ghost.position.set(position.x, y, position.z);
    (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(valid ? 0x6ad07a : 0xd05a4a);
  }

  hideGhost(): void {
    if (this.ghost) this.ghost.visible = false;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
    this.container.innerHTML = '';
  }
}

function weaponColor(kind: string): number {
  switch (kind) {
    case 'bow':
    case 'staff':
      return 0x7c5a33;
    case 'sword':
    case 'dagger':
      return 0xc4ccd4;
    case 'axe':
      return 0x9aa3ab;
    case 'musket':
    case 'crossbow':
      return 0x5a5148;
    default:
      return 0x8a8a8a;
  }
}
