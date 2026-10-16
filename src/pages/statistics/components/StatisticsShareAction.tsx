import { Copy, Share2 } from "lucide-react";
import { useState } from "react";

export function StatisticsShareAction({ text }: { text: string }) {
  const [status, setStatus] = useState(""); const canShare = typeof navigator.share === "function";
  async function share() {
    setStatus("");
    try {
      if (canShare) { await navigator.share({ title: "学习统计", text }); setStatus("分享已打开"); }
      else { if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable"); await navigator.clipboard.writeText(text); setStatus("已复制统计摘要"); }
    } catch { setStatus("暂时无法分享，请稍后重试"); }
  }
  return <div className="statistics-share"><button onClick={() => void share()} aria-label={canShare ? "分享统计" : "复制统计摘要"}>{canShare ? <Share2 /> : <Copy />}{canShare ? "分享" : "复制摘要"}</button><span role="status" aria-live="polite">{status}</span></div>;
}
