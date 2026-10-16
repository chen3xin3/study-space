import { Info } from "lucide-react";

export function StudyOverview({ subjectName }: { subjectName: string }) {
  return (
    <p className="subject-phase-note" role="status"><Info aria-hidden="true" size={17} /><span><strong>{subjectName}学习数据接入后</strong>，这里会自然长出进度与复习节奏；现在先专注整理内容。</span></p>
  );
}
