/**
 * Remembers, on this device, the last day whose summary was sent, so Home stops offering it.
 * Browser storage can be missing (private mode), so every read and write may quietly fail.
 */
const key = (workspaceId: string) => `wy.summarySent.${workspaceId}`;

export function summarySentOn(workspaceId: string): string | null {
  try {
    return localStorage.getItem(key(workspaceId));
  } catch {
    return null;
  }
}

export function markSummarySent(workspaceId: string, date: string): void {
  try {
    localStorage.setItem(key(workspaceId), date);
  } catch {
    // Nothing to remember it in; Home will just offer it again.
  }
}
