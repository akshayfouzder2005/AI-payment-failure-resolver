export type DotState = "ok" | "down" | "checking";

/** A health indicator dot. Always paired with text by callers — colour never carries the meaning alone. */
export function StatusDot({ state }: { state: DotState }) {
  return (
    <span
      className={`h-1.5 w-1.5 rounded-full ${
        state === "ok" ? "bg-success" : state === "down" ? "bg-danger" : "bg-text-faint"
      }`}
      aria-hidden="true"
    />
  );
}
