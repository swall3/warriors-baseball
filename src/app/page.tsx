"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

const TRYOUT_DATE     = "Monday, June 22, 2026";
const TRYOUT_TIME     = "6:00 PM – 8:00 PM";
const TRYOUT_LOCATION = "East Cherokee Recreation Complex";
const TRYOUT_ADDRESS  = "123 Field Rd, Canton, GA 30114";
const COACH_EMAIL     = "warriors8u@gmail.com";
const COACH_PHONE     = "(678) 555-0000";

const PILLARS = [
  {
    num: "01",
    title: "Elite Training",
    body: "Coached by experienced leaders who develop players at every level. We train hard so games feel easy.",
  },
  {
    num: "02",
    title: "Competitive Play",
    body: "Tournament baseball against the best teams in the region. We compete at the highest local level.",
  },
  {
    num: "03",
    title: "Brotherhood",
    body: "More than a team. We build character, leadership, and bonds that last long after the final out.",
  },
];

const BRING = [
  "Baseball glove",
  "Athletic cleats (turf or grass)",
  "Batting helmet (if you have one)",
  "Water bottle",
  "Your best attitude",
];

const EXPECT = [
  "Fielding evaluation",
  "Hitting assessment",
  "Throwing / arm strength",
  "Baserunning speed",
  "Coachability & attitude",
];

export default function HomePage() {
  const [form, setForm] = useState({
    playerName: "", age: "", parentName: "", phone: "",
    email: "", position: "", experience: "", notes: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Something went wrong");
      }
      setStatus("success");
      setForm({ playerName: "", age: "", parentName: "", phone: "", email: "", position: "", experience: "", notes: "" });
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Submission failed");
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ─────────────── NAV ─────────────── */}
      <nav
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-[#0f2044]/95 backdrop-blur-md shadow-lg shadow-black/20 py-2.5"
            : "bg-transparent py-4"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/images/warriors/mascot.png" alt="Warriors" width={40} height={40} className="object-contain drop-shadow" />
            <div className="leading-none">
              <p className="text-white font-display text-lg tracking-wide">WARRIORS</p>
              <p className="text-[#c9a84c] text-[10px] font-semibold tracking-[0.25em]">EAST CHEROKEE · 8U</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <a href="#program" className="hidden md:block text-white/75 hover:text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-white/10 transition-colors">Program</a>
            <a href="#tryouts" className="hidden md:block text-white/75 hover:text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-white/10 transition-colors">Tryouts</a>
            <a href="#signup" className="bg-[#8b1a2e] hover:bg-[#a82037] text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
              Sign Up
            </a>
          </div>
        </div>
      </nav>

      {/* ─────────────── HERO ─────────────── */}
      <section className="relative min-h-screen flex items-center overflow-hidden bg-[#0f2044]">
        {/* Stadium photo — real presence */}
        <Image
          src="/images/hero-bg.jpg"
          alt=""
          fill
          priority
          className="object-cover object-center opacity-65"
        />
        {/* Legibility gradients on top of the photo */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f2044] via-[#0f2044]/85 to-[#0f2044]/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f2044] via-transparent to-[#0f2044]/40" />

        {/* Mascot bleeding off the right edge */}
        <div className="hidden lg:block absolute right-[-4%] xl:right-[2%] bottom-0 top-16 w-[46%] pointer-events-none">
          <Image
            src="/images/warriors/mascot.png"
            alt="East Cherokee Warriors mascot"
            fill
            priority
            className="object-contain object-bottom drop-shadow-2xl"
          />
        </div>

        {/* Hero copy — left aligned, massive */}
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 pt-28 pb-16">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 bg-[#8b1a2e] text-white text-[11px] font-bold uppercase tracking-[0.22em] px-4 py-2 rounded-full mb-7 shadow-lg shadow-[#8b1a2e]/30">
              <span className="w-2 h-2 rounded-full bg-[#c9a84c]" />
              Tryouts Open — Limited Roster
            </div>

            <h1 className="font-display text-white leading-[0.82] mb-2">
              <span className="block text-[#c9a84c] text-2xl sm:text-3xl tracking-[0.18em] mb-3 font-display">EAST CHEROKEE</span>
              <span className="block text-7xl sm:text-8xl xl:text-9xl">WARRIORS</span>
            </h1>

            <p className="text-white/70 text-lg sm:text-xl leading-relaxed mb-9 mt-7 max-w-lg font-medium">
              Built on discipline, grit, and the warrior spirit. One of North Georgia&apos;s premier 8U travel programs.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <a href="#signup"
                className="cta-crimson bg-[#8b1a2e] hover:bg-[#a82037] text-white font-bold text-sm uppercase tracking-[0.12em] px-9 py-4 rounded-xl transition-all text-center">
                Register for Tryouts →
              </a>
              <a href="#tryouts"
                className="border-2 border-white/25 hover:border-[#c9a84c] hover:text-[#c9a84c] text-white font-bold text-sm uppercase tracking-[0.12em] px-9 py-4 rounded-xl transition-colors text-center backdrop-blur-sm">
                Tryout Details
              </a>
            </div>

            {/* Badge strip — feels substantial */}
            <div className="inline-flex flex-wrap items-center gap-x-5 gap-y-2 text-white/80 text-sm font-bold uppercase tracking-wider border-t border-white/15 pt-5">
              <span>8U</span>
              <span className="w-1 h-1 rounded-full bg-[#c9a84c]" />
              <span>Travel Ball</span>
              <span className="w-1 h-1 rounded-full bg-[#c9a84c]" />
              <span>Canton, GA</span>
              <span className="w-1 h-1 rounded-full bg-[#c9a84c]" />
              <span className="text-[#c9a84c]">2026 Season</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────── PILLARS / PROGRAM ─────────────── */}
      <section id="program" className="relative bg-white pt-28 pb-28 px-6 -mt-1">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-14">
            <div>
              <p className="text-[#8b1a2e] text-xs font-bold uppercase tracking-[0.3em] mb-3">Who We Are</p>
              <h2 className="font-display text-5xl md:text-6xl text-[#0f2044] leading-none">THE WARRIOR WAY</h2>
            </div>
            <p className="text-gray-500 max-w-sm text-base leading-relaxed md:text-right">
              Three pillars. One standard. Everything we do is built to develop complete ballplayers and better young men.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {PILLARS.map(p => (
              <div key={p.title} className="group relative bg-[#f7f8fa] rounded-2xl p-8 border border-gray-100 overflow-hidden hover:shadow-xl hover:shadow-[#0f2044]/10 hover:-translate-y-1 transition-all duration-300">
                <div className="absolute -top-3 right-4 font-display text-7xl text-[#0f2044]/[0.05] group-hover:text-[#8b1a2e]/10 transition-colors select-none">
                  {p.num}
                </div>
                <div className="relative">
                  <div className="w-12 h-1.5 bg-[#8b1a2e] rounded-full mb-6" />
                  <h3 className="font-display text-2xl text-[#0f2044] mb-3 tracking-wide">{p.title.toUpperCase()}</h3>
                  <p className="text-gray-500 text-[15px] leading-relaxed">{p.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─────────────── TRYOUTS ─────────────── */}
      <section
        id="tryouts"
        className="clip-top-slope relative bg-[#0f2044] pt-36 pb-28 px-6 overflow-hidden"
      >
        {/* Mascot watermark behind the section */}
        <div className="absolute -right-20 top-1/2 -translate-y-1/2 w-[520px] h-[520px] opacity-[0.06] pointer-events-none select-none">
          <Image src="/images/warriors/mascot.png" alt="" fill className="object-contain" />
        </div>

        <div className="relative max-w-6xl mx-auto">
          <div className="mb-14 max-w-2xl">
            <p className="text-[#c9a84c] text-xs font-bold uppercase tracking-[0.3em] mb-3">Open Registration</p>
            <h2 className="font-display text-5xl md:text-6xl text-white leading-none mb-5">TRYOUT DETAILS</h2>
            <p className="text-white/60 text-lg leading-relaxed">
              All skill levels welcome — we&apos;ll find the right fit for every player who brings the effort.
            </p>
          </div>

          {/* Event cards — large, clean */}
          <div className="grid md:grid-cols-3 gap-5 mb-12">
            {[
              { label: "Date",     value: TRYOUT_DATE,     sub: null },
              { label: "Time",     value: TRYOUT_TIME,     sub: null },
              { label: "Location", value: TRYOUT_LOCATION, sub: TRYOUT_ADDRESS },
            ].map(item => (
              <div key={item.label} className="bg-white/[0.04] border border-white/10 rounded-2xl p-7 hover:border-[#c9a84c]/40 transition-colors">
                <p className="text-[#c9a84c] text-[11px] font-bold uppercase tracking-[0.2em] mb-3">{item.label}</p>
                <p className="text-white font-bold text-xl leading-snug">{item.value}</p>
                {item.sub && <p className="text-white/45 text-sm mt-2">{item.sub}</p>}
              </div>
            ))}
          </div>

          {/* Bring / Expect */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8">
              <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-[#c9a84c] mb-6">What to Bring</h3>
              <ul className="space-y-4">
                {BRING.map(item => (
                  <li key={item} className="flex items-center gap-3 text-white/85 text-[15px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8b1a2e] shrink-0 ring-4 ring-[#8b1a2e]/20" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-8">
              <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-[#c9a84c] mb-6">What to Expect</h3>
              <ul className="space-y-4">
                {EXPECT.map(item => (
                  <li key={item} className="flex items-center gap-3 text-white/85 text-[15px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8b1a2e] shrink-0 ring-4 ring-[#8b1a2e]/20" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <a href="#signup"
            className="cta-crimson inline-block bg-[#8b1a2e] hover:bg-[#a82037] text-white font-bold text-sm uppercase tracking-[0.12em] px-10 py-4 rounded-xl transition-all">
            Register Now →
          </a>
        </div>
      </section>

      {/* ─────────────── SIGN UP ─────────────── */}
      <section id="signup" className="relative bg-[#f7f8fa] py-28 px-6 overflow-hidden">
        {/* Glove/dirt accent strip on the left */}
        <div className="hidden lg:block absolute left-0 top-0 bottom-0 w-[34%]">
          <Image src="/images/glove-dirt.jpg" alt="" fill className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0f2044]/70 to-[#f7f8fa]" />
          <div className="absolute inset-0 flex items-end p-12">
            <div>
              <p className="font-display text-4xl text-white leading-none mb-3 drop-shadow-lg">SECURE<br />YOUR SPOT</p>
              <p className="text-white/80 text-sm max-w-xs font-medium drop-shadow">Roster is limited. Lock in your tryout today and earn your place on the field.</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-2xl mx-auto lg:ml-auto lg:mr-0 lg:max-w-xl">
          <div className="mb-8 lg:hidden text-center">
            <p className="text-[#8b1a2e] text-xs font-bold uppercase tracking-[0.3em] mb-3">Secure Your Spot</p>
            <h2 className="font-display text-5xl text-[#0f2044] leading-none">REGISTER</h2>
          </div>

          {status === "success" ? (
            <div className="bg-white rounded-2xl shadow-xl shadow-[#0f2044]/10 border border-gray-100 p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#8b1a2e] flex items-center justify-center text-white text-3xl font-display">✓</div>
              <h3 className="font-display text-3xl text-[#0f2044] mb-3">YOU&apos;RE REGISTERED!</h3>
              <p className="text-gray-500 mb-2">We&apos;ll be in touch with details. Get ready — the Warriors are waiting.</p>
              <p className="text-gray-400 text-sm mb-8">
                Questions? <a href={`mailto:${COACH_EMAIL}`} className="text-[#8b1a2e] hover:underline font-semibold">{COACH_EMAIL}</a>
              </p>
              <button onClick={() => setStatus("idle")}
                className="bg-[#0f2044] hover:bg-[#1a3160] text-white font-bold px-8 py-3 rounded-xl transition-colors text-sm">
                Register Another Player
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl shadow-[#0f2044]/10 border border-gray-100 p-8 space-y-5">
              <div className="hidden lg:block mb-2">
                <h3 className="font-display text-3xl text-[#0f2044] leading-none mb-1">REGISTER</h3>
                <p className="text-gray-400 text-sm">Fill out the form below — it takes a minute.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Player Name *</label>
                <input type="text" name="playerName" value={form.playerName} onChange={handleChange} required placeholder="First Last" className="field" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Age *</label>
                  <select name="age" value={form.age} onChange={handleChange} required className="field">
                    <option value="">Select age</option>
                    {[6, 7, 8, 9].map(a => <option key={a} value={a}>{a} years old</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Position</label>
                  <select name="position" value={form.position} onChange={handleChange} className="field">
                    <option value="">Any / Unknown</option>
                    <option value="Pitcher">Pitcher</option>
                    <option value="Catcher">Catcher</option>
                    <option value="1B">First Base</option>
                    <option value="2B">Second Base</option>
                    <option value="3B">Third Base</option>
                    <option value="SS">Shortstop</option>
                    <option value="OF">Outfield</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Years of Experience</label>
                <select name="experience" value={form.experience} onChange={handleChange} className="field">
                  <option value="">Select experience</option>
                  <option value="First year">First year</option>
                  <option value="1-2 years">1–2 years</option>
                  <option value="3-4 years">3–4 years</option>
                  <option value="5+ years">5+ years</option>
                </select>
              </div>

              <div className="border-t border-gray-100 pt-1" />

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Parent / Guardian Name *</label>
                <input type="text" name="parentName" value={form.parentName} onChange={handleChange} required placeholder="First Last" className="field" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Phone *</label>
                  <input type="tel" name="phone" value={form.phone} onChange={handleChange} required placeholder="(555) 000-0000" className="field" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Email *</label>
                  <input type="email" name="email" value={form.email} onChange={handleChange} required placeholder="email@example.com" className="field" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Anything else?</label>
                <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} placeholder="Previous team, questions, etc." className="field" />
              </div>

              {status === "error" && (
                <div className="rounded-xl px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200">
                  {errorMsg || "Something went wrong. Please try again."}
                </div>
              )}

              <button type="submit" disabled={status === "loading"}
                className="cta-crimson w-full bg-[#8b1a2e] hover:bg-[#a82037] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm uppercase tracking-[0.12em] py-4 rounded-xl transition-all">
                {status === "loading" ? "Submitting…" : "Secure My Spot →"}
              </button>

              <p className="text-center text-xs text-gray-400">Your info is only shared with the Warriors coaching staff.</p>
            </form>
          )}
        </div>
      </section>

      {/* ─────────────── FOOTER ─────────────── */}
      <footer className="bg-[#0f2044] py-14 px-6 border-t-4 border-[#8b1a2e]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-4">
            <Image src="/images/warriors/mascot.png" alt="Warriors" width={52} height={52} className="object-contain" />
            <div>
              <p className="font-display text-xl text-white tracking-wide leading-none mb-1">EAST CHEROKEE WARRIORS</p>
              <p className="text-[#c9a84c] text-xs font-semibold tracking-[0.2em]">8U TRAVEL BASEBALL · {new Date().getFullYear()}</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6 text-sm">
            <a href={`mailto:${COACH_EMAIL}`} className="text-[#c9a84c] hover:text-white transition-colors font-semibold">{COACH_EMAIL}</a>
            <span className="hidden sm:inline text-white/20">|</span>
            <a href={`tel:${COACH_PHONE}`} className="text-white/55 hover:text-white transition-colors">{COACH_PHONE}</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
