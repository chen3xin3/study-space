import { SubjectBentoGrid } from "../../components/subjects/SubjectBentoGrid";
import { subjectConfigs, type SubjectId } from "../../components/subjects/subject-config";
import { SubjectScene } from "../../components/subjects/SubjectScene";
import { StudyOverview } from "../../components/subjects/StudyOverview";
import { SubjectHero } from "../../components/subjects/SubjectHero";
import { PageHeader } from "../../components/ui/PageHeader";
import { EnglishDashboard } from "../english/EnglishDashboard";
import { MathDashboard } from "./MathDashboard";
import "./subject-art.css";

export function SubjectPage({ subject }: { subject: SubjectId }) {
  if (subject === "english") return <EnglishDashboard />;
  if (subject === "math") return <MathDashboard />;
  const config = subjectConfigs[subject];
  return (
    <main className={`page subject-space subject-space--${subject}`} data-art-direction={config.artDirection} data-testid={`${subject}-subject-space`}>
      {config.artDirection === "calm" ? null : <SubjectScene subject={subject} direction={config.artDirection} />}
      <PageHeader title={config.title} description={config.heroDescription} />
      <div className="subject-composition">
        <SubjectHero config={config} />
        <SubjectBentoGrid config={config} />
      </div>
      <StudyOverview subjectName={config.title} />
    </main>
  );
}
