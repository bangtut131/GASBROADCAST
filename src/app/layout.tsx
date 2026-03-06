import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "WA Broadcast — WhatsApp Marketing Platform",
  description: "Platform WhatsApp Broadcast & Marketing terlengkap. Kirim pesan massal, auto-reply cerdas, dan kelola kontak dengan mudah.",
  keywords: "whatsapp broadcast, wa blast, whatsapp marketing, whatsapp api, auto reply",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
