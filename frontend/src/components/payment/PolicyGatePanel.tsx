import { formatDateTime, humanizeCode } from "../../lib/format";
import { policyOverrodeAI, type ChainNode, type Run } from "../../lib/investigation";
import { KindBadge } from "../ui/KindBadge";
import { StatusChip } from "../ui/StatusChip";
import { DetailSection } from "./DetailSection";
import { StepEmpty } from "./StepEmpty";

/**
 * The deterministic verdict on the AI's suggestion. The AI's recommendation
 * (dashed, info) and the engine's final action (solid) sit side by side so
 * an override is visible at a glance — and so the final action is never
 * confusable with what the model merely proposed.
 *
 * `violatedRules` is null when the audit trail holds no policy entry for
 * this attempt (shown as "not recorded", not as "none"), and [] when the
 * engine recorded the verdict with no rule firing.
 */
export function PolicyGatePanel({
  run,
  node,
  violatedRules,
  stopMessage,
}: {
  run: Run | null;
  node: ChainNode;
  violatedRules: string[] | null;
  stopMessage: string | null;
}) {
  const attempt = run?.attempt ?? null;
  const decision = run?.decision ?? null;
  const overrode = run ? policyOverrodeAI(run) : false;

  return (
    <DetailSection
      id="policy-gate"
      title="Policy gate"
      badge={<KindBadge kind="authoritative" />}
      aside={attempt ? <span className="font-mono text-xs">{formatDateTime(attempt.created_at)}</span> : undefined}
    >
      {!attempt ? (
        <StepEmpty node={node} noun="Policy verdict" stopMessage={stopMessage} />
      ) : (
        <div className="rounded-lg border border-border-strong bg-surface-raised p-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-label uppercase text-text-muted">Verdict</span>
            {attempt.policy_decision ? (
              <StatusChip status={attempt.policy_decision} />
            ) : (
              <span className="text-sm text-text-muted">Not recorded</span>
            )}
            {attempt.policy_decision && (
              <span className="font-mono text-xs text-text-muted">{attempt.policy_decision}</span>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
            <div className="rounded-lg border border-dashed border-info/50 bg-info/5 p-4">
              <div className="text-label uppercase text-info">AI recommended</div>
              <div className="mt-1 text-sm font-medium text-text">
                {decision?.recommended_action ? humanizeCode(decision.recommended_action) : "—"}
              </div>
              {decision?.recommended_action && (
                <div className="mt-0.5 font-mono text-xs text-text-muted">{decision.recommended_action}</div>
              )}
            </div>

            <div className="flex items-center justify-center text-text-muted" aria-hidden="true">
              <span className="hidden md:inline">→</span>
              <span className="md:hidden">↓</span>
            </div>

            <div className="rounded-lg border-2 border-border-strong bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-label uppercase text-text">Final action</span>
                {overrode && (
                  <span className="rounded border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-label uppercase text-warning">
                    Overrides AI
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm font-semibold text-text">{humanizeCode(attempt.action_type)}</div>
              <div className="mt-0.5 font-mono text-xs text-text-muted">{attempt.action_type}</div>
            </div>
          </div>

          <dl className="mt-5 space-y-5">
            <div>
              <dt className="text-label uppercase text-text-muted">Reason</dt>
              <dd className="mt-1 break-words text-sm text-text">{attempt.policy_reason ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-label uppercase text-text-muted">Rules triggered</dt>
              <dd className="mt-1.5">
                {violatedRules === null ? (
                  <span className="text-sm text-text-muted">Not recorded in the audit trail.</span>
                ) : violatedRules.length === 0 ? (
                  <span className="text-sm text-text-muted">None — every deterministic check passed.</span>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {violatedRules.map((rule) => (
                      <li key={rule} className="rounded border border-border-strong px-2 py-1">
                        <span className="block font-mono text-xs font-medium text-text">{rule}</span>
                        <span className="block text-body-small text-text-muted">{humanizeCode(rule)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>

          <p className="mt-5 border-t border-border pt-4 text-body-small text-text-muted">
            Deterministic rules, no model output. The policy engine's verdict — not the AI's suggestion — decides what
            runs.
          </p>
        </div>
      )}
    </DetailSection>
  );
}
