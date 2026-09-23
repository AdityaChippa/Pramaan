import type { Metadata, Viewport } from "next";
import { Kanit, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SITE } from "@/config/site";

const kanit = Kanit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  variable: "--font-kanit",
  display: "swap",
});
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  icons: { icon: "/favicon.svg" },
  openGraph: { title: SITE.name, description: SITE.description, type: "website" },
};

export const viewport: Viewport = { themeColor: "#0C0C0C", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${kanit.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-ink text-fog">{children}</body>
    </html>
  );
}
