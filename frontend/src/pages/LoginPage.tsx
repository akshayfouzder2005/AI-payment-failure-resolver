import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { GradientField } from "../components/ui/GradientField";
import { BackgroundGrid } from "../components/ui/BackgroundGrid";

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
    <div className="relative min-h-screen overflow-hidden bg-canvas text-text">
      <GradientField className="pointer-events-none absolute inset-0 opacity-5" />
      <BackgroundGrid className="pointer-events-none absolute inset-0" />

      <div className="relative flex min-h-screen items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <div className="mb-8 text-sm font-semibold tracking-tight">
            Recover<span className="text-accent">AI</span>
          </div>

          <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-surface-raised p-8">
            <h1 className="text-display">Log in</h1>
            <p className="mt-2 text-sm text-text-muted">Sign in to your RecoverAI merchant account.</p>

            {error && (
              <div role="alert" className="mt-6 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <div className="mt-6">
              <Input
                label="Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <Input
                label="Password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                wrapperClassName="mb-6"
              />
            </div>

            <Button type="submit" variant="primary" disabled={submitting} className="w-full">
              {submitting ? "Logging in…" : "Log in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-text-muted">
            No account?{" "}
            <Link to="/register" className="focus-ring text-accent">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
