/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Allow Supabase, Vapi, Cal.com, and Resend CDN. Vapi's web
              // SDK proxies the actual WebRTC call through Daily.co
              // (c.daily.co + per-room *.daily.co signaling/SFU hosts) —
              // without these the browser silently blocks the call with
              // no error surfaced to the Vapi SDK itself, just a CSP
              // violation in the console.
              "connect-src 'self' https://*.supabase.co https://api.vapi.ai wss://api.vapi.ai https://*.daily.co wss://*.daily.co https://api.resend.com https://cal.com https://*.cal.com",
              // Allow Vapi WebRTC peer connections
              "media-src 'self' blob: mediastream:",
              // Allow Next.js inline scripts + Framer Motion
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              // Allow Next.js image optimization
              "img-src 'self' data: blob: https:",
              "frame-src 'self' https://cal.com",
              "worker-src 'self' blob:",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
