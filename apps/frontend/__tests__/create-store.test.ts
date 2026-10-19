import { beforeEach, describe, expect, it, vi } from "vitest";

const { sessionRequest } = vi.hoisted(() => ({ sessionRequest: vi.fn() }));

vi.mock("@/lib/session-refresh", () => ({ sessionRequest }));

import { createStore } from "@/lib/dashboard-data";

describe("createStore", () => {
  beforeEach(() => {
    sessionRequest.mockReset();
    sessionRequest.mockResolvedValue({
      id: "s1",
      name: "Toko Baru",
      city: "Bandung",
      timezone: "Asia/Jakarta",
      status: "ACTIVE",
      role: "OWNER",
    });
  });

  it("POST /stores dengan body name dan city", async () => {
    await createStore({ name: "Toko Baru", city: "Bandung" });

    expect(sessionRequest).toHaveBeenCalledWith("/stores", {
      method: "POST",
      body: { name: "Toko Baru", city: "Bandung" },
    });
  });

  it("mengirim hanya name kalau city tidak diisi", async () => {
    await createStore({ name: "Toko Baru" });

    expect(sessionRequest).toHaveBeenCalledWith("/stores", {
      method: "POST",
      body: { name: "Toko Baru" },
    });
  });

  it("mengembalikan toko dengan peran pembuat", async () => {
    const created = await createStore({ name: "Toko Baru", city: "Bandung" });

    expect(created.role).toBe("OWNER");
    expect(created.id).toBe("s1");
  });
});
