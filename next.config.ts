import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import createNextIntlPlugin from "next-intl/plugin";

const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data:",
  "connect-src 'self' https: ws: wss:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://www.youtube.com https://player.vimeo.com",
  "frame-ancestors 'self'",
  "form-action 'self' https://checkout.wompi.co https://www.mercadopago.com.co",
  "base-uri 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Carpeta de compilación configurable: permite un servidor de desarrollo paralelo sin pisar el build de producción.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ["@react-pdf/renderer", "pg-boss", "@node-rs/argon2", "exceljs", "web-push", "nodemailer", "pg"],
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
  images: { remotePatterns: [] },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: isDev && process.env.SW_DEV !== "1",
  cacheOnNavigation: true,
  reloadOnOnline: false,
});

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(withSerwist(nextConfig));
