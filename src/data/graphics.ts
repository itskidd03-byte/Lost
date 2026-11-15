/**
 * Graphics Command Center plugin: the exact drop-in runtime from the library,
 * loaded at play time (never bundled a key, reads are public).
 *
 *   GCC.startVisuals({ category: 'tex-metal', every: 60000 });
 *   document.addEventListener('gcc:theme', ...)
 *
 * The plugin rewrites `--gcc-*` CSS variables and emits `gcc:theme` with named
 * palette roles. We persist the last theme so the upgraded look survives a
 * reload, an offline launch and the graphics team being switched off.
 */

const PLUGIN_SRC = 'https://site-d460edd452c14327949ad468417abf82.freebuff.page/gcc-plugin.js';
const THEME_KEY = 'kotfi.theme.v1';

export interface GccTokens {
  primary: string;
  accent: string;
  background: string;
  surface: string;
  muted: string;
  text: string;
  onPrimary: string;
}

export interface GccTheme {
  mood: string;
  luminance: number;
  saturation: number;
  tokens: GccTokens;
  palette: string[];
  records?: { id: string; title: string; category: string; previewUrl: string; pageUrl: string; license: string }[];
  total?: number;
}

export interface GccVisualOptions {
  q?: string;
  category?: string;
  color?: string;
  limit?: number;
  every?: number;
  onTheme?: (theme: GccTheme) => void;
  onError?: (error: unknown) => void;
}

export interface GccApi {
  startVisuals(options: GccVisualOptions): Promise<GccTheme | null>;
  stopVisuals(): GccApi;
  refreshVisuals?(): Promise<GccTheme | null>;
  currentTheme?(): GccTheme | null;
  theme?(options: GccVisualOptions): Promise<GccTheme>;
  config?: { apiKey?: string };
}

type GccWindow = Window & { GCC?: GccApi };

/**
 * Baked metal palette used when the library cannot be reached (offline play).
 * The last theme actually pulled from the GCC always wins over this.
 */
export const OFFLINE_THEME: GccTheme = {
  mood: 'forged iron',
  luminance: 0.34,
  saturation: 0.24,
  palette: ['#151a1e', '#232a2f', '#9a4a3a', '#c9a36a', '#8b959b', '#f2e8d8'],
  tokens: {
    primary: '#9a4a3a',
    accent: '#d8b46a',
    background: '#151a1e',
    surface: '#232a2f',
    muted: '#8b959b',
    text: '#f2e8d8',
    onPrimary: '#151a1e'
  }
};

export function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

let loader: Promise<GccApi | null> | null = null;

/** Inject the library's own plugin script once and resolve its global. */
export function loadGraphicsPlugin(timeoutMs = 9000): Promise<GccApi | null> {
  if (loader) return loader;
  // No network: do not hang on a script request, and retry when we reconnect.
  if (isOffline()) return Promise.resolve(null);
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    loader = Promise.resolve(null);
    return loader;
  }
  loader = new Promise<GccApi | null>((resolve) => {
    const existing = (window as GccWindow).GCC;
    if (existing) {
      resolve(existing);
      return;
    }
    let settled = false;
    const finish = (api: GccApi | null) => {
      if (settled) return;
      settled = true;
      // Allow a later retry if the library was unreachable at boot.
      if (!api) loader = null;
      resolve(api);
    };
    document.addEventListener('gcc:ready', () => finish((window as GccWindow).GCC ?? null), { once: true });
    const script = document.createElement('script');
    script.src = PLUGIN_SRC;
    script.async = true;
    script.onload = () => finish((window as GccWindow).GCC ?? null);
    script.onerror = () => finish(null);
    document.head.appendChild(script);
    window.setTimeout(() => finish((window as GccWindow).GCC ?? null), timeoutMs);
  });
  return loader;
}

export function resetGraphicsPluginLoader(): void {
  loader = null;
}

export function loadSavedTheme(): GccTheme | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(THEME_KEY);
    if (!raw) return null;
    const theme = JSON.parse(raw) as GccTheme;
    return theme?.tokens ? theme : null;
  } catch {
    return null;
  }
}

export function saveTheme(theme: GccTheme): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  } catch {
    // Storage blocked: the theme still applies for this session.
  }
}

/** Lighten a token until it is legible on the dark HUD. */
export function readableAccent(hex: string): string {
  const value = String(hex || '').replace('#', '');
  if (value.length !== 6) return hex;
  const parse = (slice: string) => parseInt(slice, 16) / 255;
  const r = parse(value.slice(0, 2));
  const g = parse(value.slice(2, 4));
  const b = parse(value.slice(4, 6));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (luminance >= 0.42) return hex;
  const lift = (channel: number) => Math.round(Math.min(1, channel + (0.42 - luminance) * 0.7) * 255);
  return `#${[lift(r), lift(g), lift(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}
