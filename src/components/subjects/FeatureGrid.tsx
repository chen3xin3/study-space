import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import type { SubjectPageConfig } from "./subject-config";

export function FeatureGrid({ config }: { config: SubjectPageConfig }) {
  return <div className="feature-grid">{config.features.map(({ id, title, description, icon: Icon, path }) => (
    <Link aria-label={`${title}：${description}`} className="feature-card" key={id} to={path}><span className={`feature-card__icon subject-tone--${config.id}`}><Icon aria-hidden="true" size={21} /></span><div><strong>{title}</strong><p>{description}</p></div><ArrowUpRight aria-hidden="true" className="feature-card__arrow" size={17} /></Link>
  ))}</div>;
}
