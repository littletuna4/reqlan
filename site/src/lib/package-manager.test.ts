import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { defaultCliPackageManager } from "../content/install-actions.js";
import {
  PACKAGE_MANAGER_STORAGE_KEY,
  getPreferredPackageManager,
  isPackageManagerId,
  resetPreferredPackageManagerForTests,
  setPreferredPackageManager,
  subscribePreferredPackageManager,
} from "./package-manager.js";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function installWindow(storage: StorageLike) {
  const target = globalThis as typeof globalThis & { window?: Window };
  const listeners = new Map<string, Set<EventListener>>();

  target.window = {
    localStorage: storage,
    addEventListener(type: string, listener: EventListener) {
      const bucket = listeners.get(type) ?? new Set();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: Event) {
      for (const listener of listeners.get(event.type) ?? []) {
        listener(event);
      }
      return true;
    },
  } as unknown as Window;

  return () => {
    delete target.window;
  };
}

describe("package manager preference", () => {
  // rq:["../../../reqlan rq/site/site.rq".package_manager_preference]
  // rq:["../../../reqlan rq/site/site.rq".install_cli_menu]

  let restore: (() => void) | undefined;

  afterEach(() => {
    restore?.();
    restore = undefined;
    resetPreferredPackageManagerForTests();
  });

  it("accepts npm, pnpm, yarn, and bun only", () => {
    assert.equal(isPackageManagerId("npm"), true);
    assert.equal(isPackageManagerId("pnpm"), true);
    assert.equal(isPackageManagerId("yarn"), true);
    assert.equal(isPackageManagerId("bun"), true);
    assert.equal(isPackageManagerId("pip"), false);
    assert.equal(isPackageManagerId(null), false);
  });

  it("defaults to npm when nothing is stored", () => {
    const store = new Map<string, string>();
    restore = installWindow({
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
    });

    assert.equal(getPreferredPackageManager(), defaultCliPackageManager);
    assert.equal(defaultCliPackageManager, "npm");
  });

  it("persists the selected package manager in localStorage", () => {
    const store = new Map<string, string>();
    restore = installWindow({
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
    });

    setPreferredPackageManager("pnpm");
    assert.equal(store.get(PACKAGE_MANAGER_STORAGE_KEY), "pnpm");
    assert.equal(getPreferredPackageManager(), "pnpm");

    setPreferredPackageManager("bun");
    assert.equal(getPreferredPackageManager(), "bun");
  });

  it("hydrates the in-memory value from localStorage", () => {
    const store = new Map<string, string>([
      [PACKAGE_MANAGER_STORAGE_KEY, "yarn"],
    ]);
    restore = installWindow({
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
    });

    assert.equal(getPreferredPackageManager(), "yarn");
  });

  it("ignores unknown stored values", () => {
    const store = new Map<string, string>([
      [PACKAGE_MANAGER_STORAGE_KEY, "cargo"],
    ]);
    restore = installWindow({
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
    });

    assert.equal(getPreferredPackageManager(), "npm");
  });

  it("notifies subscribers when the preference changes", () => {
    const store = new Map<string, string>();
    restore = installWindow({
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
    });

    const seen: string[] = [];
    const stop = subscribePreferredPackageManager(() => {
      seen.push(getPreferredPackageManager());
    });

    setPreferredPackageManager("yarn");
    setPreferredPackageManager("npm");
    stop();
    setPreferredPackageManager("bun");

    assert.deepEqual(seen, ["yarn", "npm"]);
  });

  it("updates the in-memory value from other-tab storage events", () => {
    const store = new Map<string, string>();
    restore = installWindow({
      getItem: (key) => store.get(key) ?? null,
      setItem: (key, value) => {
        store.set(key, value);
      },
    });

    getPreferredPackageManager();
    store.set(PACKAGE_MANAGER_STORAGE_KEY, "bun");
    window.dispatchEvent(
      Object.assign(new Event("storage"), {
        key: PACKAGE_MANAGER_STORAGE_KEY,
        newValue: "bun",
      }),
    );

    assert.equal(getPreferredPackageManager(), "bun");
  });
});
