import { useEffect, useState } from "react";
import { formatLocalDate, formatLocalTime } from "../../utils/date";

export function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="live-clock" aria-label="当前时间">
      <strong>{formatLocalTime(now)}</strong>
      <span>{formatLocalDate(now)}</span>
    </div>
  );
}
