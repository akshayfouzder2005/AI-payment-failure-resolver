import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Explicit-import style (not `test.globals`) means RTL's automatic
// afterEach-cleanup registration never fires on its own — without this,
// each test's render() would pile onto the previous one's DOM.
afterEach(() => {
  cleanup();
});
