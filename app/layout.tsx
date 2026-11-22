import type { Metadata, Viewport } from "next";
import { LangProvider } from "@/components/LangProvider";
import "./globals.css";

const brand = process.env.NEXT_PUBLIC_BRAND_NAME || "GuestBill";

export const metadata: Metadata = {
  title: `${brand} · Invoice automation + voice agent`,
  description: "Facturación hotelera automática (datos fiscales, VCC, rectificativas, PMS) con un agente de voz IA monitorizado.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f3d3a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
