import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PRAVAAH — National Dam Break & Flood Intelligence System",
  description:
    "Predict · Simulate · Prepare · Protect. Dam-break and lake-outburst floods on a real DEM: a 2D shallow-water solver draped on 3D satellite terrain, with impact, evacuation and basin-routing analytics.",
};

export const viewport: Viewport = {
  themeColor: "#0A0C0E",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
