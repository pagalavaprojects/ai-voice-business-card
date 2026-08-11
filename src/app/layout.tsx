import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ErrorBoundary } from "@/shared/ui/error-boundary";
import { ToastProvider } from "@/shared/ui/toast";
import { buildWebsiteJsonLd, serializeJsonLd } from "@/shared/lib/cardMetadata";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://maylaanai.com").replace(/\/$/, "");

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "AI Voice Business Card & Enterprise AI Employee SaaS Platform",
    template: "%s | Maylaan AI",
  },
  description:
    "Enterprise AI Voice Business Card platform empowering digital employee twins for natural voice conversations, lead qualification, and automated meeting booking.",
  keywords: ["AI Voice", "Voice Business Card", "AI Digital Twin", "Vapi", "Lead Qualification", "Enterprise SaaS", "Maylaan", "AI Business Card"],
  authors: [{ name: "Maylaan AI Platform Team", url: appUrl }],
  alternates: {
    canonical: appUrl,
  },
  openGraph: {
    title: "Maylaan AI Voice Business Card — Enterprise AI Employee Platform",
    description: "Connect with digital employee twins via natural WebRTC AI voice streaming. Qualify leads, book meetings, and grow your pipeline 24/7.",
    url: appUrl,
    siteName: "Maylaan AI",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: `${appUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "Maylaan AI Voice Business Card Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Maylaan AI Voice Business Card — Enterprise AI Employee Platform",
    description: "Connect with digital employee twins via natural WebRTC AI voice streaming.",
    images: [`${appUrl}/og-image.png`],
    creator: "@maylaanai",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};


export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0e15" },
    { media: "(prefers-color-scheme: light)", color: "#0b0e15" },
  ],
  width: "device-width",
  initialScale: 1,
  // Prevent iOS Safari from auto-zooming into form inputs (which changes
  // the viewport scale in a way that breaks the fixed voice mic layout).
  maximumScale: 5,
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const websiteJsonLd = buildWebsiteJsonLd(appUrl);

  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd) }}
        />
      </head>
      <body className="antialiased bg-[#0b0e15] text-slate-100 min-h-screen">
        {/* Skip-to-content link — keyboard and screen reader users can jump
            directly to the main content without tabbing through nav items.
            Visually hidden until focused (WCAG SC 2.4.1). */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:z-[9999] focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-sky-500 focus:text-white focus:rounded-lg focus:font-semibold focus:text-sm focus:shadow-lg"
        >
          Skip to main content
        </a>
        <ToastProvider>
          <ErrorBoundary>{children}</ErrorBoundary>
        </ToastProvider>
      </body>
    </html>
  );
}

