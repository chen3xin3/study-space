import { BookMarked, FilePenLine, Sparkles } from "lucide-react";
import { Card } from "../../components/ui/Card";
import type { EssaySummary } from "../../services/essays/essay.types";

export function EssayDashboard({ summary, pendingImportCount = 0 }: { summary: EssaySummary | null; pendingImportCount?: number }) {
  return (
    <section className="essay-summary" aria-label="作文统计">
      <Card className="essay-summary__green">
        <BookMarked />
        <span>范文收藏</span>
        <strong>{summary?.essayCount ?? "—"}</strong>
      </Card>
      <Card className="essay-summary__blue">
        <FilePenLine />
        <span>写作记录</span>
        <strong>{summary?.writingCount ?? "—"}</strong>
      </Card>
      <Card className="essay-summary__purple">
        <Sparkles />
        <span>未完成草稿</span>
        <strong>{summary ? summary.draftCount + pendingImportCount : "—"}</strong>
      </Card>
    </section>
  );
}
