import { ConflictError } from "./errors";
import { calculateMinDpIdr, formatRupiah } from "./validators";
import type { OrderStatus } from "./types";

export const ALL_ORDER_STATUSES: readonly OrderStatus[] = [
  "MENUNGGU_DP",
  "TERJADWAL",
  "DIPRODUKSI",
  "SIAP_KIRIM",
  "SELESAI_DIKIRIM",
  "DIBATALKAN",
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  MENUNGGU_DP: "Menunggu DP",
  TERJADWAL: "Terjadwal",
  DIPRODUKSI: "Diproduksi",
  SIAP_KIRIM: "Siap Kirim",
  SELESAI_DIKIRIM: "Selesai Dikirim",
  DIBATALKAN: "Dibatalkan",
};

export const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  MENUNGGU_DP: ["TERJADWAL", "DIBATALKAN"],
  TERJADWAL: ["DIPRODUKSI", "DIBATALKAN"],
  DIPRODUKSI: ["SIAP_KIRIM", "DIBATALKAN"],
  SIAP_KIRIM: ["SELESAI_DIKIRIM", "DIBATALKAN"],
  SELESAI_DIKIRIM: [],
  DIBATALKAN: [],
};

export const PRODUCTION_BOM_STATUSES: readonly OrderStatus[] = [
  "TERJADWAL",
  "DIPRODUKSI",
  "SIAP_KIRIM",
];

export interface TransitionCheckInput {
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  totalIdr: number;
  paidIdr: number;
  minDpPercent: number;
  itemCount: number;
}

export function assertTransitionAllowed(input: TransitionCheckInput): void {
  const { fromStatus, toStatus, totalIdr, paidIdr, minDpPercent, itemCount } = input;
  const allowed = ALLOWED_TRANSITIONS[fromStatus] ?? [];
  if (!allowed.includes(toStatus)) {
    throw new ConflictError(
      `Transisi status dari ${fromStatus} ke ${toStatus} tidak diizinkan.`
    );
  }

  if (toStatus === "DIBATALKAN") {
    return;
  }

  if (itemCount <= 0) {
    throw new ConflictError("Pre-order wajib memiliki minimal 1 item paket.");
  }

  const minDpIdr = calculateMinDpIdr(totalIdr, minDpPercent);
  if (toStatus === "TERJADWAL" && paidIdr < minDpIdr) {
    throw new ConflictError(
      `DP belum memenuhi syarat minimal ${minDpPercent}% (${formatRupiah(minDpIdr)}). Terbayar baru ${formatRupiah(paidIdr)}.`
    );
  }

  if (toStatus === "SELESAI_DIKIRIM" && paidIdr < totalIdr) {
    const remaining = totalIdr - paidIdr;
    throw new ConflictError(
      `Pelunasan belum selesai. Sisa tagihan ${formatRupiah(remaining)} wajib dibayar sebelum serah terima.`
    );
  }
}
