"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { team } from "@/lib/brand-config";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/coach";
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/coach/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        router.replace(from.startsWith("/") ? from : "/coach");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || "Wrong passcode");
        setBusy(false);
      }
    } catch {
      setError("Network error — try again");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white px-6">
      <div className="w-full max-w-xs text-center">
        <h1 className="text-2xl font-bold tracking-tight">{team.fullName}</h1>
        <p className="mt-1 text-sm text-gray-400">Team access only</p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <input
            type="password"
            inputMode="text"
            autoFocus
            autoComplete="current-password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Passcode"
            className="w-full rounded-xl bg-gray-800 border border-gray-700 px-4 py-3 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy || passcode.length === 0}
            className="w-full rounded-xl bg-green-600 px-4 py-3 text-lg font-semibold disabled:opacity-50 active:bg-green-700"
            style={{ touchAction: "manipulation" }}
          >
            {busy ? "Checking…" : "Enter"}
          </button>
        </form>

        <p className="mt-6 text-xs text-gray-500">Stays signed in on this device for 30 days.</p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
