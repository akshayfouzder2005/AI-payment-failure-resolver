import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { AccountPage } from "./AccountPage";
import { ThemeProvider } from "../context/ThemeContext";
import * as api from "../lib/api";

const logout = vi.fn();
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({
    user: { user_id: "user-123", name: "Priya Menon", email: "priya@acme.test", merchant_id: "m-acme", merchant_name: "Acme Retail" },
    logout,
  }),
}));

vi.mock("../lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api")>();
  return { ...actual, getHealth: vi.fn(), getHealthDb: vi.fn() };
});

const b64url = (value: object) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const makeToken = (claims: object) => `${b64url({ alg: "HS256" })}.${b64url(claims)}.sig`;

function renderAccount() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <AccountPage />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(api.getHealth).mockResolvedValue({
    status: "ok",
    environment: "TEST",
    providers: { ai: "groq", recovery_gateway: "razorpay", notifications: "brevo" },
  });
  vi.mocked(api.getHealthDb).mockResolvedValue({ status: "ok", database: "ok" });
});
afterEach(() => vi.restoreAllMocks());

describe("AccountPage — profile and workspace", () => {
  it("shows the signed-in profile with copyable IDs", async () => {
    renderAccount();
    const profile = screen.getByRole("region", { name: "Profile" });
    expect(within(profile).getByText("Priya Menon")).toBeInTheDocument();
    expect(within(profile).getByText("priya@acme.test")).toBeInTheDocument();
    expect(within(profile).getByText("user-123")).toBeInTheDocument();
    expect(within(profile).getByRole("button", { name: "Copy user ID" })).toBeInTheDocument();
  });

  it("shows the workspace, merchant id and the webhook endpoint derived from the API base URL", async () => {
    renderAccount();
    const workspace = screen.getByRole("region", { name: "Workspace" });
    expect(within(workspace).getByText("Acme Retail")).toBeInTheDocument();
    expect(within(workspace).getByText("m-acme")).toBeInTheDocument();
    expect(within(workspace).getByText(`${api.API_BASE_URL}/webhooks/razorpay`)).toBeInTheDocument();
    expect(within(workspace).getByRole("link", { name: "Open Recovery Lab" })).toHaveAttribute("href", "/app/recovery-lab");
    expect(within(workspace).getByText(/signing secret .* never shown here/i)).toBeInTheDocument();
  });
});

describe("AccountPage — preferences", () => {
  it("switches theme immediately and persists it", async () => {
    renderAccount();
    const group = screen.getByRole("group", { name: "Theme" });
    const dark = within(group).getByRole("button", { name: "Dark" });
    const light = within(group).getByRole("button", { name: "Light" });

    await userEvent.click(light);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(light).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("recoverai_theme")).toBe("light");

    await userEvent.click(dark);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("saves the default rows per page", async () => {
    renderAccount();
    const group = screen.getByRole("group", { name: "Rows per page" });
    expect(within(group).getByRole("button", { name: "25" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(within(group).getByRole("button", { name: "100" }));
    expect(localStorage.getItem("recoverai_default_page_size")).toBe("100");
    expect(within(group).getByRole("button", { name: "100" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reflects a previously saved page size", () => {
    localStorage.setItem("recoverai_default_page_size", "50");
    renderAccount();
    expect(within(screen.getByRole("group", { name: "Rows per page" })).getByRole("button", { name: "50" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("AccountPage — system status", () => {
  it("runs live checks and shows measured latency, environment and providers", async () => {
    renderAccount();
    const system = screen.getByRole("region", { name: "System status" });
    await waitFor(() => expect(within(system).getByText(/Reachable · \d+ ms/)).toBeInTheDocument());
    expect(within(system).getByText(/Connected · \d+ ms/)).toBeInTheDocument();
    expect(within(system).getByText("TEST")).toBeInTheDocument();
    expect(within(system).getByText("groq")).toBeInTheDocument();
    expect(within(system).getByText("razorpay")).toBeInTheDocument();
    expect(within(system).getByText("brevo")).toBeInTheDocument();
  });

  it("shows the real error when a check fails", async () => {
    vi.mocked(api.getHealthDb).mockRejectedValue(new api.ApiError(503, "Database unavailable"));
    renderAccount();
    expect(await screen.findByText("Database unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Reachable/)).toBeInTheDocument(); // the API check is independent
  });

  it("re-runs the checks on demand", async () => {
    renderAccount();
    await screen.findByText(/Reachable/);
    await userEvent.click(screen.getByRole("button", { name: "Re-run checks" }));
    await waitFor(() => expect(api.getHealth).toHaveBeenCalledTimes(2));
    expect(api.getHealthDb).toHaveBeenCalledTimes(2);
  });

  it("copies a diagnostics report that contains no token or secret", async () => {
    const token = makeToken({ iat: 1_800_000_000, exp: 1_800_086_400 });
    localStorage.setItem("recoverai_token", token);
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText");
    renderAccount();
    await screen.findByText(/Reachable/);
    await user.click(screen.getByRole("button", { name: "Copy diagnostics" }));

    await waitFor(() => expect(write).toHaveBeenCalled());
    const text = write.mock.calls[0][0];
    const report = JSON.parse(text);
    expect(report.merchant_id).toBe("m-acme");
    expect(report.providers.notifications).toBe("brevo");
    expect(report.api_status).toBe("ok");
    expect(report.session_expires_at).toBe(new Date(1_800_086_400 * 1000).toISOString());
    expect(text).not.toContain(token);
    expect(text).not.toMatch(/password|secret/i);
  });
});

describe("AccountPage — session", () => {
  it("shows when the session was issued and expires, read from the token", () => {
    localStorage.setItem("recoverai_token", makeToken({ iat: 1_800_000_000, exp: 1_800_086_400 }));
    renderAccount();
    const session = screen.getByRole("region", { name: "Session" });
    expect(within(session).getByText(/\(in .*\)/)).toBeInTheDocument();
    expect(within(session).queryByText("Unknown")).not.toBeInTheDocument();
  });

  it("says Unknown rather than guessing when there is no decodable token", () => {
    renderAccount();
    expect(within(screen.getByRole("region", { name: "Session" })).getByText("Unknown")).toBeInTheDocument();
  });

  it("requires confirmation before signing out, and can be cancelled", async () => {
    renderAccount();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    const dialog = screen.getByRole("alertdialog", { name: "Confirm sign out" });
    expect(logout).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(logout).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Sign out" }));
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
