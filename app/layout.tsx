import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "MiConjunto", template: "%s · MiConjunto" },
  description: "Administración de propiedad horizontal: cartera, portería, reservas, PQRS, asambleas y más.",
  applicationName: "MiConjunto",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MiConjunto", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f766e" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const messages = await getMessages();
  return (
    <html lang="es-CO" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-dvh font-sans antialiased">
        <NextIntlClientProvider messages={messages} locale="es-CO" timeZone="America/Bogota">
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
