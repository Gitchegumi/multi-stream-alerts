import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GitcheGumi Alerts",
  description: "Self-hosted stream alerts and overlays"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
