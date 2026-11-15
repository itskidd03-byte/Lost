/**
 * Local profiles for the island.
 *
 * This is deliberately device-local: the game is playable offline and its save
 * files live in localStorage. A username and PIN keep separate people's slots
 * apart; the PIN is salted and hashed, never stored as plain text. It is not a
 * server account and cannot protect a save from someone with access to the
 * device itself.
 */

const USERS_KEY = 'kotfi.auth.users.v1';
const SESSION_KEY = 'kotfi.auth.session.v1';
const LAST_USER_KEY = 'kotfi.auth.lastUser.v1';

export interface LocalProfile {
  id: string;
  username: string;
  usernameKey: string;
  salt: string;
  pinHash: string;
  pinFallback: string;
  pinAlgo: 'sha256' | 'fallback';
  createdAt: number;
  lastLoginAt: number;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  profile?: LocalProfile;
}

export function validateUsername(raw: string): string | null {
  const username = raw.trim();
  if (username.length < 3) return 'Username must be at least 3 characters.';
  if (username.length > 24) return 'Username must be at most 24 characters.';
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(username)) {
    return 'Use letters, numbers, spaces, dashes or underscores.';
  }
  return null;
}

export function validatePin(raw: string): string | null {
  if (!/^\d{4,8}$/.test(raw)) return 'PIN must be 4 to 8 digits.';
  return null;
}

function fallbackHash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x1000193;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b + code, 0x85ebca6b) ^ (b >>> 13);
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return bytesToHex(bytes);
}

function makeId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function hashSha256(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const bytes = new TextEncoder().encode(text);
    const digest = await subtle.digest('SHA-256', bytes);
    return bytesToHex(new Uint8Array(digest));
  } catch {
    return null;
  }
}

async function makePinRecord(pin: string, salt: string): Promise<Pick<LocalProfile, 'pinHash' | 'pinFallback' | 'pinAlgo'>> {
  const pinFallback = fallbackHash(`${salt}:${pin}`);
  const sha = await hashSha256(`${salt}:${pin}`);
  return { pinHash: sha ?? pinFallback, pinFallback, pinAlgo: sha ? 'sha256' : 'fallback' };
}

async function verifyPin(profile: LocalProfile, pin: string): Promise<boolean> {
  if (profile.pinAlgo === 'sha256') {
    const sha = await hashSha256(`${profile.salt}:${pin}`);
    if (sha) return sha === profile.pinHash;
  }
  return fallbackHash(`${profile.salt}:${pin}`) === profile.pinFallback;
}

function readUsers(): LocalProfile[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalProfile[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((profile) => profile
      && typeof profile.id === 'string'
      && typeof profile.username === 'string'
      && typeof profile.salt === 'string'
      && typeof profile.pinHash === 'string'
      && typeof profile.pinFallback === 'string');
  } catch {
    return [];
  }
}

function writeUsers(users: LocalProfile[]): boolean {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    return true;
  } catch {
    return false;
  }
}

function sessionUserId(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function setSession(profile: LocalProfile | null): void {
  try {
    if (profile) {
      localStorage.setItem(SESSION_KEY, profile.id);
      localStorage.setItem(LAST_USER_KEY, profile.username);
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // A blocked session only means the login screen appears next launch.
  }
}

export class AuthManager {
  private users: LocalProfile[];

  constructor() {
    this.users = readUsers();
  }

  get profiles(): LocalProfile[] {
    return [...this.users];
  }

  get usernames(): string[] {
    return this.users.map((profile) => profile.username);
  }

  get lastUsername(): string {
    try {
      return localStorage.getItem(LAST_USER_KEY) ?? this.users.at(-1)?.username ?? '';
    } catch {
      return this.users.at(-1)?.username ?? '';
    }
  }

  restore(): LocalProfile | null {
    const id = sessionUserId();
    if (!id) return null;
    return this.users.find((profile) => profile.id === id) ?? null;
  }

  async create(rawUsername: string, pin: string): Promise<AuthResult> {
    const usernameError = validateUsername(rawUsername);
    if (usernameError) return { ok: false, error: usernameError };
    const pinError = validatePin(pin);
    if (pinError) return { ok: false, error: pinError };
    const username = rawUsername.trim();
    const usernameKey = username.toLowerCase();
    if (this.users.some((profile) => profile.usernameKey === usernameKey)) {
      return { ok: false, error: 'That username already exists on this device. Sign in instead.' };
    }
    const salt = randomSalt();
    const pinRecord = await makePinRecord(pin, salt);
    const now = Date.now();
    const profile: LocalProfile = {
      id: makeId(),
      username,
      usernameKey,
      salt,
      ...pinRecord,
      createdAt: now,
      lastLoginAt: now
    };
    const next = [...this.users, profile];
    if (!writeUsers(next)) {
      return { ok: false, error: 'This browser blocked profile storage. Saves cannot be created.' };
    }
    this.users = next;
    setSession(profile);
    return { ok: true, profile };
  }

  async login(rawUsername: string, pin: string): Promise<AuthResult> {
    const usernameKey = rawUsername.trim().toLowerCase();
    const profile = this.users.find((entry) => entry.usernameKey === usernameKey);
    if (!profile) return { ok: false, error: 'Username or PIN is incorrect.' };
    if (!(await verifyPin(profile, pin))) {
      return { ok: false, error: 'Username or PIN is incorrect.' };
    }
    profile.lastLoginAt = Date.now();
    writeUsers(this.users);
    setSession(profile);
    return { ok: true, profile };
  }

  logout(): void {
    setSession(null);
  }
}
