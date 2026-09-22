import { ComingSoon } from "../components/ui/ComingSoon";

export function AuditPage() {
  return (
    <ComingSoon
      title="Audit Explorer"
      note="Select a payment, then load its forensic timeline from GET /audit/payment/{payment_id} — built in a later increment."
    />
  );
}
