"use client";

import { useState } from "react";
import type { OrderStatus, PublicOrderTrack } from "@/lib/domain/types";
import { formatIdr, PAYMENT_METHOD_LABELS, STATUS_META } from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";

const TIMELINE_STEPS: OrderStatus[] = [
  "MENUNGGU_DP",
  "TERJADWAL",
  "DIPRODUKSI",
  "SIAP_KIRIM",
  "SELESAI_DIKIRIM",
];

export function TrackOrderClient() {
  const [orderCode, setOrderCode] = useState("PO-261127-03");
  const [last4, setLast4] = useState("3344");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [order, setOrder] = useState<PublicOrderTrack | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/track?code=${encodeURIComponent(orderCode.trim())}&last4=${encodeURIComponent(last4.trim())}`
      );
      const data = await res.json();
      if (!res.ok) {
        setOrder(null);
        setErrorMsg(data.error || "Kode PO atau 4 digit HP tidak ditemukan.");
        return;
      }
      setOrder(data.order as PublicOrderTrack);
    } catch {
      setErrorMsg("Gagal menghubungi server pelacak PO.");
    } finally {
      setLoading(false);
    }
  }

  const currentIdx = order ? TIMELINE_STEPS.indexOf(order.status) : -1;

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-[#0F172A]">
        Lacak Progres Pre-Order
      </h1>
      <p className="mt-2 text-sm text-[#475569]">
        Masukkan kode PO dan 4 digit terakhir nomor HP pemesan untuk memeriksa jadwal masak,
        status pengiriman, dan rincian tagihan.
      </p>

      <form
        onSubmit={handleSearch}
        className="mt-6 rounded-2xl border border-[#E5D3C8] bg-white p-5 sm:p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="track-code" className="block text-sm font-semibold text-[#0F172A]">
              Kode Pre-Order
            </label>
            <input
              id="track-code"
              type="text"
              required
              value={orderCode}
              onChange={(e) => setOrderCode(e.target.value)}
              placeholder="PO-261127-03"
              className="font-data mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] px-3.5 text-sm uppercase"
            />
          </div>
          <div>
            <label htmlFor="track-last4" className="block text-sm font-semibold text-[#0F172A]">
              4 Digit Terakhir Nomor HP
            </label>
            <input
              id="track-last4"
              type="text"
              inputMode="numeric"
              maxLength={4}
              required
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="3344"
              className="font-data mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] px-3.5 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-4 min-h-[44px] w-full cursor-pointer rounded-xl bg-[#C2410C] px-5 text-sm font-bold text-white transition-colors hover:bg-[#9A3412] disabled:bg-slate-400"
        >
          {loading ? "Memeriksa Pesanan..." : "Cek Status Pesanan"}
        </button>

        {errorMsg && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm font-medium text-[#B91C1C]"
          >
            {errorMsg}
          </div>
        )}
      </form>

      {order && (
        <section className="mt-6 rounded-2xl border border-[#E5D3C8] bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#FDF4F0] pb-4">
            <div>
              <p className="font-data text-lg font-bold text-[#0F172A]">{order.orderCode}</p>
              <p className="mt-0.5 text-sm font-medium text-[#475569]">
                {order.customerName}
                {order.institutionName ? ` · ${order.institutionName}` : ""}
              </p>
              <p className="font-data mt-1 text-xs text-[#475569]">
                Jadwal antar: {order.deliveryDate} pukul {order.deliveryTime} WIB ·{" "}
                {order.totalBoxes} box
              </p>
            </div>
            <StatusBadge status={order.status} />
          </div>

          {order.status !== "DIBATALKAN" && (
            <ol className="mt-5 grid gap-2 sm:grid-cols-5">
              {TIMELINE_STEPS.map((st, idx) => {
                const done = idx <= currentIdx;
                return (
                  <li
                    key={st}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                      done
                        ? "border-[#EA580C] bg-[#FFF7ED] text-[#C2410C]"
                        : "border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]"
                    }`}
                  >
                    {STATUS_META[st].label}
                  </li>
                );
              })}
            </ol>
          )}

          <div className="mt-5">
            <h2 className="text-sm font-bold text-[#0F172A]">Rincian Paket</h2>
            <ul className="mt-2 divide-y divide-[#FDF4F0] rounded-xl border border-[#E5D3C8]">
              {order.items.map((item, idx) => (
                <li key={idx} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span>
                    <strong className="font-data">{item.qty}x</strong> {item.packageNameSnapshot}
                  </span>
                  <span className="font-data font-semibold text-[#0F172A]">
                    {formatIdr(item.subtotalIdr)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <dl className="mt-5 space-y-2 rounded-xl border border-[#E5D3C8] bg-[#FFF7ED] p-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-[#475569]">Total Tagihan</dt>
              <dd className="font-data font-bold text-[#0F172A]">{formatIdr(order.totalIdr)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#475569]">Sudah Dibayar</dt>
              <dd className="font-data font-semibold text-[#047857]">{formatIdr(order.paidIdr)}</dd>
            </div>
            <div className="flex justify-between border-t border-[#E5D3C8] pt-2">
              <dt className="font-bold text-[#0F172A]">Sisa Pelunasan</dt>
              <dd className="font-data text-base font-bold text-[#C2410C]">
                {formatIdr(order.remainingIdr)}
              </dd>
            </div>
          </dl>

          {order.remainingIdr > 0 && order.status !== "DIBATALKAN" && (
            <p className="mt-4 rounded-xl border border-[#FDE68A] bg-[#FEF3C7] px-4 py-3 text-xs font-medium text-[#92400E]">
              {order.paidIdr < order.minDpIdr
                ? `Pesanan ini masih menunggu DP minimal ${formatIdr(order.minDpIdr)} agar masuk antrean produksi dapur.`
                : `Pesanan wajib dilunasi sebesar ${formatIdr(order.remainingIdr)} sebelum diserahkan ke kurir.`}
            </p>
          )}

          {order.payments.length > 0 && (
            <div className="mt-5">
              <h2 className="text-sm font-bold text-[#0F172A]">Riwayat Pembayaran</h2>
              <ul className="mt-2 space-y-1.5 text-xs text-[#475569]">
                {order.payments.map((p, i) => (
                  <li key={i} className="flex justify-between rounded-lg bg-[#F8FAFC] px-3 py-2">
                    <span>
                      {p.kind} ({PAYMENT_METHOD_LABELS[p.method]})
                    </span>
                    <span className="font-data font-semibold text-[#0F172A]">
                      {formatIdr(p.amountIdr)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
