import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      navigate("/app", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6 text-text">
      <form onSubmit={handleSubmit} className="w-full max-w-sm">
        <div className="mb-8 text-sm font-semibold tracking-tight">
          Recover<span className="text-accent">AI</span>
        </div>
        <h1 className="mb-6 text-heading">Log in</h1>

        {error && (
          <div className="mb-4 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

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

        <label className="mb-6 block text-sm">
          <span className="mb-1 block text-text-muted">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="focus-ring w-full rounded border border-border bg-surface px-3 py-2 text-text outline-none"
          />
        </label>

        <Button type="submit" variant="primary" disabled={submitting} className="w-full">
          {submitting ? "Logging in…" : "Log in"}
        </Button>

        <p className="mt-4 text-center text-sm text-text-muted">
          No account?{" "}
          <Link to="/register" className="focus-ring text-accent">
            Register
          </Link>
        </p>
      </form>
    </div>
  );
}
