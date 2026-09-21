import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { assets, club, colors } from "@/lib/brand-config";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const viewport: Viewport = {
  themeColor: colors.navy,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: `${club.shortName} Baseball — ${club.region}`,
  description: `${club.name} — Elite Travel Baseball`,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: `${club.shortName} ⚾`,
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: [{ url: assets.logo, sizes: "180x180", type: "image/png" }],
    icon: assets.logo,
  },
  openGraph: {
    title: `${club.name} Baseball`,
    description: `Join the ${club.shortName}. Elite travel ball. Tryouts now open.`,
    images: [assets.logoJpg],
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
