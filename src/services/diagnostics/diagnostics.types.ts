export interface DiagnosticStatus {
  healthy: boolean;
  appVersion: string;
  logDirectory: string;
  schemaVersion: number;
  attachmentCount: number;
  recentEvents: string[];
}

export interface DiagnosticsService {
  getStatus(): Promise<DiagnosticStatus>;
  openLogFolder(): Promise<void>;
  exportReport(): Promise<string | null>;
}

