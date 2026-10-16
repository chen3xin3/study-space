export const ROUTE_SESSION_KEY = "study-space.last-safe-route.v1";

const SAFE_ROUTES = new Set([
  "/",
  "/english",
  "/english/words",
  "/english/essays",
  "/english/essays/history",
  "/math",
  "/specialty",
  "/politics",
  "/focus",
  "/statistics",
  "/library",
  "/library/photos",
  "/library/files",
  "/settings",
]);

type RouteStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function isSafeRestorableRoute(route: string): boolean {
  return SAFE_ROUTES.has(route);
}

export function readRestorableRoute(storage: RouteStorage, currentPath: string): string | null {
  if (currentPath !== "/") return null;
  const saved = storage.getItem(ROUTE_SESSION_KEY);
  if (!saved) return null;
  storage.removeItem(ROUTE_SESSION_KEY);
  return isSafeRestorableRoute(saved) && saved !== "/" ? saved : null;
}

export function rememberRoute(storage: RouteStorage, route: string): void {
  if (isSafeRestorableRoute(route)) storage.setItem(ROUTE_SESSION_KEY, route);
}
