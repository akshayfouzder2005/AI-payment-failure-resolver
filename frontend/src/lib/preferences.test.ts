import { beforeEach, describe, expect, it } from "vitest";
import { getDefaultPageSize, setDefaultPageSize } from "./preferences";

beforeEach(() => localStorage.clear());

describe("default page size preference", () => {
  it("defaults to 25", () => {
    expect(getDefaultPageSize()).toBe(25);
  });
  it("round-trips a valid size", () => {
    setDefaultPageSize(100);
    expect(getDefaultPageSize()).toBe(100);
  });
  it("clears storage when set back to the default", () => {
    setDefaultPageSize(50);
    setDefaultPageSize(25);
    expect(localStorage.getItem("recoverai_default_page_size")).toBeNull();
  });
  it("ignores a stored value that isn't an offered size", () => {
    localStorage.setItem("recoverai_default_page_size", "7");
    expect(getDefaultPageSize()).toBe(25);
  });
});
