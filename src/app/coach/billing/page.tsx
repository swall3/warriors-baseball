"use client";
import { useEffect, useState } from "react";
import { EmailPreferences } from "@/components/coach/EmailPreferences";
import { Workspace, useCatalog, LoadError } from "@/components/coach/Workspace";
import { seatTotal, seatUnitAmount, validSeats } from "@/lib/billing/tiers";
const money = (cents: number) =>
  (cents / 100).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
type Billing = {
  mode: "test" | "disabled";
  ownerConfigured: boolean;
  isBillingOwner: boolean;
  email: string | null;
  status: string;
  complimentary: boolean;
  seats: number;
  billingInterval: "month" | "year" | null;
  activeTeams: number;
  maxSeats: number;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  monthlyAvailable: boolean;
  annualAvailable: boolean;
  access: { reason: string; canStartGame: boolean };
};
export default function BillingPage() {
  const { catalog, error: catalogError, retry } = useCatalog();
  const [team, setTeam] = useState("");
  const [billing, setBilling] = useState<Billing | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [version, setVersion] = useState(0);
  // Annual is the default plan; the seat floor comes from the server, never
  // from the catalog the browser happens to hold.
  const [interval, setInterval] = useState<"month" | "year">("year");
  const [seats, setSeats] = useState("");
  useEffect(() => {
    if (billing) setSeats(String(Math.max(1, billing.activeTeams)));
  }, [billing]);
  useEffect(() => {
    if (!catalog) return;
    const requested = new URLSearchParams(window.location.search).get("team");
    setTeam((t) =>
      catalog.teams.some((x) => x.id === t)
        ? t
        : (catalog.teams.find((x) => x.id === requested)?.id ??
          catalog.teams[0]?.id ??
          ""),
    );
  }, [catalog]);
  useEffect(() => {
    const controller = new AbortController();
    setBilling(null);
    setError("");
    fetch("/api/coach/billing", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setBilling(d);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [version]);
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("checkout");
    if (result === "returned")
      setNotice(
        "Checkout returned. Subscription status updates after payment confirmation. Refresh status in a moment.",
      );
    if (result === "cancelled")
      setNotice("Checkout was cancelled. Your team’s access has not changed.");
  }, []);
  async function action(path: string, body: unknown, method = "POST") {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/coach/billing/${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "DELETE" ? undefined : JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Please retry.");
      if (d.url) {
        window.location.assign(d.url);
        return;
      }
      if (
        path === "account" &&
        method === "POST" &&
        (body as { action: string }).action === "send"
      ) {
        setSent(true);
        setNotice(d.message);
      } else {
        setVersion((x) => x + 1);
        setSent(false);
        setCode("");
        setNotice(
          method === "DELETE"
            ? "Billing account signed out."
            : "Email verified.",
        );
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to complete this action.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Workspace catalog={catalog} active="Billing">
      <section className="nf-card">
        <p className="nf-eyebrow">ORGANIZATION SUBSCRIPTION</p>
        <h2 className="text-3xl font-extrabold tracking-tight mt-3">
          One seat per team. Everyone on it included.
        </h2>
        <p>
          Your organization buys a seat for each team it runs. Every coach,
          parent and player on a team is included at no extra cost, and the
          per-seat price drops as you add teams.
        </p>
        {catalogError && <LoadError error={catalogError} retry={retry} />}
        <label className="nf-label">
          Email notifications for
          <select
            value={team}
            onChange={(e) => {
              setTeam(e.target.value);
              setNotice("");
            }}
            disabled={busy}
          >
            {catalog?.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {catalog && !catalog.teams.length && (
          <p>Add a team to manage its email notifications.</p>
        )}
        {error && (
          <div role="alert" className="nf-notice">
            {error}
            <button onClick={() => setVersion((x) => x + 1)}>Retry</button>
          </div>
        )}
        {notice && (
          <p role="status" className="nf-notice">
            {notice}
          </p>
        )}
        {!billing && !error && <p role="status">Loading subscription…</p>}
        {billing && (
          <>
            <div className="nf-notice">
              <strong>
                {billing.complimentary
                  ? "Complimentary team access"
                  : billing.access.reason === "pilot"
                    ? "Pilot access"
                    : billing.status.replaceAll("_", " ")}
              </strong>
              <p>
                {billing.mode === "test"
                  ? "Payment testing only — no real charges."
                  : "Payments are not open yet. Your current team access continues."}
              </p>
              {billing.status !== "none" && (
                <p>
                  Subscription: {billing.status.replaceAll("_", " ")}
                  {billing.cancelAtPeriodEnd
                    ? " · Cancels at the end of the billing period"
                    : ""}
                </p>
              )}
              {billing.status !== "none" && !billing.complimentary && (
                <p>
                  {billing.seats} team {billing.seats === 1 ? "seat" : "seats"}
                  {billing.billingInterval
                    ? `, billed ${billing.billingInterval === "year" ? "annually" : "monthly"}`
                    : ""}
                  . Contact support to change your seat count.
                </p>
              )}
              {billing.currentPeriodEnd && (
                <p>
                  Current period ends{" "}
                  {new Date(billing.currentPeriodEnd).toLocaleDateString()}.
                </p>
              )}
            </div>
            <p>
              Your plan includes rosters, lineups, live scoring, pitch counts,
              team insights and assigned practice.
            </p>
            {!billing.ownerConfigured ? (
              <p>
                A billing owner needs to be assigned to this organization before
                payments can be managed. Your shared team passcode does not
                grant billing access.
              </p>
            ) : !billing.isBillingOwner ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action("account", {
                    action: sent ? "verify" : "send",
                    email,
                    token: code,
                  });
                }}
                className="space-y-4 mt-6"
              >
                <h3>Verify your billing account</h3>
                <p>
                  Use the email assigned to this organization’s billing owner.
                </p>
                <label className="nf-label">
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setSent(false);
                    }}
                    disabled={busy}
                  />
                </label>
                {sent && (
                  <label className="nf-label">
                    Email code
                    <input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6,10}"
                      required
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                )}
                <button className="nf-button" disabled={busy}>
                  {busy
                    ? "Please wait…"
                    : sent
                      ? "Verify email"
                      : "Email me a code"}
                </button>
                {sent && (
                  <button
                    type="button"
                    className="nf-button nf-button-secondary"
                    disabled={busy}
                    onClick={() =>
                      void action("account", { action: "send", email })
                    }
                  >
                    Send another code
                  </button>
                )}
              </form>
            ) : (
              <div className="space-y-4 mt-6">
                <p>Billing owner: {billing.email}</p>
                {!billing.complimentary &&
                  ["none", "canceled", "incomplete_expired"].includes(
                    billing.status,
                  ) && (
                    <div className="space-y-4">
                      <label className="nf-label">
                        Team seats
                        <input
                          type="number"
                          inputMode="numeric"
                          step={1}
                          min={Math.max(1, billing.activeTeams)}
                          max={billing.maxSeats}
                          value={seats}
                          onChange={(e) => setSeats(e.target.value)}
                          disabled={busy}
                        />
                      </label>
                      <p>
                        {billing.activeTeams} active{" "}
                        {billing.activeTeams === 1 ? "team" : "teams"} today.
                        Buy at least that many seats.
                      </p>
                      <label className="nf-label">
                        Billing period
                        <select
                          value={interval}
                          onChange={(e) =>
                            setInterval(e.target.value as "month" | "year")
                          }
                          disabled={busy}
                        >
                          <option value="year">Annual</option>
                          <option value="month">Monthly</option>
                        </select>
                      </label>
                      {validSeats(Number(seats)) && (
                        <p role="status">
                          Estimated {money(seatTotal(Number(seats), interval))}{" "}
                          per {interval === "year" ? "year" : "month"} —{" "}
                          {money(seatUnitAmount(Number(seats), interval))} per
                          seat at {seats} seats. This is an estimate only;
                          Stripe shows the amount you will actually be charged
                          in checkout.
                        </p>
                      )}
                      <button
                        className="nf-button"
                        disabled={
                          busy ||
                          billing.mode !== "test" ||
                          !validSeats(Number(seats)) ||
                          Number(seats) < billing.activeTeams ||
                          (interval === "month"
                            ? !billing.monthlyAvailable
                            : !billing.annualAvailable)
                        }
                        onClick={() =>
                          void action("checkout", {
                            interval,
                            seats: Number(seats),
                          })
                        }
                      >
                        View checkout
                      </button>
                    </div>
                  )}
                <p>
                  Review the price and any trial terms in checkout before
                  subscribing.
                </p>
                {billing.hasCustomer && (
                  <button
                    className="nf-button"
                    disabled={busy || billing.mode !== "test"}
                    onClick={() => void action("portal", {})}
                  >
                    Manage billing
                  </button>
                )}
                <button
                  className="nf-button nf-button-secondary"
                  disabled={busy}
                  onClick={() => void action("account", null, "DELETE")}
                >
                  Sign out of billing
                </button>
              </div>
            )}
            {billing.isBillingOwner && team && (
              <EmailPreferences key={team} team={team} />
            )}
            <button
              className="nf-button nf-button-secondary mt-4"
              disabled={busy}
              onClick={() => setVersion((x) => x + 1)}
            >
              Refresh status
            </button>
            <p className="mt-6">
              Your game history stays available if a subscription ends. Billing
              changes never stop a game already underway.
            </p>
          </>
        )}
      </section>
    </Workspace>
  );
}
