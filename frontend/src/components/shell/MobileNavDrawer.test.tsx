import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { MobileNavDrawer } from "./MobileNavDrawer";

function renderDrawer(open: boolean, onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <MobileNavDrawer open={open} onClose={onClose} />
    </MemoryRouter>,
  );
  return onClose;
}

describe("MobileNavDrawer", () => {
  it("renders nothing when closed", () => {
    renderDrawer(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the nav as a dialog when open", () => {
    renderDrawer(true);
    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = renderDrawer(true);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the close button is clicked", async () => {
    const onClose = renderDrawer(true);
    await userEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when a nav link is followed", async () => {
    const onClose = renderDrawer(true);
    await userEvent.click(screen.getByRole("link", { name: "Payments" }));
    expect(onClose).toHaveBeenCalled();
  });
});
