import { useMemo } from "react";
import { currentPlatformEnvironment, detectRuntimePlatform } from "./platform";

export function useRuntimePlatform() {
  return useMemo(() => detectRuntimePlatform(currentPlatformEnvironment()), []);
}
