import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { loadSettings, saveSettings } from "./settings.repository";
import type { AppSettings } from "./settings.types";

interface SettingsContextValue {
  settings: AppSettings;
  updateSettings: (changes: Partial<AppSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  const updateSettings = useCallback((changes: Partial<AppSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...changes };
      saveSettings(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ settings, updateSettings }),
    [settings, updateSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const value = useContext(SettingsContext);
  if (!value) {
    throw new Error("useSettings must be used within SettingsProvider");
  }
  return value;
}
