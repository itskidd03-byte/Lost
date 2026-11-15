/**
 * Shared storage scope for the signed-in local profile.
 *
 * Saves and permanent bloodline unlocks both key off this, so a second player
 * cannot read or overwrite the first player's progress.
 */
let scope: string | null = null;

export function setSaveScope(next: string | null): void {
  scope = next;
}

export function getSaveScope(): string | null {
  return scope;
}

export function scopedStorageKey(base: string): string {
  return scope ? `${base}.${scope}` : base;
}
