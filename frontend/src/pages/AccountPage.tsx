import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";

export function AccountPage() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div className="max-w-md">
      <h1 className="mb-6 text-heading">Account</h1>

      <dl className="divide-y divide-border rounded-lg border border-border">
        <Row label="Name" value={user.name} />
        <Row label="Email" value={user.email} />
        <Row label="Merchant" value={user.merchant_name} />
        <Row label="Merchant ID" value={user.merchant_id} mono />
      </dl>

      <Button variant="secondary" onClick={logout} className="mt-6">
        Log out
      </Button>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className={`text-sm ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
