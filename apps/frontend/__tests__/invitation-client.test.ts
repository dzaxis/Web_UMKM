import { beforeEach, describe, expect, it, vi } from "vitest";

const { sessionRequest } = vi.hoisted(() => ({ sessionRequest: vi.fn() }));

vi.mock("@/lib/session-refresh", () => ({ sessionRequest }));

import { acceptInvitation, inviteMember, previewInvitation } from "@/lib/dashboard-data";

describe("invitation client", () => {
  beforeEach(() => {
    sessionRequest.mockReset();
  });

  it("inviteMember POST dengan email + role", async () => {
    sessionRequest.mockResolvedValue({} as never);

    await inviteMember("s1", { email: "p@x.id", role: "STAFF" });

    expect(sessionRequest).toHaveBeenCalledWith("/stores/s1/invitations", {
      method: "POST",
      body: { email: "p@x.id", role: "STAFF" },
    });
  });

  it("previewInvitation memanggil endpoint publik", async () => {
    sessionRequest.mockResolvedValue({} as never);

    await previewInvitation("tok/has space");

    expect(sessionRequest).toHaveBeenCalledWith("/invitations/tok%2Fhas%20space");
  });

  it("acceptInvitation POST ke endpoint accept", async () => {
    sessionRequest.mockResolvedValue({} as never);

    await acceptInvitation("tok");

    expect(sessionRequest).toHaveBeenCalledWith("/invitations/tok/accept", {
      method: "POST",
    });
  });
});
