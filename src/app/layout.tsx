import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Warriors Baseball",
  description: "East Cherokee Warriors — Elite Youth Baseball",
  openGraph: {
    title: "Warriors Baseball",
    description: "Join the Warriors. Try out Monday.",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
