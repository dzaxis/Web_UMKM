import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createStore } = vi.hoisted(() => ({ createStore: vi.fn() }));

vi.mock("@/lib/dashboard-data", () => ({ createStore }));

import { CreateStorePanel } from "@/components/dashboard/create-store-panel";

afterEach(() => {
  cleanup();
});

describe("CreateStorePanel", () => {
  beforeEach(() => {
    createStore.mockReset();
  });

  it("mengirim nama dan kota yang diisi", async () => {
    const onCreated = vi.fn();
    createStore.mockResolvedValue({
      id: "s1",
      name: "Warung Bu Tuti",
      city: "Bandung",
      timezone: "Asia/Jakarta",
      status: "ACTIVE",
      role: "OWNER",
    });

    render(<CreateStorePanel onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText("Nama toko"), {
      target: { value: "Warung Bu Tuti" },
    });
    fireEvent.change(screen.getByLabelText("Kota (opsional)"), {
      target: { value: "Bandung" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buat toko" }));

    await waitFor(() =>
      expect(createStore).toHaveBeenCalledWith({
        name: "Warung Bu Tuti",
        city: "Bandung",
      }),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
  });

  it("tidak memanggil backend kalau nama kurang dari 2 karakter", async () => {
    render(<CreateStorePanel onCreated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Nama toko"), {
      target: { value: "A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Buat toko" }));

    await screen.findByText(/minimal 2 karakter/i);
    expect(createStore).not.toHaveBeenCalled();
  });
});
