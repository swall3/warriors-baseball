"use client";

// How a client component learns which tenant it is rendering for.
// MULTI-TENANT-PLAN.md §1.2 (one resolution point) + T7/§6.4 (the reason this
// is needed at all), phase MT-3.
//
// The coach screens are client components holding the live game in React state
// and mirroring it to localStorage. Once those keys are org-namespaced
// (storage-keys.ts) they need an org id ON THE CLIENT — but org identity lives
// in an httpOnly cookie that client JavaScript cannot read, and must not be
// able to read.
//
// So the server resolves it once, in coach/layout.tsx, and hands it down as a
// prop. The value is in the server-rendered HTML, which makes it available
// SYNCHRONOUSLY DURING THE FIRST CLIENT RENDER. That timing is not a nicety:
// coach/page.tsx reads saved game state during render, and an org id that
// arrived one tick later — from a fetch, or from an effect — would mean the
// first read happens against the wrong key, the state falls back to defaults,
// and the write effect then stamps an empty game over the destination. See
// storage-keys.ts's ORDERING note; that is the data-loss path this shape
// exists to close.
//
// It is NOT authority. A client that lies to itself about its org id gets the
// wrong localStorage key and nothing else: every server route re-resolves the
// session from the signed cookie (requireCoach -> getOrgContext), and the org
// scope on every query comes from there. Nothing server-side trusts this value.

import { createContext, useContext, useMemo } from "react";
import {
  coachStorageKeys,
  ensureCoachStorageMigrated,
  type CoachStorageKeys,
} from "@/lib/coach/storage-keys";

export type CoachOrg = {
  // null on /coach/login, which renders inside this layout with no session yet.
  orgId: string | null;
  userId?: string;
  isOwnerOrg: boolean;
  brand?: { name: string; fullName: string; slug: string };
};

const CoachOrgContext = createContext<CoachOrg>({
  orgId: null,
  isOwnerOrg: false,
});

export function CoachOrgProvider({
  value,
  children,
}: {
  value: CoachOrg;
  children: React.ReactNode;
}) {
  // `value` is a fresh object from the server component on every render, so
  // memoize on its fields rather than on the object identity.
  const memo = useMemo(
    () => ({
      orgId: value.orgId,
      userId: value.userId,
      isOwnerOrg: value.isOwnerOrg,
      brand: value.brand,
    }),
    [value.orgId, value.userId, value.isOwnerOrg, value.brand],
  );
  return (
    <CoachOrgContext.Provider value={memo}>{children}</CoachOrgContext.Provider>
  );
}

export function useCoachOrg(): CoachOrg {
  return useContext(CoachOrgContext);
}

// The org-namespaced localStorage keys for this request's tenant, and the
// legacy-key migration that must precede the first read of them.
//
// ⚠️ The migration runs during RENDER, deliberately, not from an effect — see
// storage-keys.ts's ORDERING note. Calling it from useEffect would let the
// caller's read-during-render miss, which is the exact sequence that orphans
// Stuart's in-progress game.
export function useCoachStorageKeys(): CoachStorageKeys {
  const { orgId, isOwnerOrg } = useCoachOrg();
  if (!orgId) {
    // Reachable only from a page rendered without a session — i.e. /coach/login,
    // which stores nothing. Anywhere else this is a bug in the gate, and a
    // thrown error is better than silently reading another org's keys.
    throw new Error(
      "useCoachStorageKeys: no org in context (is this page gated?)",
    );
  }
  ensureCoachStorageMigrated(
    orgId,
    isOwnerOrg,
    typeof window === "undefined" ? undefined : window.localStorage,
  );
  return useMemo(() => coachStorageKeys(orgId), [orgId]);
}

export function useCoachBrand() {
  return (
    useCoachOrg().brand ?? {
      name: "Your team",
      fullName: "Team workspace",
      slug: "team",
    }
  );
}
