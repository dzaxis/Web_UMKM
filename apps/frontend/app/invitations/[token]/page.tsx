import { AcceptInvitation } from "@/components/auth/accept-invitation";

/**
 * Token undangan adalah data runtime dari URL, jadi tidak ada shell yang bisa
 * di-prerender. `instant = false` menyatakan route ini memang blocking; cache
 * tidak boleh dipakai karena halaman ini membawa token rahasia.
 */
export const instant = false;

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <AcceptInvitation token={token} />;
}
