const CURRENT_USER_STORAGE_KEY = "kyurim:currentUserId";

export function getCurrentUserId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(CURRENT_USER_STORAGE_KEY);
  if (!raw) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

export function setCurrentUserId(id: number | null): void {
  if (typeof window === "undefined") return;
  if (id === null) {
    window.localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
  } else {
    window.localStorage.setItem(CURRENT_USER_STORAGE_KEY, String(id));
  }
}
