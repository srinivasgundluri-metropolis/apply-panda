import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { APP_LOGO_PATH } from "@/lib/app-logo";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ApplyPanda",
  description:
    "AI-powered job search command center: evaluate offers, generate tailored CVs, scan portals, and track applications.",
  openGraph: {
    title: "ApplyPanda",
    description:
      "AI-powered job search command center: evaluate offers, generate tailored CVs, scan portals, and track applications.",
    images: [{ url: APP_LOGO_PATH }],
  },
  twitter: {
    card: "summary",
    images: [APP_LOGO_PATH],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // The `dark` class is added by next-themes after hydration; we
      // pre-apply `suppressHydrationWarning` so React doesn't yell about
      // the resulting className mismatch on first paint.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Order matters: JPEG must appear before Next’s injected favicon.ico.
          Middleware also rewrites /favicon.ico → the same JPEG for clients that insist on .ico.
        */}
        <link rel="icon" href={APP_LOGO_PATH} type="image/jpeg" sizes="512x512" />
        <link rel="apple-touch-icon" href={APP_LOGO_PATH} />
      </head>
      <body className="min-h-full">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors position="top-right" />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
