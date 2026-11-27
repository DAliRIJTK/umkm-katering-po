import { ValidationError } from "./errors";
import type { OrderStatus } from "./types";

export function normalizePhone(raw: string): string {
  const cleaned = String(raw ?? "").replace(/[\s\-().]/g, "");
  let normalized = cleaned;
  if (normalized.startsWith("+62")) {
    normalized = "0" + normalized.slice(3);
  } else if (normalized.startsWith("62") && normalized.length >= 10) {
    normalized = "0" + normalized.slice(2);
  }
  if (!/^0\d{8,14}$/.test(normalized)) {
    throw new ValidationError("Nomor HP tidak valid (minimal 9 digit angka diawali 0 atau +62).");
  }
  return normalized;
}

export function phoneLast4(normalizedPhone: string): string {
  return normalizedPhone.slice(-4);
}

export function validateDeliveryDate(dateStr: string): string {
  const trimmed = String(dateStr ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    throw new ValidationError("Format tanggal kirim wajib YYYY-MM-DD.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() + 1 !== month ||
    dt.getUTCDate() !== day
  ) {
    throw new ValidationError("Tanggal kirim tidak valid pada kalender.");
  }
  return trimmed;
}

export function validateDeliveryTime(timeStr: string): string {
  const trimmed = String(timeStr ?? "").trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
    throw new ValidationError("Jam kirim wajib berformat HH:MM (00:00 - 23:59).");
  }
  return trimmed;
}

export function validateNonEmptyText(raw: string, fieldLabel: string, maxLen = 200): string {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    throw new ValidationError(`${fieldLabel} wajib diisi.`);
  }
  if (trimmed.length > maxLen) {
    throw new ValidationError(`${fieldLabel} maksimal ${maxLen} karakter.`);
  }
  return trimmed;
}

export function validatePositiveInt(
  value: unknown,
  fieldLabel: string,
  min = 1,
  max = 1_000_000_000
): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(num) || num < min || num > max) {
    throw new ValidationError(`${fieldLabel} harus berupa bilangan bulat antara ${min} dan ${max}.`);
  }
  return num;
}

export function calculateMinDpIdr(totalIdr: number, minDpPercent: number): number {
  if (totalIdr <= 0 || minDpPercent <= 0) return 0;
  return Math.floor((totalIdr * minDpPercent + 99) / 100);
}

export function formatRupiah(amountIdr: number): string {
  const rounded = Math.trunc(amountIdr);
  const abs = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return rounded < 0 ? `-Rp ${abs}` : `Rp ${abs}`;
}

export function formatOrderWhatsAppSummary(
  order: {
    orderCode: string;
    customerName: string;
    institutionName?: string;
    deliveryDate: string;
    deliveryTime: string;
    status: OrderStatus;
    totalIdr: number;
    paidIdr: number;
    remainingIdr: number;
    items: Array<{ packageNameSnapshot: string; qty: number; subtotalIdr: number }>;
  },
  businessName: string
): string {
  const inst = order.institutionName ? ` (${order.institutionName})` : "";
  const lines = [
    `*${businessName} - Ringkasan Pre-Order*`,
    `Kode PO: ${order.orderCode}`,
    `Pemesan: ${order.customerName}${inst}`,
    `Jadwal Kirim: ${order.deliveryDate} pukul ${order.deliveryTime} WIB`,
    `Status: ${order.status}`,
    "",
    "Rincian Paket:",
    ...order.items.map(
      (item) => `- ${item.qty}x ${item.packageNameSnapshot}: ${formatRupiah(item.subtotalIdr)}`
    ),
    "",
    `Total Tagihan: ${formatRupiah(order.totalIdr)}`,
    `Sudah Dibayar: ${formatRupiah(order.paidIdr)}`,
    `Sisa Pelunasan: ${formatRupiah(order.remainingIdr)}`,
  ];
  return lines.join("\n");
}
