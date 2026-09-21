import Link from "next/link";
import "./app-home.css";
export default function AppHome() {
  return (
    <main className="nf-home">
      <header className="nf-home-nav">
        <Link href="/" aria-label="Ninety Feet home">
          NINETY FEET<span>◆</span>
        </Link>
        <span>BASEBALL. TOGETHER.</span>
      </header>
      <div className="nf-home-content">
        <p className="nf-home-eyebrow">FROM THE FIRST REP TO THE FINAL OUT</p>
        <h1>
          Better players.
          <br />A stronger team.
        </h1>
        <p className="nf-home-lead">
          One place to learn the game, run your dugout, and see what comes next.
        </p>
        <section className="nf-home-paths" aria-label="Choose your workspace">
          <Link href="/games" className="nf-home-card nf-home-training">
            <span className="nf-home-number">01 / FOR PLAYERS</span>
            <h2>Get your reps in.</h2>
            <p>
              Read the field, learn your position, and build baseball confidence
              with quick, interactive games.
            </p>
            <span className="nf-home-cta">
              Start training <b aria-hidden="true">→</b>
            </span>
            <span className="nf-home-tags">
              Daily plays · Rules · Position practice
            </span>
          </Link>
          <Link href="/coach/today" className="nf-home-card">
            <span className="nf-home-number">02 / FOR COACHES &amp; TEAMS</span>
            <h2>Bring the team together.</h2>
            <p>
              Set the lineup, share game-day scoring, track pitches, and turn
              team insights into the next practice.
            </p>
            <span className="nf-home-cta">
              Open coach workspace <b aria-hidden="true">→</b>
            </span>
            <span className="nf-home-tags">
              Lineups · Live games · Player development
            </span>
          </Link>
        </section>
        <footer>
          On your phone. In the dugout. Wherever the game takes you.
        </footer>
      </div>
    </main>
  );
}
