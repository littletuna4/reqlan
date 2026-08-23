"use client";

import { useSyncExternalStore } from "react";

import {
  defaultCliPackageManager,
  type CliPackageManagerId,
} from "@/content/install-actions";
import {
  getPreferredPackageManager,
  setPreferredPackageManager,
  subscribePreferredPackageManager,
} from "@/lib/package-manager";

// rq:["../../../reqlan rq/site/site.rq".package_manager_preference]
export function usePreferredPackageManager(): [
  CliPackageManagerId,
  (id: CliPackageManagerId) => void,
] {

  const id = useSyncExternalStore(
    subscribePreferredPackageManager,
    getPreferredPackageManager,
    () => defaultCliPackageManager,
  );

  return [id, setPreferredPackageManager];
}
