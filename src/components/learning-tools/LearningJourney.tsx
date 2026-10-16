import { Link } from "react-router";
import "./learning-journey.css";

const steps = [
  { key: "focus", label: "专注", detail: "进入学习", to: "/focus" },
  { key: "statistics", label: "复盘", detail: "看见节奏", to: "/statistics" },
  { key: "library", label: "资料", detail: "整理归档", to: "/library" },
] as const;

export type LearningJourneyStep = typeof steps[number]["key"];

export function LearningJourney({ current }: { current: LearningJourneyStep }) {
  return <nav className="learning-journey" aria-label="学习轨迹">
    {steps.map((step, index) => <Link className={current === step.key ? "is-current" : ""} key={step.key} to={step.to} aria-current={current === step.key ? "step" : undefined}>
      <small>0{index + 1}</small>
      <span><strong>{step.label}</strong><em>{step.detail}</em></span>
    </Link>)}
  </nav>;
}
