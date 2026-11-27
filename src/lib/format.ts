import type { OrderStatus, PackageCategory, PaymentMethod } from "./domain/types";
import { ORDER_STATUS_LABELS } from "./domain/state-machine";
import { calculateMinDpIdr, formatRupiah } from "./domain/validators";

export const formatIdr = formatRupiah;
export const formatMinDp = calculateMinDpIdr;

const STATUS_STYLE: Record<
  OrderStatus,
  { bg: string; fg: string; border: string; desc: string }
> = {
  MENUNGGU_DP: {
    bg: "bg-[#FEF3C7]",
    fg: "text-[#B45309]",
    border: "border-[#FDE68A]",
    desc: "Slot terpesan; butuh DP minimal sebelum masuk daftar masak.",
  },
  TERJADWAL: {
    bg: "bg-[#DBEAFE]",
    fg: "text-[#1D4ED8]",
    border: "border-[#BFDBFE]",
    desc: "DP terpenuhi; otomatis masuk daftar belanja bahan dapur.",
  },
  DIPRODUKSI: {
    bg: "bg-[#FFEDD5]",
    fg: "text-[#C2410C]",
    border: "border-[#FED7AA]",
    desc: "Pesanan sedang dimasak oleh tim dapur.",
  },
  SIAP_KIRIM: {
    bg: "bg-[#CCFBF1]",
    fg: "text-[#0F766E]",
    border: "border-[#99F6E4]",
    desc: "Selesai dikemas; menunggu pelunasan 100% sebelum serah terima.",
  },
  SELESAI_DIKIRIM: {
    bg: "bg-[#D1FAE5]",
    fg: "text-[#047857]",
    border: "border-[#A7F3D0]",
    desc: "Lunas penuh dan sudah diterima pemesan.",
  },
  DIBATALKAN: {
    bg: "bg-[#FEE2E2]",
    fg: "text-[#B91C1C]",
    border: "border-[#FECACA]",
    desc: "Pre-order dibatalkan dan kuota box dikembalikan.",
  },
};

export const STATUS_META: Record<
  OrderStatus,
  { label: string; bg: string; fg: string; border: string; desc: string }
> = {
  MENUNGGU_DP: { label: ORDER_STATUS_LABELS.MENUNGGU_DP, ...STATUS_STYLE.MENUNGGU_DP },
  TERJADWAL: { label: ORDER_STATUS_LABELS.TERJADWAL, ...STATUS_STYLE.TERJADWAL },
  DIPRODUKSI: { label: ORDER_STATUS_LABELS.DIPRODUKSI, ...STATUS_STYLE.DIPRODUKSI },
  SIAP_KIRIM: { label: ORDER_STATUS_LABELS.SIAP_KIRIM, ...STATUS_STYLE.SIAP_KIRIM },
  SELESAI_DIKIRIM: { label: ORDER_STATUS_LABELS.SELESAI_DIKIRIM, ...STATUS_STYLE.SELESAI_DIKIRIM },
  DIBATALKAN: { label: ORDER_STATUS_LABELS.DIBATALKAN, ...STATUS_STYLE.DIBATALKAN },
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
