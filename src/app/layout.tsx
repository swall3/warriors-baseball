import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const viewport: Viewport = {
  themeColor: "#1b4d3e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || "warriors-baseball-omega.vercel.app"}`),
  applicationName: "InningWise",
  title: "InningWise",
  description:
    "Smarter players. Stronger teams. Baseball training, team management, live scoring and player development.",
  manifest: "/manifest.json",
  // statusBarStyle is "default", NOT "black-translucent", on purpose.
  //
  // "black-translucent" makes iOS render the installed PWA *underneath* the
  // status bar, so the clock and battery sit on top of whatever the page draws
  // at y=0 — on the coach surface that is the `.nf-entry` bar, whose links then
  // compete with the status bar for taps. Recovering from that requires every
  // top-level surface to pad itself by env(safe-area-inset-top), and only
  // `.dugout-theme` ever did (coach.css, and only under
  // `@media (display-mode: standalone)`), which left the public site, /games
  // and every other route unprotected.
  //
  // "default" makes iOS reserve the status bar area instead, so content starts
  // below it on every route with no per-surface CSS to keep in sync. The
  // viewport keeps viewportFit:"cover" so the side and bottom insets (notch in
  // landscape, home indicator) are still ours to handle in CSS.
  appleWebApp: {
    capable: true,
    title: "InningWise",
    statusBarStyle: "default",
  },
  icons: {
    apple: [
      { url: "/inningwise-apple.png", sizes: "180x180", type: "image/png" },
    ],
    icon: "/inningwise.svg",
  },
  openGraph: {
    title: "InningWise",
    description: "Smarter players. Stronger teams.",
    images: [{ url: "/inningwise-social.png", width: 1200, height: 630, alt: "InningWise — Smarter players. Stronger teams." }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
