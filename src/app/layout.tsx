import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const viewport: Viewport = {
  themeColor: "#0f2044",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Warriors Baseball — East Cherokee",
  description: "East Cherokee Warriors — Elite Travel Baseball",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Warriors ⚾",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: [
      { url: "/images/warriors/logo.png", sizes: "180x180", type: "image/png" },
    ],
    icon: "/images/warriors/logo.png",
  },
  openGraph: {
    title: "East Cherokee Warriors Baseball",
    description: "Join the Warriors. Elite travel ball. Tryouts now open.",
    images: ["/images/warriors/logo.jpg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
