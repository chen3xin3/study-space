import type { SubjectArtDirection, SubjectId } from "./subject-config";

export function SubjectScene({ subject, direction }: { subject: SubjectId; direction: SubjectArtDirection }) {
  return (
    <div className={`subject-scene subject-scene--${direction}`} data-testid={`${subject}-subject-scene`} aria-hidden="true">
      {direction === "bookshelf" && <><i className="subject-scene__desk" /><i className="subject-scene__pencil" /></>}
      {direction === "newsroom" && <><i className="subject-scene__rule" /><i className="subject-scene__seal">REVIEW</i></>}
    </div>
  );
}
