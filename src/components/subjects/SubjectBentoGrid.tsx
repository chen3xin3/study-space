import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";
import type { SubjectPageConfig } from "./subject-config";

export function SubjectBentoGrid({ config }: { config: SubjectPageConfig }) {
  return (
    <nav className={`subject-bento subject-bento--${config.artDirection}`} aria-label={`${config.title}功能`}>
      {config.features.map(({ id, title, description, icon: Icon, layout, path }) => (
        <Link
          aria-label={`${title}：${description}`}
          className={`subject-bento__item subject-bento__item--${layout}`}
          data-layout={layout}
          key={id}
          to={path}
        >
          <span className="subject-bento__icon"><Icon aria-hidden="true" size={22} /></span>
          <span className="subject-bento__copy"><strong>{title}</strong><small>{description}</small></span>
          <ArrowUpRight aria-hidden="true" className="subject-bento__arrow" size={18} />
        </Link>
      ))}
    </nav>
  );
}
