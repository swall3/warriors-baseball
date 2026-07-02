"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

const TRYOUTS_OPEN    = false; // flip to true when next season opens
const COACH_EMAIL     = "warriors8u@gmail.com";
const COACH_PHONE     = "(678) 555-0000";

export default function HomePage() {
  const [form, setForm] = useState({
    playerName: "", age: "", parentName: "", phone: "",
    email: "", position: "", experience: "", notes: "",
  });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));

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
      if (!res.ok) throw new Error((await res.json()).error || "Something went wrong");
      setStatus("success");
      setForm({ playerName: "", age: "", parentName: "", phone: "", email: "", position: "", experience: "", notes: "" });
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Submission failed");
    }
  };

  return (
    <div className="bg-white text-gray-900">

      {/* NAV */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? "bg-[#0f2044] shadow-lg py-3" : "bg-transparent py-5"}`}>
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/images/warriors/mascot.png" alt="" width={38} height={38} className="object-contain" />
            <span className="font-display text-white text-xl tracking-wide">WARRIORS</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="#about"   className="hidden md:block text-white/70 hover:text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-white/10 transition-colors">Program</a>
            <a href="#tryouts" className="hidden md:block text-white/70 hover:text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-white/10 transition-colors">Tryouts</a>
            <a href="#signup"  className="bg-[#8b1a2e] hover:bg-[#a82037] text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors ml-2">Sign Up</a>
          </div>
        </div>
      </nav>

      {/* HERO — stadium photo, mascot right, text left */}
      <section className="relative min-h-screen flex items-center bg-[#0f2044] overflow-hidden">
        <Image src="/images/hero-bg.jpg" alt="" fill priority className="object-cover object-center opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0f2044]/95 via-[#0f2044]/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f2044]/80 via-transparent to-[#0f2044]/30" />

        {/* Mascot — large, right side, bleeds off bottom */}
        <div className="hidden lg:block absolute right-0 bottom-0 w-[520px] h-[640px] pointer-events-none">
          <Image src="/images/warriors/mascot.png" alt="" fill priority className="object-contain object-bottom" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-6 pt-32 pb-20 w-full">
          <p className="inline-block bg-[#8b1a2e] text-white text-[11px] font-bold uppercase tracking-[0.2em] px-4 py-1.5 rounded-full mb-6">
            Tryouts Open · Limited Roster
          </p>
          <h1 className="font-display text-white mb-4">
            <span className="block text-[#c9a84c] text-3xl mb-1">EAST CHEROKEE</span>
            <span className="block text-8xl xl:text-9xl leading-none">WARRIORS</span>
          </h1>
          <p className="text-white/65 text-lg max-w-md mb-8 leading-relaxed">
            8U Travel Baseball. Built on discipline, grit, and the warrior spirit.
          </p>
          <div className="flex flex-wrap gap-3">
            {TRYOUTS_OPEN ? (
              <>
                <a href="#signup"
                  className="bg-[#8b1a2e] hover:bg-[#a82037] text-white font-bold text-sm uppercase tracking-widest px-8 py-4 rounded-xl transition-colors"
                  style={{ boxShadow: "0 8px 24px -4px rgba(139,26,46,0.6)" }}>
                  Register for Tryouts →
                </a>
                <a href="#tryouts"
                  className="border border-white/30 hover:border-white/60 text-white font-semibold text-sm px-8 py-4 rounded-xl transition-colors">
                  Tryout Details
                </a>
              </>
            ) : (
              <a href={`mailto:${COACH_EMAIL}`}
                className="bg-[#8b1a2e] hover:bg-[#a82037] text-white font-bold text-sm uppercase tracking-widest px-8 py-4 rounded-xl transition-colors"
                style={{ boxShadow: "0 8px 24px -4px rgba(139,26,46,0.6)" }}>
                Contact Coaching Staff →
              </a>
            )}
          </div>
          <div className="flex items-center gap-4 mt-10 text-white/40 text-xs font-bold uppercase tracking-widest">
            <span>8U</span><span>·</span><span>Travel Ball</span><span>·</span><span>Canton, GA</span><span>·</span><span>2026</span>
          </div>
        </div>
      </section>

      {/* PROGRAM — white, photos + text */}
      <section id="about" className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <p className="text-[#8b1a2e] text-xs font-bold uppercase tracking-[0.3em] mb-2">Who We Are</p>
            <h2 className="font-display text-5xl text-[#0f2044]">THE WARRIOR WAY</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Photo card */}
            <div className="relative rounded-2xl overflow-hidden aspect-[4/3]">
              <Image src="/images/action-hero.jpg" alt="Elite Training" fill className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f2044]/80 to-transparent" />
              <div className="absolute bottom-0 left-0 p-5">
                <p className="text-[#c9a84c] text-xs font-bold uppercase tracking-wider mb-1">01</p>
                <h3 className="text-white font-display text-2xl">ELITE TRAINING</h3>
              </div>
            </div>
            <div className="relative rounded-2xl overflow-hidden aspect-[4/3]">
              <Image src="/images/glove-dirt.jpg" alt="Competitive Play" fill className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f2044]/80 to-transparent" />
              <div className="absolute bottom-0 left-0 p-5">
                <p className="text-[#c9a84c] text-xs font-bold uppercase tracking-wider mb-1">02</p>
                <h3 className="text-white font-display text-2xl">COMPETITIVE PLAY</h3>
              </div>
            </div>
            <div className="relative rounded-2xl overflow-hidden aspect-[4/3]">
              <Image src="/images/hero-bg.jpg" alt="Brotherhood" fill className="object-cover object-center" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0f2044]/80 to-transparent" />
              <div className="absolute bottom-0 left-0 p-5">
                <p className="text-[#c9a84c] text-xs font-bold uppercase tracking-wider mb-1">03</p>
                <h3 className="text-white font-display text-2xl">BROTHERHOOD</h3>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mt-8">
            <p className="text-gray-500 text-[15px] leading-relaxed">Coached by experienced leaders who develop players at every level. We train hard so games feel easy.</p>
            <p className="text-gray-500 text-[15px] leading-relaxed">Tournament baseball against the best teams in the region. We compete at the highest local level.</p>
            <p className="text-gray-500 text-[15px] leading-relaxed">More than a team. We build character, leadership, and bonds that last long after the final out.</p>
          </div>
        </div>
      </section>

      {/* TRYOUTS — light gray, clean */}
      <section id="tryouts" className="py-24 px-6 bg-gray-50 border-t border-gray-100">
        <div className="max-w-6xl mx-auto">
          <div className="mb-12">
            <p className="text-[#8b1a2e] text-xs font-bold uppercase tracking-[0.3em] mb-2">
              {TRYOUTS_OPEN ? "Open Registration" : "2026 Season"}
            </p>
            <h2 className="font-display text-5xl text-[#0f2044]">
              {TRYOUTS_OPEN ? "TRYOUT DETAILS" : "ROSTER SET"}
            </h2>
            <p className="text-gray-500 mt-3 text-base max-w-lg">
              {TRYOUTS_OPEN
                ? "All skill levels welcome — we'll find the right fit for every player who brings the effort."
                : "The 2026 Warriors roster is complete. Reach out to be on the list when 2027 tryouts open."}
            </p>
          </div>

          {TRYOUTS_OPEN ? (
            <>
              {/* Bring / Expect */}
              <div className="grid md:grid-cols-2 gap-6 mb-10">
                <div className="bg-white rounded-2xl border border-gray-200 p-7 shadow-sm">
                  <h3 className="text-[#8b1a2e] text-xs font-bold uppercase tracking-[0.25em] mb-5">What to Bring</h3>
                  <ul className="space-y-3">
                    {["Baseball glove","Athletic cleats (turf or grass)","Batting helmet (if you have one)","Water bottle","Your best attitude"].map(i => (
                      <li key={i} className="flex items-center gap-3 text-gray-600 text-[15px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#8b1a2e] shrink-0" />{i}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 p-7 shadow-sm">
                  <h3 className="text-[#8b1a2e] text-xs font-bold uppercase tracking-[0.25em] mb-5">What to Expect</h3>
                  <ul className="space-y-3">
                    {["Fielding evaluation","Hitting assessment","Throwing / arm strength","Baserunning speed","Coachability & attitude"].map(i => (
                      <li key={i} className="flex items-center gap-3 text-gray-600 text-[15px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#8b1a2e] shrink-0" />{i}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <a href="#signup"
                className="inline-block bg-[#0f2044] hover:bg-[#1a3160] text-white font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-xl transition-colors">
                Register Now →
              </a>
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-lg">
              <p className="text-gray-600 text-[15px] leading-relaxed mb-6">
                Interested in the 2027 season? Email the coaching staff and we&apos;ll add you to the notification list when tryouts open.
              </p>
              <a href={`mailto:${COACH_EMAIL}?subject=2027 Warriors Interest`}
                className="inline-block bg-[#8b1a2e] hover:bg-[#a82037] text-white font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-xl transition-colors">
                Email Coaching Staff →
              </a>
            </div>
          )}
        </div>
      </section>

      {/* SIGNUP — white, centered */}
      <section id="signup" className="py-24 px-6 bg-white border-t border-gray-100">
        <div className="max-w-xl mx-auto">
          {!TRYOUTS_OPEN ? (
            <div className="text-center">
              <p className="text-[#8b1a2e] text-xs font-bold uppercase tracking-[0.3em] mb-2">2026 Season</p>
              <h2 className="font-display text-5xl text-[#0f2044] mb-4">TRYOUTS CLOSED</h2>
              <p className="text-gray-500 text-base mb-8">The Warriors roster is full for 2026. Check back for 2027 tryout announcements.</p>
              <a href={`mailto:${COACH_EMAIL}?subject=2027 Warriors Interest`}
                className="inline-block bg-[#0f2044] hover:bg-[#1a3160] text-white font-bold text-sm uppercase tracking-wider px-8 py-4 rounded-xl transition-colors">
                Get 2027 Notifications →
              </a>
            </div>
          ) : (
            <>
          <div className="mb-10">
            <p className="text-[#8b1a2e] text-xs font-bold uppercase tracking-[0.3em] mb-2">Secure Your Spot</p>
            <h2 className="font-display text-5xl text-[#0f2044]">REGISTER</h2>
            <p className="text-gray-500 mt-3 text-base">Fill out the form below. Roster is limited.</p>
          </div>

          {status === "success" ? (
            <div className="bg-gray-50 rounded-2xl border border-gray-200 p-12 text-center">
              <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-green-50 border border-green-200 flex items-center justify-center text-2xl">✅</div>
              <h3 className="font-display text-3xl text-[#0f2044] mb-2">YOU&apos;RE IN!</h3>
              <p className="text-gray-500 mb-6">We&apos;ll be in touch with details. Get ready — the Warriors are waiting.</p>
              <button onClick={() => setStatus("idle")}
                className="bg-[#0f2044] hover:bg-[#1a3160] text-white font-bold px-6 py-3 rounded-xl text-sm transition-colors">
                Register Another Player
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Player Name *</label>
                <input type="text" name="playerName" value={form.playerName} onChange={handleChange} required placeholder="First Last" className="field" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Age *</label>
                  <select name="age" value={form.age} onChange={handleChange} required className="field">
                    <option value="">Select</option>
                    {[6,7,8,9].map(a => <option key={a} value={a}>{a} years old</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Position</label>
                  <select name="position" value={form.position} onChange={handleChange} className="field">
                    <option value="">Any / Unknown</option>
                    {["Pitcher","Catcher","1B","2B","3B","SS","OF"].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Experience</label>
                <select name="experience" value={form.experience} onChange={handleChange} className="field">
                  <option value="">Select</option>
                  {["First year","1-2 years","3-4 years","5+ years"].map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div className="border-t border-gray-100 pt-2" />
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Parent / Guardian Name *</label>
                <input type="text" name="parentName" value={form.parentName} onChange={handleChange} required placeholder="First Last" className="field" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Phone *</label>
                  <input type="tel" name="phone" value={form.phone} onChange={handleChange} required placeholder="(555) 000-0000" className="field" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Email *</label>
                  <input type="email" name="email" value={form.email} onChange={handleChange} required placeholder="you@email.com" className="field" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">Anything else?</label>
                <textarea name="notes" value={form.notes} onChange={handleChange} rows={3} placeholder="Previous team, questions, etc." className="field" />
              </div>
              {status === "error" && (
                <div className="rounded-xl px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-200">
                  {errorMsg || "Something went wrong. Please try again."}
                </div>
              )}
              <button type="submit" disabled={status === "loading"}
                className="w-full bg-[#8b1a2e] hover:bg-[#a82037] disabled:opacity-50 text-white font-bold text-sm uppercase tracking-wider py-4 rounded-xl transition-colors"
                style={{ boxShadow: "0 8px 24px -4px rgba(139,26,46,0.5)" }}>
                {status === "loading" ? "Submitting…" : "Secure My Spot →"}
              </button>
              <p className="text-center text-xs text-gray-400 pt-1">Your info is only shared with the Warriors coaching staff.</p>
            </form>
          )}
            </>
          )}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#0f2044] py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/images/warriors/mascot.png" alt="" width={36} height={36} className="object-contain opacity-70" />
            <div>
              <p className="text-white font-bold text-sm">East Cherokee Warriors</p>
              <p className="text-white/40 text-xs">8U Travel Baseball · {new Date().getFullYear()}</p>
            </div>
          </div>
          <div className="flex gap-5 text-sm">
            <a href={`mailto:${COACH_EMAIL}`} className="text-[#c9a84c] hover:underline">{COACH_EMAIL}</a>
            <a href={`tel:${COACH_PHONE}`} className="text-white/50 hover:text-white transition-colors">{COACH_PHONE}</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
