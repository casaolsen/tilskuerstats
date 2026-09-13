import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tilskuerstats Norden",
  description: "Tilskuertal for fodbold i Danmark, Sverige og Norge",
};

const COUNTRIES = [
  { code: "dk", label: "Danmark" },
  { code: "se", label: "Sverige" },
  { code: "no", label: "Norge" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="da"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b" style={{ borderColor: "var(--border)" }}>
          <div className="mx-auto max-w-5xl flex items-center justify-between px-4 py-4">
            <Link href="/" className="font-semibold tracking-tight text-lg">
              Tilskuerstats <span style={{ color: "var(--text-muted)" }}>Norden</span>
            </Link>
            <nav className="flex gap-5 text-sm">
              {COUNTRIES.map((c) => (
                <Link
                  key={c.code}
                  href={`/${c.code}`}
                  className="hover:underline"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {c.label}
                </Link>
              ))}
              <Link href="/admin" className="hover:underline" style={{ color: "var(--text-muted)" }}>
                Admin
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1 mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
        <footer
          className="border-t text-xs px-4 py-6 text-center"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
        >
          Demo-data pr. nu — se README for status på live datakilder.
        </footer>
      </body>
    </html>
  );
}
