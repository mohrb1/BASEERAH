import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexSansArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-plex-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "بصيرة | BASEERAH",
  description:
    "لا تكتفِ بالإجابة، اعرف مصدرها. بصيرة تحلّل المحتوى الإسلامي، تستخرج ادعاءاته، وتتبّع كل ادعاء إلى دليله ومصدره.",
  icons: {
    icon: [
      { url: "/icon-light-32x32.png", media: "(prefers-color-scheme: light)" },
      { url: "/icon-dark-32x32.png", media: "(prefers-color-scheme: dark)" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${plexSans.variable} ${plexSansArabic.variable} h-full antialiased`}
    >
      <body className="font-arabic flex min-h-full flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
