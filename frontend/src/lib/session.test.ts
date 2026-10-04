import { describe, expect, it } from "vitest";
import { decodeSession, formatTimeRemaining } from "./session";

const b64url = (value: object) => btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (claims: object) => `${b64url({ alg: "HS256" })}.${b64url(claims)}.sig`;

describe("decodeSession", () => {
  it("reads iat and exp from a JWT payload", () => {
    const info = decodeSession(token({ iat: 1_700_000_000, exp: 1_700_086_400 }));
    expect(info?.issuedAt?.toISOString()).toBe("2023-11-14T22:13:20.000Z");
    expect(info?.expiresAt?.toISOString()).toBe("2023-11-15T22:13:20.000Z");
  });
  it("returns null for no token or something that isn't a JWT", () => {
    expect(decodeSession(null)).toBeNull();
    expect(decodeSession("not-a-jwt")).toBeNull();
    expect(decodeSession("a.!!!.c")).toBeNull();
  });
  it("tolerates missing claims", () => {
    expect(decodeSession(token({}))).toEqual({ issuedAt: null, expiresAt: null });
  });
});

describe("formatTimeRemaining", () => {
  const now = new Date("2026-10-03T00:00:00Z").getTime();
  it.each([
    [-1000, "expired"],
    [30_000, "in under a minute"],
    [12 * 60_000, "in 12m"],
    [(3 * 60 + 20) * 60_000, "in 3h 20m"],
    [(6 * 24 + 4) * 3_600_000, "in 6d 4h"],
  ])("%p ms → %s", (offset, expected) => {
    expect(formatTimeRemaining(new Date(now + offset), now)).toBe(expected);
  });
});
