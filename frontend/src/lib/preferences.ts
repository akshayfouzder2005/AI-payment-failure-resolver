import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from "./pagination";

/**
 * Browser-local preferences (nothing here is sent to the backend; the API
 * has no per-user settings). Theme has its own store in lib/theme.ts.
 */
const PAGE_SIZE_KEY = "recoverai_default_page_size";

export function getDefaultPageSize(): number {
  try {
    const stored = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return (PAGE_SIZES as readonly number[]).includes(stored) ? stored : DEFAULT_PAGE_SIZE;
  } catch {
    return DEFAULT_PAGE_SIZE;
  }
}

export function setDefaultPageSize(size: number): void {
  try {
    if (size === DEFAULT_PAGE_SIZE) localStorage.removeItem(PAGE_SIZE_KEY);
    else localStorage.setItem(PAGE_SIZE_KEY, String(size));
  } catch {
    // storage unavailable (private mode): the preference simply doesn't persist
  }
}
