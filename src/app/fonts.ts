import { Inter, Space_Grotesk } from "next/font/google";

// Self-hosted at build time; latin-ext carries Turkish ş, ğ, ı and İ.
export const bodyFont = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-body",
});

export const displayFont = Space_Grotesk({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-display",
});
