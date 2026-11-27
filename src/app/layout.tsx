import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DapurRantang — Katering Nasi Kotak, Snack Box & Kontrol Dapur UMKM",
  description:
    "Katalog paket katering, kalkulator estimasi pre-order, lacak status produksi, kontrol kuota harian dapur, dan daftar belanja bahan BOM otomatis.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-[#FFF7ED] text-[#0F172A] antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-[#C2410C] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
        >
          Langsung ke konten utama
        </a>
        {children}
      </body>
    </html>
  );
}
