import type { ReactNode } from "react";

/**
 * A ruled, anchorable section of the Payment Detail page. The id is what
 * the Decision Chain's nodes link to, so `scroll-mt` keeps the heading clear
 * of the viewport edge when jumped to.
 */
export function DetailSection({
  id,
  title,
  badge,
  aside,
  children,
}: {
  id: string;
  title: string;
  badge?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6 border-t border-border pt-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id={`${id}-title`} className="text-subhead text-text">
            {title}
          </h2>
          {badge}
        </div>
        {aside && <div className="text-body-small text-text-muted">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
