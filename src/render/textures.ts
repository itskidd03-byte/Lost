import * as THREE from 'three';

/**
 * Curated material maps from the uploaded AEGIS graphics bank.
 *
 * These are the seamless texture records from the bank rather than whole
 * photographs, so they can repeat across the low-poly world without seams.
 * The originals are public-domain / CC0; source records stay in
 * AEGIS_GRAPHICS_MEMORY/MEMORY_INDEX.
 */
export type TextureKey =
  | 'ground'
  | 'stone'
  | 'brick'
  | 'wood'
  | 'thatch'
  | 'fabric'
  | 'leather'
  | 'bark';

interface TextureDef {
  file: string;
  repeat: [number, number];
  asset: string;
}

const DEFS: Record<TextureKey, TextureDef> = {
  ground: { file: 'ground.jpg', repeat: [180, 180], asset: 'FCN-0394 Coast Sand 01' },
  stone: { file: 'stone.jpg', repeat: [1.4, 1.4], asset: 'PHR-0377 Broken Wall' },
  brick: { file: 'brick.jpg', repeat: [1.5, 1.1], asset: 'PHR-0331 Plaster Brick Pattern' },
  wood: { file: 'wood.jpg', repeat: [1.2, 1.4], asset: 'PHR-0380 Brown Planks 03' },
  thatch: { file: 'thatch.jpg', repeat: [2.2, 1.4], asset: 'PHR-0386 Caban' },
  fabric: { file: 'fabric.jpg', repeat: [1.2, 1.2], asset: 'FCN-0399 Cotton Jersey' },
  leather: { file: 'leather.jpg', repeat: [1.2, 1.2], asset: 'PHR-0326 Brown Leather' },
  bark: { file: 'bark.jpg', repeat: [2, 4], asset: 'FCN-0342 Pine Bark' }
};

const textureRoot = (): string => {
  if (typeof document === 'undefined') return 'textures/';
  return new URL('textures/', document.baseURI).href;
};

export class TexturePack {
  private loader = new THREE.TextureLoader();
  private textures = new Map<TextureKey, THREE.Texture>();
  private pending = 0;
  private loaded = false;
  private listeners = new Set<() => void>();

  /** Start loading immediately; missing files simply leave the baked colours. */
  load(): void {
    const root = textureRoot();
    for (const key of Object.keys(DEFS) as TextureKey[]) {
      const def = DEFS[key];
      this.pending++;
      this.loader.load(
        `${root}${def.file}`,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(def.repeat[0], def.repeat[1]);
          texture.anisotropy = 4;
          this.textures.set(key, texture);
          this.finishOne();
        },
        undefined,
        () => this.finishOne()
      );
    }
  }

  private finishOne(): void {
    this.pending--;
    if (this.pending > 0 || this.loaded) return;
    this.loaded = true;
    for (const listener of this.listeners) listener();
    this.listeners.clear();
  }

  onReady(listener: () => void): void {
    if (this.loaded) listener();
    else this.listeners.add(listener);
  }

  get(key: TextureKey): THREE.Texture | undefined {
    return this.textures.get(key);
  }

  get assetCount(): number {
    return this.textures.size;
  }
}
