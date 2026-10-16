import { Link } from "react-router";
import { useSettings } from "../../services/settings/SettingsProvider";
import { calculateCountdown } from "../../utils/date";
import { Card } from "../ui/Card";
import { LiveClock } from "./LiveClock";

export function ExamCountdown() {
  const { settings } = useSettings();
  const countdown = calculateCountdown(settings.examDate);
  let content;
  if (countdown.status === "unset") content = <h1><Link to="/settings">设置考试日期</Link></h1>;
  else if (countdown.status === "invalid") content = <h1><Link to="/settings">考试日期无效，请重新设置</Link></h1>;
  else if (countdown.status === "today") content = <h1 className="countdown__today">今天就是考试日</h1>;
  else if (countdown.status === "passed") content = <h1>考试日期已过去 {countdown.days} 天</h1>;
  else content = <h1>距离考研还有 <strong className="countdown__days">{countdown.days}</strong> 天</h1>;

  return (
    <Card className="countdown-card time-card" aria-label="当前时间与考研倒计时">
      <div className="time-card__primary">
        <span className="section-kicker">当前时间</span>
        <LiveClock />
      </div>
      <div className="time-card__countdown" aria-label="考研倒计时摘要">
        <span className="section-kicker">考研倒计时</span>
        {content}
        <p>{settings.examDate ? <><Link to="/settings">目标日期 {settings.examDate}</Link><span> · </span></> : null}每天稳稳前进一点，时间会给你答案。</p>
      </div>
    </Card>
  );
}
