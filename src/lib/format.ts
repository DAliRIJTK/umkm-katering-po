import type { OrderStatus, PackageCategory, PaymentMethod } from "./domain/types";

export const STATUS_META: Record<
  OrderStatus,
  { label: string; bg: string; fg: string; border: string; desc: string }
> = {
  MENUNGGU_DP: {
    label: "Menunggu DP",
    bg: "bg-[#FEF3C7]",
    fg: "text-[#B45309]",
    border: "border-[#FDE68A]",
    desc: "Slot terpesan; butuh DP minimal sebelum masuk daftar masak.",
  },
  TERJADWAL: {
    label: "Terjadwal",
    bg: "bg-[#DBEAFE]",
    fg: "text-[#1D4ED8]",
    border: "border-[#BFDBFE]",
    desc: "DP terpenuhi; otomatis masuk daftar belanja bahan dapur.",
  },
  DIPRODUKSI: {
    label: "Diproduksi",
    bg: "bg-[#FFEDD5]",
    fg: "text-[#C2410C]",
    border: "border-[#FED7AA]",
    desc: "Pesanan sedang dimasak oleh tim dapur.",
  },
  SIAP_KIRIM: {
    label: "Siap Kirim",
    bg: "bg-[#CCFBF1]",
    fg: "text-[#0F766E]",
    border: "border-[#99F6E4]",
    desc: "Selesai dikemas; menunggu pelunasan 100% sebelum serah terima.",
  },
  SELESAI_DIKIRIM: {
    label: "Selesai Dikirim",
    bg: "bg-[#D1FAE5]",
    fg: "text-[#047857]",
    border: "border-[#A7F3D0]",
    desc: "Lunas penuh dan sudah diterima pemesan.",
  },
  DIBATALKAN: {
    label: "Dibatalkan",
    bg: "bg-[#FEE2E2]",
    fg: "text-[#B91C1C]",
    border: "border-[#FECACA]",
    desc: "Pre-order dibatalkan dan kuota box dikembalikan.",
  },
};

export const CATEGORY_LABELS: Record<PackageCategory, string> = {
  NASI_KOTAK: "Nasi Kotak",
  SNACK_BOX: "Snack Box",
  TUMPENG_PRASMANAN: "Bento & Syukuran",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  TUNAI: "Tunai",
  QRIS: "QRIS",
  TRANSFER: "Transfer Bank",
};

export function formatIdr(amount: number): string {
  const rounded = Math.trunc(amount);
  const abs = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return rounded < 0 ? `-Rp ${abs}` : `Rp ${abs}`;
}

export function formatMinDp(totalIdr: number, minDpPercent: number): number {
  if (totalIdr <= 0 || minDpPercent <= 0) return 0;
  return Math.floor((totalIdr * minDpPercent + 99) / 100);
}
