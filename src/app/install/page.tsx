import type { Metadata } from "next";
import Link from "next/link";
import InstallPrompt from "@/components/InstallPrompt";
import "./install.css";

export const metadata: Metadata = {
  title: "Install InningWise",
  description: "Add InningWise to your phone or computer for quick access to your team and games.",
};

export default function InstallPage() {
  return <main className="iw-install">
    <header className="iw-install-nav">
      <Link href="/" className="iw-install-brand">InningWise <span>◆</span></Link>
      <Link href="/account">Your account</Link>
    </header>
    <div className="iw-install-content">
      <p className="iw-install-kicker">INNINGWISE ON YOUR DEVICE</p>
      <h1>Keep the team one tap away.</h1>
      <p className="iw-install-lead">Add InningWise to your home screen. It opens like an app, with no app-store download.</p>
      <InstallPrompt />
      <nav className="iw-install-roles" aria-label="Choose your guide">
        <a href="#parents">I’m a parent or player <span aria-hidden="true">→</span></a>
        <a href="#coaches">I’m a coach or manager <span aria-hidden="true">→</span></a>
      </nav>

      <section id="parents" className="iw-install-panel">
        <p className="iw-install-kicker">PARENTS &amp; PLAYERS</p>
        <h2>Start with your account.</h2>
        <p>Open the team join link your coach shared, verify your email, and request access for each child. Once approved, your family view shows their games and assigned practice.</p>
        <Link href="/account">Open your account →</Link>
        <p className="iw-install-note">Install from this page or your family view to keep the general InningWise app on your home screen.</p>
      </section>

      <section id="coaches" className="iw-install-panel">
        <p className="iw-install-kicker">COACHES &amp; MANAGERS</p>
        <h2>Install from your coach workspace.</h2>
        <p>Sign in, open Today, then use the Install button below the game-day steps if it appears. That gives your home-screen app the coach launch point. You can also use your browser’s install menu while on Today.</p>
        <Link href="/coach/today">Open coach Today →</Link>
      </section>

      <section className="iw-install-panel" aria-labelledby="device-steps">
        <p className="iw-install-kicker">BY DEVICE</p>
        <h2 id="device-steps">How to add it</h2>
        <div className="iw-install-steps">
          <div><h3>iPhone or iPad · Safari</h3><ol><li>Open InningWise in Safari.</li><li>Tap Share (sometimes under the page menu).</li><li>Tap <strong>Add to Home Screen</strong>, choose <strong>Open as Web App</strong> if shown, then tap Add.</li></ol></div>
          <div><h3>Android · Chrome</h3><ol><li>Open InningWise in Chrome.</li><li>Tap the three-dot menu.</li><li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong> and confirm.</li></ol></div>
          <div><h3>Computer · Chrome or Edge</h3><ol><li>Open InningWise in your browser.</li><li>Use the install icon in the address bar or the browser menu.</li><li>Confirm the install.</li></ol></div>
        </div>
      </section>

      <section className="iw-install-panel" aria-labelledby="install-faq">
        <p className="iw-install-kicker">QUICK ANSWERS</p>
        <h2 id="install-faq">Install FAQ</h2>
        <details><summary>Do I need the App Store or Play Store?</summary><p>No. Your browser adds InningWise directly to your home screen.</p></details>
        <details><summary>Will installing create an account?</summary><p>No. Use your email to sign in, and ask your coach for a team join link if you need access.</p></details>
        <details><summary>Does it work without internet?</summary><p>Keep an internet connection for sign-in, current team information, and live game updates. Installing does not make those features available offline.</p></details>
        <details><summary>I don’t see an Install button. What should I do?</summary><p>Use your browser’s menu and the steps above. On iPhone or iPad, open the site in Safari instead of an in-app browser.</p></details>
      </section>
      <footer><Link href="/">InningWise home</Link><Link href="/account">Account</Link><Link href="/coach/today">Coach workspace</Link></footer>
    </div>
  </main>;
}
