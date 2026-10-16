import { useEffect, useRef, useState, type ReactNode } from "react";
import { Headphones, History, SlidersHorizontal } from "lucide-react";

type DeckTab = "setup" | "environment" | "history";

export interface FocusControlDeckProps {
  activeSession: boolean;
  setup: ReactNode;
  environment: ReactNode;
  history: ReactNode;
}

const tabs: Array<{ id: DeckTab; label: string; icon: typeof SlidersHorizontal }> = [
  { id: "setup", label: "方案", icon: SlidersHorizontal },
  { id: "environment", label: "环境", icon: Headphones },
  { id: "history", label: "记录", icon: History },
];

export function FocusControlDeck({ activeSession, setup, environment, history }: FocusControlDeckProps) {
  const [activeTab, setActiveTab] = useState<DeckTab>(activeSession ? "environment" : "setup");
  const wasActive = useRef(activeSession);
  useEffect(() => {
    if (activeSession && !wasActive.current) setActiveTab("environment");
    wasActive.current = activeSession;
  }, [activeSession]);
  const panels: Record<DeckTab, ReactNode> = { setup, environment, history };
  return <aside className="focus-control-deck" aria-label="专注控制台">
    <div className="focus-control-deck__tabs" role="tablist" aria-label="专注工具">
      {tabs.map((tab) => { const Icon = tab.icon; return <button key={tab.id} id={`focus-tab-${tab.id}`} role="tab" aria-selected={activeTab === tab.id} aria-controls={`focus-panel-${tab.id}`} className={activeTab === tab.id ? "is-active" : ""} onClick={() => setActiveTab(tab.id)}><Icon size={16} /><span>{tab.label}</span></button>; })}
    </div>
    <div className="focus-control-deck__panel" id={`focus-panel-${activeTab}`} role="tabpanel" aria-labelledby={`focus-tab-${activeTab}`}>{panels[activeTab]}</div>
  </aside>;
}
