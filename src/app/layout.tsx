import type { Metadata, Viewport } from "next";
import { ErrorBoundary } from "@/shared/ui/error-boundary";
import { ToastProvider } from "@/shared/ui/toast";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "AI Voice Business Card & Enterprise AI Employee SaaS Platform",
    template: "%s | AI Voice Business Card",
  },
  description:
    "Enterprise AI Voice Business Card platform empowering digital employee twins for natural voice conversations, lead qualification, and automated meeting booking.",
  keywords: ["AI Voice", "Voice Business Card", "AI Digital Twin", "Vapi", "Lead Qualification", "Enterprise SaaS"],
  authors: [{ name: "AI Voice SaaS Platform Team" }],
  openGraph: {
    title: "AI Voice Business Card & Enterprise AI Employee Platform",
    description: "Connect with digital employee twins via natural WebRTC AI voice streaming.",
    url: appUrl,
    siteName: "AI Voice Business Card Platform",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Voice Business Card & Enterprise AI Employee Platform",
    description: "Connect with digital employee twins via natural WebRTC AI voice streaming.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#090d16",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#090d16] text-slate-100 min-h-screen">
        <ToastProvider>
          <ErrorBoundary>{children}</ErrorBoundary>
        </ToastProvider>
      </body>
    </html>
  );
}

