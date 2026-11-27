"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { CateringOrder, PaymentKind, PaymentMethod } from "@/lib/domain/types";
import { formatIdr, PAYMENT_METHOD_LABELS } from "@/lib/format";

type OrderFilter = "BELUM_LUNAS" | "SEMUA";

interface PaymentFormDraft {
  amountIdr: string;
  method: PaymentMethod;
  kind: PaymentKind;
  note: string;
}

function getDefaultDraft(order: CateringOrder): PaymentFormDraft {
  const needsDp = order.paidIdr < order.minDpIdr;
  const suggested = needsDp
    ? Math.min(order.remainingIdr, Math.max(0, order.minDpIdr - order.paidIdr))
    : order.remainingIdr;
  return {
    amountIdr: suggested > 0 ? String(suggested) : "",
    method: "TUNAI",
    kind: needsDp ? "DP" : "PELUNASAN",
    note: "",
  };
}

function formatPaidAt(raw: string): string {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return parsed.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CashierDesk() {
  const [orders, setOrders] = useState<CateringOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<OrderFilter>("BELUM_LUNAS");
  const [searchQuery, setSearchQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<number, PaymentFormDraft>>({});
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [deliveringId, setDeliveringId] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedbackByOrder, setFeedbackByOrder] = useState<
    Record<number, { type: "success" | "error"; message: string }>
  >({});

  const fetchOrders = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || "Gagal memuat daftar pesanan.");
        return;
      }
      const fetched = (data.orders ?? []) as CateringOrder[];
      setOrders(fetched);
      setDrafts((prev) => {
        const next: Record<number, PaymentFormDraft> = {};
        for (const ord of fetched) {
          const prevOrder = orders.find((o) => o.id === ord.id);
          const changed =
            !prevOrder ||
            prevOrder.remainingIdr !== ord.remainingIdr ||
            prevOrder.paidIdr !== ord.paidIdr ||
            prevOrder.status !== ord.status;
          next[ord.id] = prev[ord.id] && !changed ? prev[ord.id] : getDefaultDraft(ord);
        }
        return next;
      });
    } catch {
      setLoadError("Gagal terhubung ke server untuk memuat data kasir.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrders(false);
  }, [fetchOrders]);

  const counts = useMemo(() => {
    const unpaid = orders.filter(
      (o) => o.status !== "DIBATALKAN" && (o.remainingIdr > 0 || o.status === "SIAP_KIRIM")
    );
    const totalReceivable = orders
      .filter((o) => o.status !== "DIBATALKAN")
      .reduce((sum, o) => sum + o.remainingIdr, 0);
    const readyToClose = orders.filter(
      (o) => o.status === "SIAP_KIRIM" && o.remainingIdr === 0
    ).length;
    return {
      unpaidCount: unpaid.length,
      allCount: orders.length,
      totalReceivable,
      readyToClose,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === "BELUM_LUNAS") {
        const matchesUnpaid =
          o.status !== "DIBATALKAN" && (o.remainingIdr > 0 || o.status === "SIAP_KIRIM");
        if (!matchesUnpaid) return false;
      }
      if (!q) return true;
      return (
        o.orderCode.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.institutionName.toLowerCase().includes(q)
      );
    });
  }, [orders, filter, searchQuery]);

  function updateDraft(order: CateringOrder, patch: Partial<PaymentFormDraft>) {
    setDrafts((prev) => {
      const current = prev[order.id] ?? getDefaultDraft(order);
      return {
        ...prev,
        [order.id]: { ...current, ...patch },
      };
    });
  }

  function handleQuickFill(order: CateringOrder, mode: "DP" | "PELUNASAN") {
    if (mode === "DP") {
      const neededDp =
        order.paidIdr < order.minDpIdr
          ? order.minDpIdr - order.paidIdr
          : Math.min(order.minDpIdr, order.remainingIdr);
      const amount = Math.min(order.remainingIdr, Math.max(0, neededDp));
      updateDraft(order, {
        amountIdr: String(amount),
        kind: "DP",
      });
    } else {
      updateDraft(order, {
        amountIdr: String(order.remainingIdr),
        kind: "PELUNASAN",
      });
    }
  }

  async function handlePaymentSubmit(e: React.FormEvent, order: CateringOrder) {
    e.preventDefault();
    const draft = drafts[order.id] ?? getDefaultDraft(order);
    const parsedAmount = Number(draft.amountIdr);

    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setFeedbackByOrder((prev) => ({
        ...prev,
        [order.id]: {
          type: "error",
          message: "Nominal pembayaran wajib berupa bilangan bulat lebih dari 0.",
        },
      }));
      return;
    }

    setSubmittingId(order.id);
    setFeedbackByOrder((prev) => {
      const copy = { ...prev };
      delete copy[order.id];
      return copy;
    });

    try {
      const res = await fetch(`/api/orders/${order.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountIdr: parsedAmount,
          method: draft.method,
          kind: draft.kind,
          note: draft.note.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedbackByOrder((prev) => ({
          ...prev,
          [order.id]: {
            type: "error",
            message: data.error || "Gagal mencatat pembayaran.",
          },
        }));
        return;
      }

      const updatedOrder = data.order as CateringOrder;
      setOrders((prev) => prev.map((item) => (item.id === updatedOrder.id ? updatedOrder : item)));
      setDrafts((prev) => ({
        ...prev,
        [updatedOrder.id]: getDefaultDraft(updatedOrder),
      }));
      setFeedbackByOrder((prev) => ({
        ...prev,
        [updatedOrder.id]: {
          type: "success",
          message: `Pembayaran ${formatIdr(parsedAmount)} (${PAYMENT_METHOD_LABELS[draft.method]}) berhasil dicatat.`,
        },
      }));
    } catch {
      setFeedbackByOrder((prev) => ({
        ...prev,
        [order.id]: {
          type: "error",
          message: "Gagal menghubungi server saat mencatat pembayaran.",
        },
      }));
    } finally {
      setSubmittingId(null);
    }
  }

  async function handleCompleteDelivery(order: CateringOrder) {
    setDeliveringId(order.id);
    setFeedbackByOrder((prev) => {
      const copy = { ...prev };
      delete copy[order.id];
      return copy;
    });

    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SELESAI_DIKIRIM" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedbackByOrder((prev) => ({
          ...prev,
          [order.id]: {
            type: "error",
            message: data.error || "Gagal menyelesaikan pengiriman PO.",
          },
        }));
        return;
      }

      const updatedOrder = data.order as CateringOrder;
      setOrders((prev) => prev.map((item) => (item.id === updatedOrder.id ? updatedOrder : item)));
      setFeedbackByOrder((prev) => ({
        ...prev,
        [updatedOrder.id]: {
          type: "success",
          message: `PO ${updatedOrder.orderCode} ditandai Selesai Dikirim.`,
        },
      }));
    } catch {
      setFeedbackByOrder((prev) => ({
        ...prev,
        [order.id]: {
          type: "error",
          message: "Gagal menghubungi server saat mengubah status pengiriman.",
        },
      }));
    } finally {
      setDeliveringId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0F172A] sm:text-3xl">
            Meja Kasir Pre-Order
          </h1>
          <p className="mt-1 text-sm text-[#475569]">
            Catat DP atau pelunasan PO, pantau riwayat pembayaran, dan konfirmasi serah terima pesanan yang sudah lunas.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchOrders(true)}
          disabled={refreshing}
          className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-[#CBD5E1] bg-white px-4 text-sm font-semibold text-[#0F172A] transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className={`h-4 w-4 fill-none stroke-current ${refreshing ? "animate-spin" : ""}`}
            strokeWidth={2}
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          {refreshing ? "Memuat..." : "Muat Ulang Data"}
        </button>
      </div>

      <section
        aria-label="Ringkasan kasir"
        className="grid gap-3 sm:grid-cols-3"
      >
        <div className="rounded-2xl border border-[#CBD5E1] bg-white p-4">
          <p className="text-xs font-semibold text-[#475569] uppercase">Perlu Ditindaklanjuti</p>
          <p className="font-data mt-1 text-2xl font-bold text-[#0F172A]">
            {counts.unpaidCount} PO
          </p>
        </div>
        <div className="rounded-2xl border border-[#CBD5E1] bg-white p-4">
          <p className="text-xs font-semibold text-[#475569] uppercase">Total Piutang Aktif</p>
          <p className="font-data mt-1 text-2xl font-bold text-[#C2410C]">
            {formatIdr(counts.totalReceivable)}
          </p>
        </div>
        <div className="rounded-2xl border border-[#CBD5E1] bg-white p-4">
          <p className="text-xs font-semibold text-[#475569] uppercase">Siap Selesai Kirim (Lunas)</p>
          <p className="font-data mt-1 text-2xl font-bold text-[#047857]">
            {counts.readyToClose} PO
          </p>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#CBD5E1] bg-white p-4">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter daftar pesanan">
          <button
            type="button"
            onClick={() => setFilter("BELUM_LUNAS")}
            className={`min-h-[44px] cursor-pointer rounded-xl px-4 text-sm font-semibold transition-colors ${
              filter === "BELUM_LUNAS"
                ? "bg-[#C2410C] text-white"
                : "border border-[#CBD5E1] bg-white text-[#475569] hover:bg-slate-50 hover:text-[#0F172A]"
            }`}
          >
            Belum Lunas (<span className="font-data">{counts.unpaidCount}</span>)
          </button>
          <button
            type="button"
            onClick={() => setFilter("SEMUA")}
            className={`min-h-[44px] cursor-pointer rounded-xl px-4 text-sm font-semibold transition-colors ${
              filter === "SEMUA"
                ? "bg-[#0F172A] text-white"
                : "border border-[#CBD5E1] bg-white text-[#475569] hover:bg-slate-50 hover:text-[#0F172A]"
            }`}
          >
            Semua (<span className="font-data">{counts.allCount}</span>)
          </button>
        </div>

        <div className="w-full sm:w-72">
          <label htmlFor="kasir-search" className="sr-only">
            Cari kode PO atau nama pemesan
          </label>
          <input
            id="kasir-search"
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kode PO, pemesan, instansi..."
            className="min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm text-[#0F172A] placeholder:text-[#64748B]"
          />
        </div>
      </section>

      {loadError && (
        <div
          role="alert"
          className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm font-medium text-[#B91C1C]"
        >
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-[#CBD5E1] bg-white p-8 text-center text-sm text-[#475569]">
          Memuat daftar pre-order kasir...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="rounded-2xl border border-[#CBD5E1] bg-white p-8 text-center">
          <p className="text-base font-semibold text-[#0F172A]">
            Tidak ada pesanan pada filter ini.
          </p>
          <p className="mt-1 text-sm text-[#475569]">
            {filter === "BELUM_LUNAS"
              ? "Semua pre-order aktif sudah lunas atau berpindah ke tab Semua."
              : "Ubah kata kunci pencarian untuk melihat pre-order lainnya."}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {filteredOrders.map((order) => {
            const draft = drafts[order.id] ?? getDefaultDraft(order);
            const feedback = feedbackByOrder[order.id];
            const canAcceptPayment =
              order.remainingIdr > 0 &&
              order.status !== "DIBATALKAN" &&
              order.status !== "SELESAI_DIKIRIM";
            const canFinishDelivery =
              order.status === "SIAP_KIRIM" && order.remainingIdr === 0;

            return (
              <article
                key={order.id}
                className="rounded-2xl border border-[#CBD5E1] bg-white p-5 sm:p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-data rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-bold text-[#0F172A]">
                        {order.orderCode}
                      </span>
                      <StatusBadge status={order.status} />
                    </div>
                    <h2 className="mt-2 text-lg font-bold text-[#0F172A]">
                      {order.customerName}
                      {order.institutionName ? (
                        <span className="font-normal text-[#475569]">
                          {" "}
                          · {order.institutionName}
                        </span>
                      ) : null}
                    </h2>
                    <p className="font-data mt-1 text-xs text-[#475569]">
                      HP: {order.customerPhone} · Kirim: {order.deliveryDate} {order.deliveryTime} WIB ·{" "}
                      {order.totalBoxes} box
                    </p>
                    <p className="mt-1 text-xs text-[#475569]">{order.deliveryAddress}</p>
                  </div>
                </div>

                {feedback && (
                  <div
                    role={feedback.type === "error" ? "alert" : "status"}
                    className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${
                      feedback.type === "error"
                        ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]"
                        : "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]"
                    }`}
                  >
                    {feedback.message}
                  </div>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-3">
                    <p className="text-xs font-medium text-[#475569]">Total Tagihan</p>
                    <p className="font-data mt-1 text-base font-bold text-[#0F172A]">
                      {formatIdr(order.totalIdr)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-3">
                    <p className="text-xs font-medium text-[#475569]">Minimal DP</p>
                    <p className="font-data mt-1 text-base font-bold text-[#0F172A]">
                      {formatIdr(order.minDpIdr)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-3">
                    <p className="text-xs font-medium text-[#475569]">Sudah Dibayar</p>
                    <p className="font-data mt-1 text-base font-bold text-[#047857]">
                      {formatIdr(order.paidIdr)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-[#F8FAFC] p-3">
                    <p className="text-xs font-medium text-[#475569]">Sisa Pelunasan</p>
                    <p
                      className={`font-data mt-1 text-base font-bold ${
                        order.remainingIdr > 0 ? "text-[#C2410C]" : "text-[#047857]"
                      }`}
                    >
                      {formatIdr(order.remainingIdr)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-xs font-bold tracking-wider text-[#475569] uppercase">
                        Rincian Paket
                      </h3>
                      <ul className="mt-2 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-[#F8FAFC]">
                        {order.items.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center justify-between px-3.5 py-2.5 text-sm"
                          >
                            <span>
                              <strong className="font-data">{item.qty}x</strong>{" "}
                              {item.packageNameSnapshot}
                            </span>
                            <span className="font-data font-semibold text-[#0F172A]">
                              {formatIdr(item.subtotalIdr)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-xs font-bold tracking-wider text-[#475569] uppercase">
                        Riwayat Pembayaran
                      </h3>
                      {order.payments.length === 0 ? (
                        <p className="mt-2 rounded-xl border border-dashed border-[#CBD5E1] px-3.5 py-3 text-xs text-[#475569]">
                          Belum ada pembayaran tercatat untuk PO ini.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-2">
                          {order.payments.map((pay) => (
                            <li
                              key={pay.id}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-[#F8FAFC] px-3.5 py-2.5 text-xs"
                            >
                              <div>
                                <p className="font-semibold text-[#0F172A]">
                                  {pay.kind} · {PAYMENT_METHOD_LABELS[pay.method]}
                                </p>
                                <p className="font-data text-[#475569]">
                                  {formatPaidAt(pay.paidAt)}
                                  {pay.note ? ` · ${pay.note}` : ""}
                                </p>
                              </div>
                              <span className="font-data text-sm font-bold text-[#047857]">
                                {formatIdr(pay.amountIdr)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div>
                    {canAcceptPayment ? (
                      <form
                        onSubmit={(e) => void handlePaymentSubmit(e, order)}
                        className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-[#0F172A]">
                            Catat Pembayaran Baru
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleQuickFill(order, "DP")}
                              className="min-h-[44px] cursor-pointer rounded-lg border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#0F172A] transition-colors hover:bg-slate-100"
                            >
                              Isi DP Minimal
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickFill(order, "PELUNASAN")}
                              className="min-h-[44px] cursor-pointer rounded-lg border border-[#EA580C]/40 bg-[#FFF7ED] px-3 text-xs font-semibold text-[#C2410C] transition-colors hover:bg-[#FFEDD5]"
                            >
                              Isi Sisa Pelunasan
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <label
                              htmlFor={`pay-amount-${order.id}`}
                              className="block text-xs font-semibold text-[#0F172A]"
                            >
                              Nominal Pembayaran (IDR)
                            </label>
                            <input
                              id={`pay-amount-${order.id}`}
                              type="number"
                              min={1}
                              max={order.remainingIdr}
                              required
                              value={draft.amountIdr}
                              onChange={(e) =>
                                updateDraft(order, { amountIdr: e.target.value })
                              }
                              className="font-data mt-1 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
                            />
                          </div>

                          <div>
                            <label
                              htmlFor={`pay-method-${order.id}`}
                              className="block text-xs font-semibold text-[#0F172A]"
                            >
                              Metode
                            </label>
                            <select
                              id={`pay-method-${order.id}`}
                              value={draft.method}
                              onChange={(e) =>
                                updateDraft(order, {
                                  method: e.target.value as PaymentMethod,
                                })
                              }
                              className="mt-1 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm"
                            >
                              <option value="TUNAI">Tunai</option>
                              <option value="QRIS">QRIS</option>
                              <option value="TRANSFER">Transfer Bank</option>
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor={`pay-kind-${order.id}`}
                              className="block text-xs font-semibold text-[#0F172A]"
                            >
                              Jenis Pembayaran
                            </label>
                            <select
                              id={`pay-kind-${order.id}`}
                              value={draft.kind}
                              onChange={(e) =>
                                updateDraft(order, {
                                  kind: e.target.value as PaymentKind,
                                })
                              }
                              className="mt-1 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm"
                            >
                              <option value="DP">DP</option>
                              <option value="PELUNASAN">Pelunasan</option>
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label
                              htmlFor={`pay-note-${order.id}`}
                              className="block text-xs font-semibold text-[#0F172A]"
                            >
                              Catatan Kasir (Opsional)
                            </label>
                            <input
                              id={`pay-note-${order.id}`}
                              type="text"
                              maxLength={200}
                              value={draft.note}
                              onChange={(e) => updateDraft(order, { note: e.target.value })}
                              placeholder="Misal: Transfer BCA a.n. Bendahara"
                              className="mt-1 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
                            />
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={submittingId === order.id}
                          className="mt-4 min-h-[44px] w-full cursor-pointer rounded-xl bg-[#C2410C] px-4 text-sm font-bold text-white transition-colors hover:bg-[#9A3412] disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                          {submittingId === order.id
                            ? "Menyimpan Pembayaran..."
                            : "Simpan Pembayaran"}
                        </button>
                      </form>
                    ) : (
                      <div className="flex h-full flex-col justify-between rounded-xl border border-slate-200 bg-[#F8FAFC] p-4">
                        <div>
                          <h3 className="text-sm font-bold text-[#0F172A]">Status Pembayaran</h3>
                          <p className="mt-1 text-sm text-[#475569]">
                            {order.status === "DIBATALKAN"
                              ? "Pesanan dibatalkan dan tidak menerima pembayaran baru."
                              : order.status === "SELESAI_DIKIRIM"
                                ? "Pembayaran lunas dan pengiriman telah diselesaikan."
                                : order.status === "SIAP_KIRIM" && order.remainingIdr === 0
                                  ? "Tagihan sudah lunas 100%. Klik Selesaikan Pengiriman setelah pesanan diterima pemesan."
                                  : "Tagihan sudah lunas 100%."}
                          </p>
                        </div>
                        {canFinishDelivery && (
                          <button
                            type="button"
                            onClick={() => void handleCompleteDelivery(order)}
                            disabled={deliveringId === order.id}
                            className="mt-4 min-h-[44px] w-full cursor-pointer rounded-xl bg-[#047857] px-4 text-sm font-bold text-white transition-colors hover:bg-[#065F46] disabled:cursor-not-allowed disabled:bg-slate-400"
                          >
                            {deliveringId === order.id
                              ? "Memproses..."
                              : "Selesaikan Pengiriman"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
