"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/coach/today";
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
        const safe =
          /^\/coach(?:\/|\?|$)/.test(from) && !from.includes("\\")
            ? from
            : "/coach/today";
        const record = new URLSearchParams(location.hash.slice(1)).get(
          "record",
        );
        router.replace(
          safe +
            (record &&
            /^[A-Za-z0-9_-]{40,100}$/.test(record) &&
            /^\/coach\/live\//.test(safe)
              ? `#record=${record}`
              : ""),
        );
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
    <main className="min-h-screen flex flex-col items-center justify-center bg-d-bg text-d-ink px-6">
      <div className="w-full max-w-xs text-center">
        <Link
          href="/"
          className="mb-6 inline-block text-xl font-black tracking-tight text-d-us"
        >
          InningWise
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Team sign-in</h1>
        <p className="mt-1 text-sm text-d-ink-3">
          Sign in with your own email, or use your organization’s existing
          passcode during migration.
        </p>

        <Link
          href={`/account?from=${encodeURIComponent(from)}`}
          onClick={() => {
            const record = new URLSearchParams(location.hash.slice(1)).get(
              "record",
            );
            if (record) sessionStorage.setItem("iw_return_record", record);
          }}
          className="mt-6 block rounded-xl bg-d-sel p-4 text-white font-semibold"
        >
          Sign in with email →
        </Link>
        <Link href="/account?intent=create" className="mt-3 block text-sm font-semibold underline">
          New coach? Create an organization
        </Link>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <input
            type="password"
            inputMode="text"
            autoFocus
            autoComplete="current-password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Passcode"
            className="w-full rounded-xl bg-d-surface border border-d-line-str px-4 py-3 text-center text-lg tracking-widest text-d-ink placeholder:text-d-ink-3 focus:outline-none focus:ring-2 focus:ring-d-sel"
          />
          {error && <p className="text-sm font-semibold text-d-neg">{error}</p>}
          <button
            type="submit"
            disabled={busy || passcode.length === 0}
            className="w-full min-h-[56px] rounded-xl bg-d-sel px-4 py-3 text-lg font-semibold text-white disabled:opacity-50 active:bg-d-us"
            style={{ touchAction: "manipulation" }}
          >
            {busy ? "Checking…" : "Enter"}
          </button>
        </form>

        <p className="mt-6 text-xs text-d-ink-3">
          Stays signed in on this device for 30 days.
        </p>
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
