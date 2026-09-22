import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [merchantName, setMerchantName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await register({ name, email, password, merchant_name: merchantName });
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 py-12 text-text">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="mb-8 text-sm font-semibold tracking-tight">
          Recover<span className="text-accent">AI</span>
        </div>
        <h1 className="mb-6 text-heading">Register</h1>

        {error && (
          <div className="mb-4 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-text-muted">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="focus-ring w-full rounded border border-border bg-surface px-3 py-2 text-text outline-none"
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-text-muted">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="focus-ring w-full rounded border border-border bg-surface px-3 py-2 text-text outline-none"
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-text-muted">Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="focus-ring w-full rounded border border-border bg-surface px-3 py-2 text-text outline-none"
          />
          <span className="mt-1 block text-xs text-text-faint">At least 8 characters.</span>
        </label>

        <label className="mb-6 block text-sm">
          <span className="mb-1 block text-text-muted">Merchant name</span>
          <input
            required
            value={merchantName}
            onChange={(e) => setMerchantName(e.target.value)}
            className="focus-ring w-full rounded border border-border bg-surface px-3 py-2 text-text outline-none"
          />
        </label>

        <Button type="submit" variant="primary" disabled={submitting} className="w-full">
          {submitting ? "Creating account…" : "Register"}
        </Button>

        <p className="mt-4 text-center text-sm text-text-muted">
          Already have an account?{" "}
          <Link to="/login" className="focus-ring text-accent">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
