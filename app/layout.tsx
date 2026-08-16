import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Tsu — Private Temporary Chat Rooms",
  description: "Anonymous, temporary chat rooms. No accounts, no registration, automatic expiration.",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    title: "Tsu — Private Temporary Chat Rooms",
    description: "Anonymous, temporary chat rooms. No accounts, no registration, automatic expiration.",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
      <body className="antialiased min-h-screen bg-[#fafafa] dark:bg-[#0f0f11] text-zinc-900 dark:text-zinc-100 font-sans transition-colors duration-150">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
