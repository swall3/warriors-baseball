import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Warriors Baseball — East Cherokee",
  description: "East Cherokee Warriors — Elite 8U Travel Baseball",
  openGraph: {
    title: "East Cherokee Warriors Baseball",
    description: "Join the Warriors. Elite 8U travel ball. Tryouts now open.",
    images: ["/images/warriors/logo.jpg"],
  },
  manifest: "/manifest.json",
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
