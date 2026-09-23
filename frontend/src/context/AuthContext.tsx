import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import * as api from "../lib/api";
import { clearToken, getToken, setToken } from "../lib/auth";
import type { MeResponse } from "../types/api";

interface AuthContextValue {
  user: MeResponse | null;
  status: "loading" | "authenticated" | "unauthenticated";
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (fields: { name: string; email: string; password: string; merchant_name: string }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [error, setError] = useState<string | null>(null);

  // On load: if a token is already stored, prove it still works against the
  // real backend rather than assuming it's valid — an expired/invalid token
  // must fall back to logged-out, not a broken authenticated shell. This
  // effect's only job is resolving that initial "loading" state, so the
  // setState calls below are its entire purpose, not a side effect of one.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      // oxlint-disable-next-line react/set-state-in-effect
      setStatus("unauthenticated");
      return;
    }
    api
      .getMe()
      .then((me) => {
        setUser(me);
        setStatus("authenticated");
      })
      .catch(() => {
        clearToken();
        setStatus("unauthenticated");
      });
  }, []);

  // Central 401 handling (lib/api.ts): any authenticated request that comes
  // back 401 clears the token and fires this event so the app state and the
  // stored token never disagree, wherever in the app the call happened.
  useEffect(() => {
    function handleUnauthorized() {
      setUser(null);
      setStatus("unauthenticated");
    }
    window.addEventListener("recoverai:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("recoverai:unauthorized", handleUnauthorized);
  }, []);

  async function login(email: string, password: string) {
    setError(null);
    try {
      const result = await api.login({ email, password });
      setToken(result.access_token);
      const me = await api.getMe();
      setUser(me);
      setStatus("authenticated");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Login failed.");
      throw err;
    }
  }

  async function register(fields: { name: string; email: string; password: string; merchant_name: string }) {
    setError(null);
    try {
      const result = await api.register(fields);
      setToken(result.access_token);
      const me = await api.getMe();
      setUser(me);
      setStatus("authenticated");
    } catch (err) {
      setError(err instanceof api.ApiError ? err.message : "Registration failed.");
      throw err;
    }
  }

  function logout() {
    clearToken();
    setUser(null);
    setStatus("unauthenticated");
  }

  return (
    <AuthContext.Provider value={{ user, status, error, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// The hook and its provider are one unit; splitting into a second file for
// fast-refresh only buys nothing at this project's size.
// oxlint-disable-next-line react/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
