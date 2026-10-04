import { AMOUNT_PRESETS, FAILURE_TYPES, buildRequest, type FormErrors, type ScenarioForm } from "../../lib/simulation";
import { Button } from "../ui/Button";
import type { HealthResponse } from "../../types/api";

/**
 * Inputs for POST /simulate/failed-payment. The "Request preview" is the
 * exact JSON that will be sent — transparency about what the demo is
 * actually doing, not a decoration.
 */
export function ScenarioBuilder({
  form,
  errors,
  busy,
  merchantId,
  health,
  onChange,
  onSubmit,
}: {
  form: ScenarioForm;
  errors: FormErrors;
  busy: boolean;
  merchantId: string | null;
  health: HealthResponse | null;
  onChange: (next: ScenarioForm) => void;
  onSubmit: () => void;
}) {
  const set = <K extends keyof ScenarioForm>(key: K, value: ScenarioForm[K]) => onChange({ ...form, [key]: value });
  const preview = buildRequest(form, merchantId);
  const live = livePrefixes(health);

  return (
    <section aria-labelledby="builder-title">
      <h2 id="builder-title" className="mb-1 text-subhead text-text">
        Scenario builder
      </h2>
      <p className="mb-5 text-body-small text-text-muted">
        Sends a real failed-payment event through the same ingestion path as a Razorpay webhook.
      </p>

      <fieldset disabled={busy} className="space-y-5">
        <div role="radiogroup" aria-label="Failure type">
          <div className="mb-2 text-label uppercase text-text-muted">Failure type</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
            {FAILURE_TYPES.map((type) => {
              const active = form.failureTypeId === type.id;
              return (
                <label
                  key={type.id}
                  className={`focus-within:ring-2 focus-within:ring-accent/50 flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-150 ${
                    active ? "border-border-strong bg-surface-raised" : "border-border hover:border-border-strong"
                  }`}
                >
                  <input
                    type="radio"
                    name="failure-type"
                    value={type.id}
                    checked={active}
                    onChange={() => set("failureTypeId", type.id)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 ${
                      active ? "border-accent bg-accent" : "border-border-strong"
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-text">{type.label}</span>
                    <span className="block text-body-small text-text-muted">{type.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="lab-amount" className="mb-1.5 block text-label uppercase text-text-muted">
            Amount (INR)
          </label>
          <div className="flex items-center gap-2">
            <input
              id="lab-amount"
              inputMode="decimal"
              value={form.amount}
              onChange={(event) => set("amount", event.target.value)}
              aria-invalid={!!errors.amount}
              aria-describedby={errors.amount ? "lab-amount-error" : undefined}
              className={inputClass(!!errors.amount) + " w-36 tabular-nums"}
            />
            <div className="flex flex-wrap gap-1.5">
              {AMOUNT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => set("amount", preset.value)}
                  className="focus-ring rounded border border-border px-2 py-1 text-xs tabular-nums text-text-muted transition-colors duration-150 hover:border-border-strong hover:text-text"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          {errors.amount && (
            <p id="lab-amount-error" role="alert" className="mt-1.5 text-body-small text-danger">
              {errors.amount}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <TextInput id="lab-name" label="Customer name" value={form.customerName} onChange={(v) => set("customerName", v)} />
          <TextInput
            id="lab-phone"
            label="Customer phone"
            value={form.customerPhone}
            error={errors.customerPhone}
            onChange={(v) => set("customerPhone", v)}
          />
          <div className="sm:col-span-2 xl:col-span-1 2xl:col-span-2">
            <TextInput
              id="lab-email"
              label="Customer email"
              value={form.customerEmail}
              error={errors.customerEmail}
              onChange={(v) => set("customerEmail", v)}
            />
          </div>
        </div>
      </fieldset>

      {live.length > 0 && (
        <p role="note" className="mt-5 rounded border border-warning/40 bg-warning/10 px-3 py-2.5 text-body-small text-text">
          <span className="font-medium">Live providers:</span> {live.join(", ")}. Approved actions will call them for
          real, and the email you enter can receive a real message.
        </p>
      )}

      <details className="mt-5">
        <summary className="focus-ring cursor-pointer rounded text-body-small font-medium text-text-muted transition-colors duration-150 hover:text-text">
          Request preview
        </summary>
        <pre className="mt-2 max-h-56 overflow-auto rounded border border-border bg-surface-raised p-3 font-mono text-xs leading-5 text-text">
          {`POST /simulate/failed-payment\n${JSON.stringify(preview, null, 2)}`}
        </pre>
      </details>

      <Button variant="primary" onClick={onSubmit} disabled={busy} className="mt-6 w-full sm:w-auto">
        {busy ? "Running…" : "Run simulation"}
      </Button>
    </section>
  );
}

function TextInput({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-label uppercase text-text-muted">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={inputClass(!!error) + " w-full"}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-body-small text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function inputClass(invalid: boolean): string {
  return `focus-ring rounded border bg-surface-raised px-3 py-2 text-sm text-text transition-colors duration-150 placeholder:text-text-faint disabled:opacity-60 ${
    invalid ? "border-danger" : "border-border hover:border-border-strong"
  }`;
}

/** Providers reporting anything other than "mock" are live and will act for real. */
function livePrefixes(health: HealthResponse | null): string[] {
  if (!health) return [];
  const { recovery_gateway, notifications } = health.providers;
  const live: string[] = [];
  if (recovery_gateway !== "mock") live.push(`recovery gateway (${recovery_gateway})`);
  if (notifications !== "mock") live.push(`notifications (${notifications})`);
  return live;
}
