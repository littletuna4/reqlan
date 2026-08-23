import {
  defaultCliPackageManager,
  type CliPackageManagerId,
} from "@/content/install-actions";

/** Site-wide JS package manager preference. Persists in the browser. */
// rq:["../../../reqlan rq/site/site.rq".package_manager_preference]
export const PACKAGE_MANAGER_STORAGE_KEY = "reqlan.packageManager";

type Listener = () => void;

let memory: CliPackageManagerId = defaultCliPackageManager;
let hydrated = false;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== PACKAGE_MANAGER_STORAGE_KEY) {
    return;
  }

  memory =
    parseStoredPackageManager(event.newValue) ?? defaultCliPackageManager;
  emit();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") {
    return;
  }

  memory =
    parseStoredPackageManager(
      window.localStorage.getItem(PACKAGE_MANAGER_STORAGE_KEY),
    ) ?? defaultCliPackageManager;
  hydrated = true;
  window.addEventListener("storage", onStorage);
}

export function isPackageManagerId(
  value: string | null | undefined,
): value is CliPackageManagerId {
  return (
    value === "npm" || value === "pnpm" || value === "yarn" || value === "bun"
  );
}

export function getPreferredPackageManager(): CliPackageManagerId {
  hydrate();
  return memory;
}

export function setPreferredPackageManager(id: CliPackageManagerId): void {
  hydrate();
  memory = id;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(PACKAGE_MANAGER_STORAGE_KEY, id);
  }

  emit();
}

export function subscribePreferredPackageManager(listener: Listener): () => void {
  hydrate();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Drop the in-memory value so tests can isolate storage. */
export function resetPreferredPackageManagerForTests(): void {
  memory = defaultCliPackageManager;
  hydrated = false;
  listeners.clear();
}

function parseStoredPackageManager(
  value: string | null,
): CliPackageManagerId | null {
  return isPackageManagerId(value) ? value : null;
}
