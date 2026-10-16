import { Link } from "react-router";
import type { SubjectPageConfig } from "./subject-config";

export function SubjectHero({ config }: { config: SubjectPageConfig }) {
  const Icon = config.icon;
  return (
    <section className={`subject-core subject-core--${config.artDirection}`}>
      <div className="subject-core__copy">{config.eyebrow ? <span className="eyebrow">{config.eyebrow}</span> : null}<h2>{config.heroTitle}</h2><p>{config.heroDescription}</p><Link to={config.features[0].path}>查看详情</Link></div>
      <span className="subject-core__icon"><Icon aria-hidden="true" size={38} /></span>
    </section>
  );
}
