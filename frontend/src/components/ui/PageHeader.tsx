import type { ReactNode } from "react";

/**
 * The one page-title block for every authenticated screen: heading,
 * optional one-line description, optional right-aligned actions. Wraps on
 * narrow screens instead of truncating — the actions drop under the title.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-heading">{title}</h1>
        {description && <p className="mt-1 text-body-small text-text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
