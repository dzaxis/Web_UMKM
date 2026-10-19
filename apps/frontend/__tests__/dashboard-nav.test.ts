import { describe, expect, it } from "vitest";

import {
  defaultDashboardPath,
  deriveNavRole,
  navForRole,
  navigableNavItems,
  toPlatformRole,
} from "@/lib/dashboard-nav";

describe("toPlatformRole", () => {
  it("mengenali tiga peran platform", () => {
    expect(toPlatformRole("ADMIN")).toBe("ADMIN");
    expect(toPlatformRole("OWNER")).toBe("OWNER");
    expect(toPlatformRole("STAFF")).toBe("STAFF");
  });

  it("mengembalikan null untuk nilai tak dikenal", () => {
    expect(toPlatformRole(null)).toBeNull();
    expect(toPlatformRole(undefined)).toBeNull();
    expect(toPlatformRole("pemilik")).toBeNull();
    expect(toPlatformRole(7)).toBeNull();
  });
});

describe("defaultDashboardPath", () => {
  it("ADMIN diarahkan ke area admin", () => {
    expect(defaultDashboardPath("ADMIN")).toBe("/dashboard/admin");
  });

  it("OWNER dan STAFF diarahkan ke toko, termasuk peran tak dikenal", () => {
    expect(defaultDashboardPath("OWNER")).toBe("/dashboard/toko");
    expect(defaultDashboardPath("STAFF")).toBe("/dashboard/toko");
    expect(defaultDashboardPath(null)).toBe("/dashboard/toko");
  });
});

describe("navForRole", () => {
  it("OWNER dan STAFF memang tidak punya item admin", () => {
    const ownerKeys = navForRole("OWNER").map((item) => item.key);
    const staffKeys = navForRole("STAFF").map((item) => item.key);
    expect(ownerKeys).not.toContain("admin-users");
    expect(staffKeys).not.toContain("admin-users");
    expect(navForRole(null)).toEqual([]);
  });

  it("OWNER melihat halaman fitur, bukan hanya Profil", () => {
    const hrefs = navForRole("OWNER").map((item) => item.href);
    expect(hrefs).toContain("/dashboard/analytics");
    expect(hrefs).toContain("/dashboard/analytics-jobs");
    expect(hrefs).toContain("/dashboard/data");
    expect(hrefs).toContain("/dashboard/orders");
    expect(hrefs).toContain("/dashboard/catalog");
    expect(hrefs).toContain("/dashboard/reports");
    expect(hrefs).toContain("/dashboard/toko");
    expect(hrefs).toContain("/dashboard/profil");
  });

  it("STAFF hanya melihat halaman yang tidak butuh peran pemilik", () => {
    const hrefs = navForRole("STAFF").map((item) => item.href);
    expect(hrefs).toContain("/dashboard/analytics");
    expect(hrefs).toContain("/dashboard/orders");
    expect(hrefs).toContain("/dashboard/reports");
    expect(hrefs).toContain("/dashboard/toko");
    expect(hrefs).not.toContain("/dashboard/catalog");
    expect(hrefs).not.toContain("/dashboard/data");
  });

  it("tidak ada href null yang bisa diklik, danNavigable hanya yang ber-href", () => {
    const adminItems = navForRole("ADMIN");
    const navigable = navigableNavItems("ADMIN").map((item) => item.href);
    expect(navigable.every((href) => href !== null)).toBe(true);
    expect(adminItems.some((item) => item.href === null)).toBe(true);
  });
});

describe("deriveNavRole", () => {
  it("ADMIN selalu dapat menu admin", () => {
    expect(deriveNavRole({ role: "ADMIN", stores: [] })).toBe("ADMIN");
    expect(deriveNavRole({ role: "ADMIN", stores: [{ role: "OWNER" }] })).toBe("ADMIN");
  });

  it("membership OWNER di toko mana pun menghasilkan menu OWNER", () => {
    expect(deriveNavRole({ role: "OWNER", stores: [{ role: "OWNER" }] })).toBe("OWNER");
    expect(
      deriveNavRole({ role: "OWNER", stores: [{ role: "STAFF" }, { role: "OWNER" }] }),
    ).toBe("OWNER");
  });

  it("hanya membership STAFF menghasilkan menu STAFF", () => {
    expect(deriveNavRole({ role: "OWNER", stores: [{ role: "STAFF" }] })).toBe("STAFF");
    expect(
      deriveNavRole({ role: "STAFF", stores: [{ role: "STAFF" }, { role: "STAFF" }] }),
    ).toBe("STAFF");
  });

  it("tanpa toko tetap OWNER agar bisa membuat toko pertama", () => {
    expect(deriveNavRole({ role: "OWNER", stores: [] })).toBe("OWNER");
    expect(deriveNavRole({ role: "STAFF", stores: [] })).toBe("OWNER");
  });

  it("null dan peran tak dikenal menghasilkan null", () => {
    expect(deriveNavRole(null)).toBeNull();
    expect(deriveNavRole({ role: "pemilik", stores: [] })).toBeNull();
  });
});
