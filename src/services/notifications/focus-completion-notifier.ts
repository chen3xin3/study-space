import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";

export type FocusCompletionKind = "work" | "break";
export type NotificationPermissionState = NotificationPermission;

export interface FocusNotificationResult {
  delivered: boolean;
  fallbackMessage: string;
}

export interface FocusCompletionNotifier {
  notify(kind: FocusCompletionKind): Promise<FocusNotificationResult>;
}

export interface FocusNotificationDriver {
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<NotificationPermissionState>;
  send(title: string, body: string): Promise<void>;
}

export interface FocusCompletionCue {
  play(): void | Promise<void>;
}

interface FocusCompletionNotifierOptions {
  driver?: FocusNotificationDriver | null;
  cue?: FocusCompletionCue;
}

const messages: Record<FocusCompletionKind, string> = {
  work: "本轮专注已结束，可以休息一下。",
  break: "休息结束，准备开始下一轮。",
};

function hasTauri(): boolean {
  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

function systemDriver(): FocusNotificationDriver | null {
  if (!hasTauri()) return null;
  return {
    isPermissionGranted,
    requestPermission,
    async send(title, body) { await sendNotification({ title, body }); },
  };
}

function localCue(): FocusCompletionCue {
  return {
    play() {
      try { navigator.vibrate?.(160); } catch { /* Vibration is an optional enhancement. */ }
      const AudioContextClass = window.AudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + 0.24);
      oscillator.addEventListener("ended", () => { void context.close(); }, { once: true });
    },
  };
}

async function playFallback(cue: FocusCompletionCue): Promise<void> {
  try { await cue.play(); } catch { /* The in-app message remains available. */ }
}

export function createFocusCompletionNotifier(options: FocusCompletionNotifierOptions = {}): FocusCompletionNotifier {
  const driver = options.driver === undefined ? systemDriver() : options.driver;
  const cue = options.cue ?? localCue();

  return {
    async notify(kind) {
      const fallbackMessage = messages[kind];
      if (!driver) {
        await playFallback(cue);
        return { delivered: false, fallbackMessage };
      }
      try {
        const permission = await driver.isPermissionGranted()
          ? "granted"
          : await driver.requestPermission();
        if (permission !== "granted") {
          await playFallback(cue);
          return { delivered: false, fallbackMessage };
        }
        await driver.send("学习空间", fallbackMessage);
        return { delivered: true, fallbackMessage };
      } catch {
        await playFallback(cue);
        return { delivered: false, fallbackMessage };
      }
    },
  };
}
