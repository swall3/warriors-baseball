import type { Metadata } from "next";

// Family accounts use the general InningWise home-screen app, not the
// coach-only launcher inherited from /coach.
export const metadata: Metadata = { manifest: "/manifest.json" };

export default function FamilyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
