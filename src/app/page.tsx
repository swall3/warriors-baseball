"use client";

import { useState } from "react";
import Image from "next/image";

const TRYOUT_DATE     = "Monday, June 22, 2026";
const TRYOUT_TIME     = "6:00 PM – 8:00 PM";
const TRYOUT_LOCATION = "East Cherokee Recreation Complex";
const TRYOUT_ADDRESS  = "123 Field Rd, Canton, GA 30114";
const COACH_EMAIL     = "warriors8u@gmail.com";
const COACH_PHONE     = "(678) 555-0000";

const PILLARS = [
  {
    icon: "🎯",
    title: "Elite Training",
    body: "Coached by experienced leaders who develop players at every level. We train hard so games feel easy.",
  },
  {
    icon: "🏆",
    title: "Competitive Play",
    body: "Tournament baseball against the best teams in the region. We compete at the highest local level.",
  },
  {
    icon: "🤝",
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

      {/* ── NAV ── */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-[#0f2044]/95 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/images/warriors/mascot.png" alt="Warriors" width={36} height={36} className="object-contain" />
            <div className="leading-none">
              <p className="text-white font-bold text-sm tracking-wide">WARRIORS</p>
              <p className="text-[#c9a84c] text-[10px] font-medium tracking-widest">EAST CHEROKEE · 8U</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a href="#about"   className="hidden md:block text-white/70 hover:text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors">About</a>
            <a href="#tryouts" className="hidden md:block text-white/70 hover:text-white text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-white/10 transition-colors">Tryouts</a>
            <a href="#signup"  className="bg-[#8b1a2e] hover:bg-[#a82037] text-white text-sm font-bold px-5 py-2 rounded-lg transition-colors">
              Sign Up
            </a>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="bg-[#0f2044] min-h-screen flex items-center pt-16 relative overflow-hidden">
        {/* subtle texture */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        {/* crimson glow bottom */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #8b1a2e 0%, transparent 70%)", filter: "blur(60px)" }} />

        <div className="relative z-10 max-w-6xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-12 items-center">
          {/* text */}
          <div>
            <div className="inline-flex items-center gap-2 bg-[#8b1a2e]/20 border border-[#8b1a2e]/40 text-[#c9a84c] text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full mb-6">
              ⚾ Tryouts Open — Limited Spots
            </div>
            <h1 className="text-5xl md:text-6xl font-black text-white leading-[0.95] tracking-tight mb-6">
              East Cherokee<br />
              <span className="text-[#c9a84c]">Warriors</span><br />
              <span className="text-white/40 text-3xl md:text-4xl font-bold">8U Travel Baseball</span>
            </h1>
            <p className="text-white/60 text-lg leading-relaxed mb-8 max-w-md">
              Built on discipline, grit, and the warrior spirit. Join one of North Georgia&apos;s elite youth programs.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a href="#signup"
                className="bg-[#8b1a2e] hover:bg-[#a82037] text-white font-black text-sm uppercase tracking-wider px-8 py-4 rounded-xl transition-colors text-center">
                Register for Tryouts →
              </a>
              <a href="#tryouts"
                className="border border-white/20 hover:border-white/40 text-white/80 hover:text-white font-semibold text-sm px-8 py-4 rounded-xl transition-colors text-center">
                Tryout Details
              </a>
            </div>
          </div>

          {/* mascot */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 rounded-full opacity-30"
                style={{ background: "radial-gradient(circle, #8b1a2e 0%, transparent 70%)", filter: "blur(40px)", transform: "scale(1.3)" }} />
              <Image
                src="/images/warriors/mascot.png"
                alt="East Cherokee Warriors mascot"
                width={380}
                height={380}
                className="object-contain relative z-10 drop-shadow-2xl"
                priority
              />
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/30 text-xs tracking-widest animate-bounce">▼</div>
      </section>

      {/* ── ABOUT ── */}
      <section id="about" className="py-24 px-6 bg-[#f7f8fa]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#8b1a2e] text-xs font-bold uppercase tracking-[0.3em] mb-3">Who We Are</p>
            <h2 className="text-4xl md:text-5xl font-black text-[#0f2044] tracking-tight">The Warrior Way</h2>
            <div className="w-16 h-1 bg-[#c9a84c] mx-auto mt-4 rounded-full" />
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {PILLARS.map(p => (
              <div key={p.title} className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md hover:-translate-y-1 transition-all duration-200">
                <div className="w-12 h-12 bg-[#0f2044]/5 rounded-xl flex items-center justify-center text-2xl mb-5">
                  {p.icon}
                </div>
                <h3 className="text-lg font-bold text-[#0f2044] mb-2">{p.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TRYOUTS ── */}
      <section id="tryouts" className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-[#8b1a2e] text-xs font-bold uppercase tracking-[0.3em] mb-3">Open Registration</p>
            <h2 className="text-4xl md:text-5xl font-black text-[#0f2044] tracking-tight">Tryout Details</h2>
            <div className="w-16 h-1 bg-[#c9a84c] mx-auto mt-4 rounded-full mb-6" />
            <p className="text-gray-500 max-w-md mx-auto">
              All skill levels welcome — we&apos;ll find the right fit for every player who brings the effort.
            </p>
          </div>

          {/* Event cards */}
          <div className="grid md:grid-cols-3 gap-5 mb-10">
            {[
              { label: "Date",     value: TRYOUT_DATE,     sub: null },
              { label: "Time",     value: TRYOUT_TIME,     sub: null },
              { label: "Location", value: TRYOUT_LOCATION, sub: TRYOUT_ADDRESS },
            ].map(item => (
              <div key={item.label} className="bg-[#0f2044] rounded-2xl p-6 text-center">
                <p className="text-[#c9a84c] text-xs font-bold uppercase tracking-widest mb-2">{item.label}</p>
                <p className="text-white font-bold text-base leading-snug">{item.value}</p>
                {item.sub && <p className="text-white/50 text-sm mt-1">{item.sub}</p>}
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-10">
            <div className="bg-[#f7f8fa] rounded-2xl p-7 border border-gray-100">
              <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-[#8b1a2e] mb-5">What to Bring</h3>
              <ul className="space-y-3">
                {BRING.map(item => (
                  <li key={item} className="flex items-center gap-3 text-gray-700 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8b1a2e] shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-[#f7f8fa] rounded-2xl p-7 border border-gray-100">
              <h3 className="text-xs font-bold uppercase tracking-[0.25em] text-[#8b1a2e] mb-5">What to Expect</h3>
              <ul className="space-y-3">
                {EXPECT.map(item => (
                  <li key={item} className="flex items-center gap-3 text-gray-700 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#8b1a2e] shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="text-center">
            <a href="#signup"
              className="inline-block bg-[#8b1a2e] hover:bg-[#a82037] text-white font-black text-sm uppercase tracking-wider px-10 py-4 rounded-xl transition-colors">
              Register Now →
            </a>
          </div>
        </div>
      </section>

      {/* ── SIGN UP ── */}
      <section id="signup" className="py-24 px-6 bg-[#f7f8fa]">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[#8b1a2e] text-xs font-bold uppercase tracking-[0.3em] mb-3">Secure Your Spot</p>
            <h2 className="text-4xl md:text-5xl font-black text-[#0f2044] tracking-tight">Register</h2>
            <div className="w-16 h-1 bg-[#c9a84c] mx-auto mt-4 rounded-full mb-4" />
            <p className="text-gray-500 text-sm">Fill out the form below. Roster is limited.</p>
          </div>

          {status === "success" ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
              <div className="w-14 h-14 mx-auto mb-6 rounded-full bg-green-50 flex items-center justify-center text-2xl">
                ✅
              </div>
              <h3 className="text-2xl font-black text-[#0f2044] mb-2">You&apos;re Registered!</h3>
              <p className="text-gray-500 mb-2">We&apos;ll be in touch with details. Get ready — the Warriors are waiting.</p>
              <p className="text-gray-400 text-sm mb-8">
                Questions? <a href={`mailto:${COACH_EMAIL}`} className="text-[#8b1a2e] hover:underline font-medium">{COACH_EMAIL}</a>
              </p>
              <button onClick={() => setStatus("idle")}
                className="bg-[#0f2044] hover:bg-[#1a3160] text-white font-bold px-8 py-3 rounded-xl transition-colors text-sm">
                Register Another Player
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-5">

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

              <div className="border-t border-gray-100 pt-2" />

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
                className="w-full bg-[#8b1a2e] hover:bg-[#a82037] disabled:opacity-50 text-white font-black text-sm uppercase tracking-wider py-4 rounded-xl transition-colors">
                {status === "loading" ? "Submitting…" : "Secure My Spot →"}
              </button>

              <p className="text-center text-xs text-gray-400">Your info is only shared with the Warriors coaching staff.</p>
            </form>
          )}
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-[#0f2044] py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Image src="/images/warriors/mascot.png" alt="Warriors" width={40} height={40} className="object-contain opacity-80" />
            <div>
              <p className="text-white font-bold text-sm">East Cherokee Warriors</p>
              <p className="text-white/40 text-xs">8U Travel Baseball · {new Date().getFullYear()}</p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <a href={`mailto:${COACH_EMAIL}`} className="text-[#c9a84c] hover:underline">{COACH_EMAIL}</a>
            <span className="text-white/20">|</span>
            <a href={`tel:${COACH_PHONE}`} className="text-white/50 hover:text-white transition-colors">{COACH_PHONE}</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
