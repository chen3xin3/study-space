import { Info } from "lucide-react";
import type { PropsWithChildren } from "react";

export function Notice({ children }: PropsWithChildren) {
  return (
    <div className="notice" role="status">
      <Info aria-hidden="true" size={17} />
      <span>{children}</span>
    </div>
  );
}
