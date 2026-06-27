import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flash — Meeting Canvas",
  description: "Your meeting's memory, as a living canvas.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
