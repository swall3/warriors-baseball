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
  title: "Ninety Feet",
  description:
    "Baseball training, team management, live scoring and player development.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Ninety Feet",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: [
      { url: "/ninety-feet.svg", sizes: "180x180", type: "image/svg+xml" },
    ],
    icon: "/ninety-feet.svg",
  },
  openGraph: {
    title: "Ninety Feet",
    description: "Build better players and a stronger team.",
    images: ["/ninety-feet.svg"],
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
