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
  appleWebApp: {
    capable: true,
    title: "InningWise",
    statusBarStyle: "black-translucent",
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
