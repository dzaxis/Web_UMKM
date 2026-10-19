import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { previewInvitation, acceptInvitation } = vi.hoisted(() => ({
  previewInvitation: vi.fn(),
  acceptInvitation: vi.fn(),
}));
const { hasAccessToken } = vi.hoisted(() => ({ hasAccessToken: vi.fn() }));

vi.mock("@/lib/dashboard-data", () => ({ previewInvitation, acceptInvitation }));
vi.mock("@/lib/auth-session", () => ({ hasAccessToken }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

import { AcceptInvitation } from "@/components/auth/accept-invitation";

afterEach(() => cleanup());

describe("AcceptInvitation", () => {
  beforeEach(() => {
    previewInvitation.mockReset();
    acceptInvitation.mockReset();
    hasAccessToken.mockReset();
    hasAccessToken.mockReturnValue(false);
  });

  it("menampilkan ringkasan undangan publik", async () => {
    previewInvitation.mockResolvedValue({
      email: "p@x.id",
      storeName: "Toko Demo",
      role: "STAFF",
      expiresAt: new Date().toISOString(),
    });

    render(<AcceptInvitation token="tok" />);

    expect(await screen.findByText("Toko Demo")).toBeTruthy();
    expect(screen.getByText("p@x.id")).toBeTruthy();
  });

  it("kalau sesi valid, accept mengalihkan ke layar berhasil", async () => {
    previewInvitation.mockResolvedValue({
      email: "p@x.id",
      storeName: "Toko Demo",
      role: "STAFF",
      expiresAt: new Date().toISOString(),
    });
    hasAccessToken.mockReturnValue(true);
    acceptInvitation.mockResolvedValue({
      storeId: "s1",
      storeName: "Toko Demo",
      role: "STAFF",
    });

    render(<AcceptInvitation token="tok" />);
    fireEvent.click(await screen.findByRole("button", { name: "Terima undangan" }));

    expect(await screen.findByText(/tercatat sebagai Pegawai/i)).toBeTruthy();
    expect(acceptInvitation).toHaveBeenCalledWith("tok");
  });
});
