import { humanizeCode, formatDateTime } from "../../lib/format";
import { isFallbackDecision, type ChainNode } from "../../lib/investigation";
import { Field } from "../ui/Field";
import { KindBadge } from "../ui/KindBadge";
import { Meter } from "../ui/Meter";
import { ToneChip } from "../ui/ToneChip";
import { DetailSection } from "./DetailSection";
import { StepEmpty } from "./StepEmpty";
import type { AIDecisionRead } from "../../types/api";

/**
 * The model's diagnosis and recommendation — labelled advisory and drawn in
 * the AI's dashed/info grammar. When the backend substituted its
 * deterministic fallback, that is said first and plainly, since the
 * "diagnosis" below it is then not a model's reading at all.
 */
export function AIDecisionPanel({
  decision,
  node,
  stopMessage,
}: {
  decision: AIDecisionRead | null;
  node: ChainNode;
  stopMessage: string | null;
}) {
  return (
    <DetailSection
      id="ai-decision"
      title="AI decision"
      badge={<KindBadge kind="advisory" />}
      aside={
        decision ? (
          <span className="font-mono text-xs">
            {decision.model_name} · {formatDateTime(decision.created_at)}
          </span>
        ) : undefined
      }
    >
      {!decision ? (
        <StepEmpty node={node} noun="AI diagnosis" stopMessage={stopMessage} />
      ) : (
        <div className="rounded-lg border border-dashed border-info/50 bg-info/5 p-5">
          {isFallbackDecision(decision) && (
            <div role="note" className="mb-5 rounded border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <ToneChip tone="warning" label="Fallback used" />
                <span className="font-medium text-text">This is not a model diagnosis.</span>
              </div>
              <p className="mt-1.5 text-body-small text-text-muted">
                The backend substituted its deterministic fallback — escalate to merchant at zero confidence — instead
                of trusting a model answer.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-5">
            <dl className="space-y-5 md:col-span-3">
              <Field label="Failure category">
                {decision.failure_category ? (
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{humanizeCode(decision.failure_category)}</span>
                    <span className="font-mono text-xs text-text-muted">{decision.failure_category}</span>
                  </span>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </Field>
              <Field label="Root cause">
                <p className="break-words">{decision.root_cause ?? "—"}</p>
              </Field>
              <Field label="Reasoning">
                <p className="break-words">{decision.reason ?? "—"}</p>
              </Field>
              <Field label="Risk factors">
                {decision.risk_factors && decision.risk_factors.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {decision.risk_factors.map((factor) => (
                      <li
                        key={factor}
                        className="rounded border border-border bg-surface-raised px-2 py-0.5 font-mono text-xs text-text-muted"
                      >
                        {factor}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-text-muted">None reported</span>
                )}
              </Field>
            </dl>

            <div className="space-y-5 md:col-span-2">
              <div className="rounded-lg border border-dashed border-info/50 bg-surface-raised p-4">
                <div className="text-label uppercase text-info">AI recommends</div>
                <div className="mt-1 text-heading text-text">
                  {decision.recommended_action ? humanizeCode(decision.recommended_action) : "—"}
                </div>
                {decision.recommended_action && (
                  <div className="mt-0.5 font-mono text-xs text-text-muted">{decision.recommended_action}</div>
                )}
                <p className="mt-2 text-body-small text-text-muted">A suggestion only. It is not executed until the policy gate rules on it.</p>
              </div>
              <Meter label="Recovery probability" value={decision.recovery_probability} />
              <Meter label="Confidence" value={decision.confidence} />
            </div>
          </div>

          <details className="group mt-6 border-t border-dashed border-info/40 pt-4">
            <summary className="focus-ring cursor-pointer rounded text-body-small font-medium text-text-muted transition-colors duration-150 hover:text-text">
              Raw model output
            </summary>
            {decision.raw_response ? (
              <pre className="mt-3 max-h-72 overflow-auto rounded border border-border bg-surface-raised p-3 font-mono text-xs leading-5 text-text">
                {JSON.stringify(decision.raw_response, null, 2)}
              </pre>
            ) : (
              <p className="mt-3 text-body-small text-text-muted">
                No raw response was stored for this decision (the fallback path stores none when no model was called).
              </p>
            )}
          </details>
        </div>
      )}
    </DetailSection>
  );
}
