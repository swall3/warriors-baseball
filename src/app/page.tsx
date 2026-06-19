"use client";

import { useState } from "react";
import Image from "next/image";

export default function HomePage() {
  const [form, setForm] = useState({
    playerName: "",
    age: "",
    parentName: "",
    phone: "",
    email: "",
    position: "",
    experience: "",
    notes: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
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
    <main className="min-h-screen bg-[#0a0a0a]">
      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4"
        style={{ background: "rgba(10,10,10,0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(139,26,46,0.3)" }}>
        <div className="flex items-center gap-3">
          <Image src="/images/warriors/logo.jpg" alt="Warriors" width={120} height={40} className="object-contain h-10 w-auto" />
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium tracking-widest uppercase text-gray-400">
          <a href="#about" className="hover:text-white transition-colors">About</a>
          <a href="#tryouts" className="hover:text-white transition-colors">Tryouts</a>
          <a href="#signup" className="btn-warrior px-5 py-2 rounded text-white text-xs">Sign Up</a>
        </div>
        <a href="#signup" className="md:hidden btn-warrior px-4 py-2 rounded text-white text-xs font-bold tracking-wide">
          TRYOUTS
        </a>
      </nav>

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
        {/* Background gradient */}
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse at 50% 40%, rgba(139,26,46,0.18) 0%, rgba(10,10,10,0.95) 70%), linear-gradient(180deg, #0a0a0a 0%, #111 50%, #0a0a0a 100%)"
        }} />

        {/* Decorative spear lines */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-1/2 left-0 right-0 h-px opacity-10" style={{ background: "linear-gradient(90deg, transparent, #8b1a2e, #c9a84c, #8b1a2e, transparent)" }} />
          <div className="absolute top-1/2 left-0 right-0 h-px opacity-5 mt-2" style={{ background: "linear-gradient(90deg, transparent, #8b1a2e, transparent)" }} />
          {/* Grid overlay */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: "repeating-linear-gradient(0deg, #fff 0, #fff 1px, transparent 1px, transparent 60px), repeating-linear-gradient(90deg, #fff 0, #fff 1px, transparent 1px, transparent 60px)"
          }} />
        </div>

        <div className="relative z-10 text-center px-6 max-w-5xl mx-auto">
          {/* Mascot */}
          <div className="mb-6 flex justify-center animate-fade-in-up">
            <Image
              src="/images/warriors/mascot.png"
              alt="East Cherokee Warriors"
              width={320}
              height={320}
              className="object-contain"
              style={{ filter: "drop-shadow(0 0 60px rgba(139,26,46,0.7)) drop-shadow(0 0 20px rgba(139,26,46,0.4))" }}
              priority
            />
          </div>

          {/* Spear wordmark */}
          <div className="mb-6 flex justify-center">
            <Image
              src="/images/warriors/logo.jpg"
              alt="Warriors"
              width={480}
              height={160}
              className="object-contain max-w-full opacity-90"
              style={{ filter: "drop-shadow(0 0 20px rgba(139,26,46,0.4))" }}
            />
          </div>

          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mb-12 leading-relaxed">
            Elite youth baseball. Built on discipline, teamwork, and the warrior spirit.<br />
            <span className="text-gray-200 font-semibold">Tryouts this Monday — spots are limited.</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href="#signup"
              className="btn-warrior px-10 py-4 rounded-lg text-white font-black uppercase tracking-widest text-lg"
              style={{ fontFamily: "Impact, Arial Black, sans-serif" }}>
              ⚔ Register for Tryouts
            </a>
            <a href="#about"
              className="px-10 py-4 rounded-lg font-bold uppercase tracking-widest text-gray-300 hover:text-white transition-colors text-base"
              style={{ border: "1px solid rgba(160,160,160,0.3)" }}>
              Learn More
            </a>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-gray-600 text-xs tracking-widest uppercase animate-bounce">
          <span>Scroll</span>
          <span>▼</span>
        </div>
      </section>

      {/* TRIBAL DIVIDER */}
      <div className="tribal-divider" />

      {/* ABOUT */}
      <section id="about" className="py-24 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-[#8b1a2e] text-sm font-bold uppercase tracking-[0.3em] mb-3">Who We Are</p>
          <h2 className="text-4xl md:text-5xl font-black uppercase tracking-wide text-white mb-4"
            style={{ fontFamily: "Impact, Arial Black, sans-serif" }}>
            The Warrior Way
          </h2>
          <div className="tribal-divider max-w-xs mx-auto mt-4" />
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: "⚔",
              title: "Elite Training",
              body: "Coached by experienced leaders who develop players at every level. We train hard so games are easy.",
            },
            {
              icon: "🏆",
              title: "Competitive Play",
              body: "Tournament baseball against top teams. We compete at the highest local and regional levels.",
            },
            {
              icon: "🤝",
              title: "Brotherhood",
              body: "More than a team. We build character, leadership, and bonds that last a lifetime.",
            },
          ].map((card) => (
            <div key={card.title} className="warrior-card rounded-xl p-8 text-center group hover:border-[#8b1a2e] transition-colors">
              <div className="text-5xl mb-4">{card.icon}</div>
              <h3 className="text-xl font-black uppercase tracking-wider text-white mb-3"
                style={{ fontFamily: "Impact, Arial Black, sans-serif" }}>
                {card.title}
              </h3>
              <p className="text-gray-400 leading-relaxed">{card.body}</p>
            </div>
          ))}
        </div>

        {/* Stats row */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6">
          {[
            { stat: "8U", label: "Age Group" },
            { stat: "100%", label: "Heart" },
            { stat: "⚔", label: "Warrior Spirit" },
            { stat: "MON", label: "Tryout Day" },
          ].map((item) => (
            <div key={item.label} className="text-center p-6 warrior-card rounded-xl">
              <div className="text-4xl font-black text-[#c9a84c] mb-2"
                style={{ fontFamily: "Impact, Arial Black, sans-serif" }}>
                {item.stat}
              </div>
              <div className="text-xs uppercase tracking-widest text-gray-500">{item.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* TRIBAL DIVIDER */}
      <div className="tribal-divider" />

      {/* TRYOUTS INFO */}
      <section id="tryouts" className="py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0" style={{
          background: "radial-gradient(ellipse at 50% 50%, rgba(139,26,46,0.08) 0%, transparent 70%)"
        }} />
        <div className="max-w-4xl mx-auto relative z-10">
          <div className="text-center mb-12">
            <p className="text-[#8b1a2e] text-sm font-bold uppercase tracking-[0.3em] mb-3">Open Registration</p>
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-wide text-white mb-4"
              style={{ fontFamily: "Impact, Arial Black, sans-serif" }}>
              Tryouts Monday
            </h2>
            <div className="tribal-divider max-w-xs mx-auto mt-4 mb-8" />
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              We&apos;re building something special. If your player has the drive, we want to see them.
              All skill levels welcome — we&apos;ll find the right fit.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <div className="warrior-card rounded-xl p-8">
              <h3 className="text-lg font-black uppercase tracking-wider text-[#c9a84c] mb-4">What to Bring</h3>
              <ul className="spear-list space-y-2 text-gray-300 list-none">
                <li>Baseball glove</li>
                <li>Athletic cleats (turf or grass)</li>
                <li>Batting helmet (if you have one)</li>
                <li>Water bottle</li>
                <li>Your best attitude</li>
              </ul>
            </div>
            <div className="warrior-card rounded-xl p-8">
              <h3 className="text-lg font-black uppercase tracking-wider text-[#c9a84c] mb-4">What to Expect</h3>
              <ul className="spear-list space-y-2 text-gray-300 list-none">
                <li>Fielding evaluation</li>
                <li>Hitting assessment</li>
                <li>Throwing/arm strength</li>
                <li>Baserunning speed</li>
                <li>Coachability & attitude</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* TRIBAL DIVIDER */}
      <div className="tribal-divider" />

      {/* SIGNUP FORM */}
      <section id="signup" className="py-24 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[#8b1a2e] text-sm font-bold uppercase tracking-[0.3em] mb-3">Monday Tryouts</p>
            <h2 className="text-4xl md:text-5xl font-black uppercase tracking-wide text-white mb-4"
              style={{ fontFamily: "Impact, Arial Black, sans-serif" }}>
              Register Now
            </h2>
            <div className="tribal-divider max-w-xs mx-auto mt-4 mb-6" />
            <p className="text-gray-400">Fill out the form below to secure your spot. Spots are limited.</p>
          </div>

          {status === "success" ? (
            <div className="warrior-card rounded-xl p-12 text-center">
              <div className="text-6xl mb-6">⚔</div>
              <h3 className="text-3xl font-black uppercase tracking-wider text-white mb-3"
                style={{ fontFamily: "Impact, Arial Black, sans-serif" }}>
                You&apos;re Registered!
              </h3>
              <p className="text-gray-400 text-lg">
                We&apos;ll be in touch with tryout details. Get ready — the Warriors are waiting.
              </p>
              <button
                onClick={() => setStatus("idle")}
                className="mt-8 btn-warrior px-8 py-3 rounded-lg text-white font-bold uppercase tracking-widest text-sm"
              >
                Register Another Player
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="warrior-card rounded-xl p-8 space-y-5">
              {/* Player Info */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#c9a84c] mb-2">
                  Player Name *
                </label>
                <input
                  type="text"
                  name="playerName"
                  value={form.playerName}
                  onChange={handleChange}
                  required
                  placeholder="First Last"
                  className="warrior-input w-full px-4 py-3 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#c9a84c] mb-2">
                    Player Age *
                  </label>
                  <select
                    name="age"
                    value={form.age}
                    onChange={handleChange}
                    required
                    className="warrior-input w-full px-4 py-3 rounded-lg text-sm"
                  >
                    <option value="">Select age</option>
                    {[6, 7, 8, 9, 10, 11, 12, 13, 14].map((a) => (
                      <option key={a} value={a}>{a} years old</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#c9a84c] mb-2">
                    Primary Position
                  </label>
                  <select
                    name="position"
                    value={form.position}
                    onChange={handleChange}
                    className="warrior-input w-full px-4 py-3 rounded-lg text-sm"
                  >
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
                <label className="block text-xs font-bold uppercase tracking-widest text-[#c9a84c] mb-2">
                  Years of Experience
                </label>
                <select
                  name="experience"
                  value={form.experience}
                  onChange={handleChange}
                  className="warrior-input w-full px-4 py-3 rounded-lg text-sm"
                >
                  <option value="">Select experience</option>
                  <option value="First year">First year</option>
                  <option value="1-2 years">1–2 years</option>
                  <option value="3-4 years">3–4 years</option>
                  <option value="5+ years">5+ years</option>
                </select>
              </div>

              {/* Parent Info */}
              <div className="tribal-divider" />

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#c9a84c] mb-2">
                  Parent / Guardian Name *
                </label>
                <input
                  type="text"
                  name="parentName"
                  value={form.parentName}
                  onChange={handleChange}
                  required
                  placeholder="First Last"
                  className="warrior-input w-full px-4 py-3 rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#c9a84c] mb-2">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    required
                    placeholder="(555) 000-0000"
                    className="warrior-input w-full px-4 py-3 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#c9a84c] mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={form.email}
                    onChange={handleChange}
                    required
                    placeholder="email@example.com"
                    className="warrior-input w-full px-4 py-3 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#c9a84c] mb-2">
                  Anything else we should know?
                </label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Previous team, special skills, questions..."
                  className="warrior-input w-full px-4 py-3 rounded-lg text-sm resize-none"
                />
              </div>

              {status === "error" && (
                <div className="rounded-lg px-4 py-3 text-sm text-red-300 bg-red-900/20 border border-red-800/40">
                  {errorMsg || "Something went wrong. Please try again."}
                </div>
              )}

              <button
                type="submit"
                disabled={status === "loading"}
                className="btn-warrior w-full py-4 rounded-lg text-white font-black uppercase tracking-widest text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ fontFamily: "Impact, Arial Black, sans-serif" }}
              >
                {status === "loading" ? "Submitting..." : "⚔ Secure My Spot"}
              </button>

              <p className="text-center text-xs text-gray-600">
                Your info is only shared with the Warriors coaching staff.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 px-6 text-center" style={{ borderTop: "1px solid rgba(139,26,46,0.2)" }}>
        <Image src="/images/warriors/mascot.png" alt="Warriors" width={80} height={80} className="object-contain h-16 w-auto mx-auto mb-4 opacity-60" />
        <p className="text-gray-600 text-sm uppercase tracking-widest">
          East Cherokee Warriors Baseball · {new Date().getFullYear()}
        </p>
        <p className="text-gray-700 text-xs mt-2">
          Built with warrior spirit. Questions? Contact your coaching staff.
        </p>
      </footer>
    </main>
  );
}
