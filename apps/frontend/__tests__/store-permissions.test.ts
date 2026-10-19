import { describe, expect, it } from "vitest";

import { canManageStore } from "@/lib/dashboard-nav";

describe("canManageStore", () => {
  it("OWNER pada toko tujuan → true", () => {
    expect(
      canManageStore([{ id: "a", role: "OWNER" }], "a"),
    ).toBe(true);
  });

  it("STAFF pada toko tujuan → false", () => {
    expect(
      canManageStore([{ id: "a", role: "STAFF" }], "a"),
    ).toBe(false);
  });

  it("storeId null → false", () => {
    expect(canManageStore([{ id: "a", role: "OWNER" }], null)).toBe(false);
  });

  it("storeId tidak ada di daftar → false", () => {
    expect(
      canManageStore([{ id: "a", role: "OWNER" }], "b"),
    ).toBe(false);
  });

  it("daftar null/undefined → false", () => {
    expect(canManageStore(null, "a")).toBe(false);
    expect(canManageStore(undefined, "a")).toBe(false);
  });
});
