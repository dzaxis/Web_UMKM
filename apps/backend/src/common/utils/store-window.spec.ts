import { describe, expect, it, vi, afterEach } from "vitest";
import { eachUtcDate, resolveStoreWindow } from "./store-window.js";
import type { PrismaService } from "../../database/prisma.service.js";

function fakePrisma(latest: Date | null): PrismaService {
  return {
    orders: {
      aggregate: vi.fn().mockResolvedValue({ _max: { orderDate: latest } }),
    },
  } as unknown as PrismaService;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveStoreWindow", () => {
  it("menghitung 30 hari terakhir relatif terhadap data terakhir, bukan hari ini", async () => {
    const window = await resolveStoreWindow(
      fakePrisma(new Date("2025-12-31T10:00:00.000Z")),
      "store-1",
      30,
    );

    expect(window.end.toISOString()).toBe("2025-12-31T23:59:59.999Z");
    expect(window.start.toISOString()).toBe("2025-12-02T00:00:00.000Z");
    expect(window.latestDataDate?.toISOString()).toBe("2025-12-31T10:00:00.000Z");
    expect(window.hasData).toBe(true);
  });

  it("YTD dimulai dari 1 Januari pada tahun data terakhir", async () => {
    const window = await resolveStoreWindow(
      fakePrisma(new Date("2024-06-15T00:00:00.000Z")),
      "store-1",
      null,
    );

    expect(window.start.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(window.end.toISOString()).toBe("2024-06-15T23:59:59.999Z");
  });

  it("toko tanpa transaksi ditandai hasData=false dan memakai hari ini", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00.000Z"));

    const window = await resolveStoreWindow(fakePrisma(null), "store-1", 7);

    expect(window.hasData).toBe(false);
    expect(window.latestDataDate).toBeNull();
    expect(window.end.toISOString()).toBe("2026-10-19T23:59:59.999Z");
    expect(window.start.toISOString()).toBe("2026-10-13T00:00:00.000Z");
  });

  it("eachUtcDate inklusif dan tidak melewatkan hari sepi", () => {
    const dates = eachUtcDate(
      new Date("2025-12-30T00:00:00.000Z"),
      new Date("2026-01-02T23:59:59.999Z"),
    );

    expect(dates).toEqual(["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"]);
  });
});
