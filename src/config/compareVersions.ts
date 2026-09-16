// Compares two dot-separated numeric version strings (e.g. "0.12.0"). Missing trailing segments
// count as 0, so "0.12" and "0.12.0" compare equal. Returns negative if a < b, positive if a > b,
// 0 if equal.
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

// True when this project's config.json was last touched (Setup/Sync) by a newer Kanbrain version
// than the one currently running — e.g. a teammate already updated and ran Sync. lastSyncedVersion
// is only stamped by Setup/Sync, not by every edit, so this can't catch every possible skew, but it
// catches the case that matters most: a schema/behavior change the running extension doesn't know
// about yet.
export function isExtensionOutdated(runningExtensionVersion: string, configLastSyncedVersion: string | undefined): boolean {
  if (!configLastSyncedVersion) {
    return false;
  }
  return compareVersions(configLastSyncedVersion, runningExtensionVersion) > 0;
}
