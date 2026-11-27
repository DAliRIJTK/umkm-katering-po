"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { formatOrderWhatsAppSummary } from "@/lib/domain/validators";
import type {
  CateringOrder,
  DailyCapacityInfo,
  MenuPackage,
  OrderStatus,
  PublicSettings,
  ShoppingListItem,
} from "@/lib/domain/types";
import { formatIdr, formatMinDp, STATUS_META } from "@/lib/format";

type WorkspaceTab = "orders" | "bom";
type StatusFilter = "ALL" | OrderStatus;

interface DraftOrderItem {
  key: string;
  packageId: number;
  qty: number;
}

const CAPACITY_DATES = "2026-11-27,2026-11-28,2026-11-29";

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "ALL", label: "Semua" },
  { key: "MENUNGGU_DP", label: STATUS_META.MENUNGGU_DP.label },
  { key: "TERJADWAL", label: STATUS_META.TERJADWAL.label },
  { key: "DIPRODUKSI", label: STATUS_META.DIPRODUKSI.label },
  { key: "SIAP_KIRIM", label: STATUS_META.SIAP_KIRIM.label },
  { key: "SELESAI_DIKIRIM", label: STATUS_META.SELESAI_DIKIRIM.label },
  { key: "DIBATALKAN", label: STATUS_META.DIBATALKAN.label },
];

const NEXT_FORWARD_TRANSITION: Partial<
  Record<OrderStatus, { toStatus: OrderStatus; label: string }>
> = {
  MENUNGGU_DP: { toStatus: "TERJADWAL", label: "Jadwalkan Produksi" },
  TERJADWAL: { toStatus: "DIPRODUKSI", label: "Mulai Produksi" },
  DIPRODUKSI: { toStatus: "SIAP_KIRIM", label: "Tandai Siap Kirim" },
  SIAP_KIRIM: { toStatus: "SELESAI_DIKIRIM", label: "Selesai Dikirim" },
};

const BOM_PRESETS: Array<{ label: string; from: string; to: string }> = [
  { label: "2026-11-27", from: "2026-11-27", to: "2026-11-27" },
  { label: "2026-11-28", from: "2026-11-28", to: "2026-11-28" },
  { label: "2026-11-28..2026-11-29", from: "2026-11-28", to: "2026-11-29" },
];

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error || data.message || fallback;
  } catch {
    return fallback;
  }
}

export function KitchenWorkspace() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("orders");

  const [settings, setSettings] = useState<PublicSettings>({
    businessName: "DapurRantang",
    whatsappNumber: "081200002711",
    addressArea: "Coblong, Bandung",
    dailyCapacityBoxes: 200,
    minDpPercent: 30,
  });
  const [packages, setPackages] = useState<MenuPackage[]>([]);
  const [capacities, setCapacities] = useState<DailyCapacityInfo[]>([]);
  const [orders, setOrders] = useState<CateringOrder[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingListItem[]>([]);

  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isBomLoading, setIsBomLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [confirmCancelOrderId, setConfirmCancelOrderId] = useState<number | null>(null);
  const [copiedOrderId, setCopiedOrderId] = useState<number | null>(null);

  const [bomFrom, setBomFrom] = useState("2026-11-28");
  const [bomTo, setBomTo] = useState("2026-11-28");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("2026-11-28");
  const [deliveryTime, setDeliveryTime] = useState("11:00");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [draftItems, setDraftItems] = useState<DraftOrderItem[]>([]);

  const loadSnapshotAndOrders = useCallback(async () => {
    const ordRes = await fetch("/api/orders", { cache: "no-store" });
    if (!ordRes.ok) {
      throw new Error(await readErrorMessage(ordRes, "Gagal memuat daftar pre-order."));
    }
    const ordData = (await ordRes.json()) as { orders: CateringOrder[] };

    const activeDates = Array.from(
      new Set([
        ...CAPACITY_DATES.split(","),
        ...ordData.orders
          .filter((o) => o.status !== "DIBATALKAN")
          .map((o) => o.deliveryDate),
      ])
    )
      .sort()
      .slice(0, 6);

    const pkgRes = await fetch(
      `/api/packages?dates=${encodeURIComponent(activeDates.join(","))}`,
      { cache: "no-store" }
    );
    if (!pkgRes.ok) {
      throw new Error(await readErrorMessage(pkgRes, "Gagal memuat data paket dan kuota dapur."));
    }

    const pkgData = (await pkgRes.json()) as {
      settings: PublicSettings;
      packages: MenuPackage[];
      capacities: DailyCapacityInfo[];
    };

    setSettings(pkgData.settings);
    setPackages(pkgData.packages);
    setCapacities(pkgData.capacities);
    setOrders(ordData.orders);

    setDraftItems((prev) => {
      if (prev.length > 0 || pkgData.packages.length === 0) {
        return prev;
      }
      const firstPkg = pkgData.packages[0];
      return [
        {
          key: `draft-${Date.now()}`,
          packageId: firstPkg.id,
          qty: firstPkg.minOrderQty,
        },
      ];
    });
  }, []);

  const loadShoppingList = useCallback(async (from: string, to: string) => {
    if (!from || !to) return;
    if (from > to) {
      setErrorMessage("Tanggal mulai BOM tidak boleh melebihi tanggal akhir.");
      return;
    }

    setIsBomLoading(true);
    try {
      const res = await fetch(
        `/api/shopping-list?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "Gagal memuat daftar belanja bahan BOM."));
      }
      const data = (await res.json()) as {
        from: string;
        to: string;
        items: ShoppingListItem[];
      };
      setShoppingItems(data.items);
    } finally {
      setIsBomLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setIsInitialLoading(true);
      setErrorMessage(null);
      try {
        await Promise.all([loadSnapshotAndOrders(), loadShoppingList("2026-11-28", "2026-11-28")]);
      } catch (err) {
        if (active) {
          setErrorMessage(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data dapur.");
        }
      } finally {
        if (active) {
          setIsInitialLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [loadSnapshotAndOrders, loadShoppingList]);

  const refreshAll = useCallback(
    async (from = bomFrom, to = bomTo) => {
      await Promise.all([loadSnapshotAndOrders(), loadShoppingList(from, to)]);
    },
    [bomFrom, bomTo, loadShoppingList, loadSnapshotAndOrders]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      ALL: orders.length,
      MENUNGGU_DP: 0,
      TERJADWAL: 0,
      DIPRODUKSI: 0,
      SIAP_KIRIM: 0,
      SELESAI_DIKIRIM: 0,
      DIBATALKAN: 0,
    };
    for (const order of orders) {
      counts[order.status] += 1;
    }
    return counts;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((order) => {
      if (statusFilter !== "ALL" && order.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        order.orderCode,
        order.customerName,
        order.institutionName,
        order.customerPhone,
        order.deliveryAddress,
        order.deliveryDate,
        order.notes,
        ...order.items.map((item) => item.packageNameSnapshot),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [orders, searchQuery, statusFilter]);

  const packageMap = useMemo(() => {
    const map = new Map<number, MenuPackage>();
    for (const pkg of packages) {
      map.set(pkg.id, pkg);
    }
    return map;
  }, [packages]);

  const draftTotals = useMemo(() => {
    let totalBoxes = 0;
    let totalIdr = 0;
    for (const item of draftItems) {
      const pkg = packageMap.get(item.packageId);
      const qty = Number.isFinite(item.qty) && item.qty > 0 ? item.qty : 0;
      totalBoxes += qty;
      if (pkg) {
        totalIdr += qty * pkg.priceIdr;
      }
    }
    return {
      totalBoxes,
      totalIdr,
      minDpIdr: formatMinDp(totalIdr, settings.minDpPercent),
    };
  }, [draftItems, packageMap, settings.minDpPercent]);

  const bomSummary = useMemo(() => {
    let totalCostIdr = 0;
    let rawCostIdr = 0;
    let packagingCostIdr = 0;
    for (const item of shoppingItems) {
      totalCostIdr += item.estimatedCostIdr;
      if (item.category === "BAHAN_BAKU") {
        rawCostIdr += item.estimatedCostIdr;
      } else {
        packagingCostIdr += item.estimatedCostIdr;
      }
    }
    return { totalCostIdr, rawCostIdr, packagingCostIdr };
  }, [shoppingItems]);

  async function handleStatusTransition(orderId: number, toStatus: OrderStatus) {
    setBusyOrderId(orderId);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: toStatus }),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "Gagal memperbarui status pre-order."));
      }
      const data = (await res.json()) as { order: CateringOrder };
      setConfirmCancelOrderId(null);
      await refreshAll();
      setNoticeMessage(
        `Status ${data.order.orderCode} diperbarui menjadi ${STATUS_META[data.order.status].label}.`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Gagal memperbarui status pre-order.");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleCopyWaSummary(order: CateringOrder) {
    setErrorMessage(null);
    try {
      const text = formatOrderWhatsAppSummary(order, settings.businessName);
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard browser tidak tersedia pada konteks ini.");
      }
      await navigator.clipboard.writeText(text);
      setCopiedOrderId(order.id);
      setTimeout(() => {
        setCopiedOrderId((current) => (current === order.id ? null : current));
      }, 2500);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Gagal menyalin ringkasan nota WhatsApp."
      );
    }
  }

  function handleAddDraftItem() {
    const fallbackPkg = packages[0];
    if (!fallbackPkg) return;
    setDraftItems((prev) => [
      ...prev,
      {
        key: `draft-${Date.now()}-${prev.length}`,
        packageId: fallbackPkg.id,
        qty: fallbackPkg.minOrderQty,
      },
    ]);
  }

  function handleUpdateDraftItem(key: string, patch: Partial<DraftOrderItem>) {
    setDraftItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, ...patch } : item))
    );
  }

  function handleRemoveDraftItem(key: string) {
    setDraftItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev));
  }

  function resetCreateForm() {
    setCustomerName("");
    setInstitutionName("");
    setCustomerPhone("");
    setDeliveryDate("2026-11-28");
    setDeliveryTime("11:00");
    setDeliveryAddress("");
    setNotes("");
    setCreateError(null);
    if (packages.length > 0) {
      setDraftItems([
        {
          key: `draft-${Date.now()}`,
          packageId: packages[0].id,
          qty: packages[0].minOrderQty,
        },
      ]);
    }
  }

  async function handleCreateOrderSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
    setErrorMessage(null);
    setNoticeMessage(null);

    if (draftItems.length === 0) {
      setCreateError("Pilih minimal 1 paket katering.");
      return;
    }

    setIsSubmittingCreate(true);
    try {
      const payload = {
        customerName: customerName.trim(),
        institutionName: institutionName.trim() || undefined,
        customerPhone: customerPhone.trim(),
        deliveryDate,
        deliveryTime,
        deliveryAddress: deliveryAddress.trim(),
        notes: notes.trim() || undefined,
        items: draftItems.map((item) => ({
          packageId: Number(item.packageId),
          qty: Number(item.qty),
        })),
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await readErrorMessage(res, "Gagal menyimpan pre-order baru."));
      }

      const data = (await res.json()) as { order: CateringOrder };
      await refreshAll();
      resetCreateForm();
      setIsCreateOpen(false);
      setNoticeMessage(
        `PO baru ${data.order.orderCode} (${data.order.totalBoxes} box) berhasil dicatat.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan pre-order baru.";
      setCreateError(msg);
      setErrorMessage(msg);
    } finally {
      setIsSubmittingCreate(false);
    }
  }

  async function handleBomRangeChange(nextFrom: string, nextTo: string) {
    setErrorMessage(null);
    if (!nextFrom || !nextTo) {
      setBomFrom(nextFrom);
      setBomTo(nextTo);
      return;
    }
    if (nextFrom > nextTo) {
      setErrorMessage("Tanggal mulai BOM tidak boleh melebihi tanggal akhir.");
      return;
    }
    setBomFrom(nextFrom);
    setBomTo(nextTo);
    try {
      await loadShoppingList(nextFrom, nextTo);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Gagal memuat daftar belanja BOM.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#0F172A] sm:text-3xl">
            Kontrol Produksi &amp; Daftar Belanja BOM
          </h1>
          <p className="mt-1 text-sm text-[#475569]">
            Pantau kuota masak harian, proses antrean pre-order, dan hitung kebutuhan bahan dapur.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            refreshAll().catch((err) => {
              setErrorMessage(
                err instanceof Error ? err.message : "Gagal menyegarkan data operasional."
              );
            });
          }}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-4 text-sm font-semibold text-[#0F172A] transition-colors hover:bg-slate-50"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-4 w-4 fill-none stroke-current"
            strokeWidth={2}
          >
            <path d="M21 12a9 9 0 1 1-2.64-6.36" />
            <path d="M21 3v6h-6" />
          </svg>
          Segarkan Data
        </button>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#991B1B]"
        >
          <div className="flex items-center gap-2.5">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-5 w-5 shrink-0 fill-none stroke-current"
              strokeWidth={2}
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5" />
              <path d="M12 16h.01" />
            </svg>
            <span className="font-medium">{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-xs font-semibold text-[#991B1B] underline hover:bg-[#FEE2E2]"
          >
            Tutup
          </button>
        </div>
      ) : null}

      {noticeMessage ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] px-4 py-3 text-sm text-[#065F46]"
        >
          <span className="font-medium">{noticeMessage}</span>
          <button
            type="button"
            onClick={() => setNoticeMessage(null)}
            className="inline-flex min-h-[44px] items-center rounded-lg px-3 text-xs font-semibold text-[#065F46] underline hover:bg-[#D1FAE5]"
          >
            Tutup
          </button>
        </div>
      ) : null}

      {/* Strip Kuota Kapasitas Harian Dapur */}
      <section aria-labelledby="kuota-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="kuota-heading" className="text-sm font-bold tracking-wide text-[#0F172A] uppercase">
            Kuota Kapasitas Harian Dapur
          </h2>
          <span className="font-data text-xs font-medium text-[#475569]">
            Batas default: {settings.dailyCapacityBoxes} box/hari
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {capacities.map((cap) => {
            const barColor =
              cap.utilizationPct >= 95
                ? "bg-[#DC2626]"
                : cap.utilizationPct >= 75
                  ? "bg-[#EA580C]"
                  : "bg-[#0F766E]";
            return (
              <div
                key={cap.date}
                className="rounded-xl border border-[#CBD5E1] bg-white p-4 shadow-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-data text-sm font-semibold text-[#0F172A]">{cap.date}</span>
                  <span className="font-data rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-[#475569]">
                    {cap.utilizationPct}% terisi
                  </span>
                </div>

                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <p className="font-data text-xl font-bold text-[#0F172A]">
                    {cap.usedBoxes} / {cap.capacityBoxes} box
                  </p>
                  <p className="font-data text-xs font-semibold text-[#0F766E]">
                    Sisa {cap.remainingBoxes} box
                  </p>
                </div>

                <div
                  role="progressbar"
                  aria-label={`Utilisasi kuota ${cap.date}`}
                  aria-valuenow={cap.utilizationPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200"
                >
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${cap.utilizationPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Mode kerja dapur"
        className="flex flex-wrap gap-2 border-b border-[#CBD5E1] pb-3"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "orders"}
          onClick={() => setActiveTab("orders")}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
            activeTab === "orders"
              ? "bg-[#0F172A] text-white"
              : "border border-[#CBD5E1] bg-white text-[#475569] hover:bg-slate-50 hover:text-[#0F172A]"
          }`}
        >
          <span>Antrean Pre-Order</span>
          <span
            className={`font-data rounded-full px-2 py-0.5 text-xs ${
              activeTab === "orders" ? "bg-slate-700 text-white" : "bg-slate-100 text-[#0F172A]"
            }`}
          >
            {orders.length}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "bom"}
          onClick={() => setActiveTab("bom")}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors ${
            activeTab === "bom"
              ? "bg-[#0F172A] text-white"
              : "border border-[#CBD5E1] bg-white text-[#475569] hover:bg-slate-50 hover:text-[#0F172A]"
          }`}
        >
          <span>Daftar Belanja &amp; Prep BOM</span>
          <span
            className={`font-data rounded-full px-2 py-0.5 text-xs ${
              activeTab === "bom" ? "bg-slate-700 text-white" : "bg-slate-100 text-[#0F172A]"
            }`}
          >
            {shoppingItems.length}
          </span>
        </button>
      </div>

      {isInitialLoading ? (
        <div className="rounded-xl border border-[#CBD5E1] bg-white p-8 text-center text-sm text-[#475569]">
          Memuat antrean dapur dan kalkulasi bahan...
        </div>
      ) : activeTab === "orders" ? (
        <section aria-label="Antrean Pre-Order" className="space-y-5">
          {/* Toolbar: Search + Catat PO Baru */}
          <div className="flex flex-col gap-3 rounded-xl border border-[#CBD5E1] bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <label htmlFor="po-search" className="sr-only">
                Cari Pre-Order
              </label>
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 fill-none stroke-[#64748B]"
                strokeWidth={2}
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                id="po-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari kode PO, pemesan, instansi, HP, alamat, atau menu..."
                className="min-h-[44px] w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] pr-4 pl-10 text-sm text-[#0F172A] placeholder:text-[#64748B]"
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setCreateError(null);
                setIsCreateOpen((prev) => !prev);
              }}
              aria-expanded={isCreateOpen}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-lg bg-[#C2410C] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#9A3412]"
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-4 w-4 fill-none stroke-current"
                strokeWidth={2.2}
              >
                {isCreateOpen ? (
                  <path d="M6 18 18 6M6 6l12 12" />
                ) : (
                  <path d="M12 5v14M5 12h14" />
                )}
              </svg>
              <span>{isCreateOpen ? "Tutup Form PO" : "+ Catat PO Baru"}</span>
            </button>
          </div>

          {/* Inline Panel + Catat PO Baru */}
          {isCreateOpen ? (
            <form
              onSubmit={handleCreateOrderSubmit}
              className="space-y-5 rounded-xl border border-[#CBD5E1] bg-white p-5 shadow-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-base font-bold text-[#0F172A]">Catat Pre-Order Baru</h2>
                  <p className="text-xs text-[#475569]">
                    PO baru otomatis masuk status Menunggu DP (minimal DP{" "}
                    <span className="font-data font-semibold">{settings.minDpPercent}%</span>).
                  </p>
                </div>
              </div>

              {createError ? (
                <div
                  role="alert"
                  className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm font-medium text-[#991B1B]"
                >
                  {createError}
                </div>
              ) : null}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label
                    htmlFor="create-customer-name"
                    className="mb-1.5 block text-xs font-semibold text-[#0F172A]"
                  >
                    Nama Pemesan *
                  </label>
                  <input
                    id="create-customer-name"
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Contoh: Ibu Dewi"
                    className="min-h-[44px] w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="create-institution"
                    className="mb-1.5 block text-xs font-semibold text-[#0F172A]"
                  >
                    Instansi / Acara
                  </label>
                  <input
                    id="create-institution"
                    type="text"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    placeholder="Opsional, mis. Rapat Kecamatan"
                    className="min-h-[44px] w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="create-phone"
                    className="mb-1.5 block text-xs font-semibold text-[#0F172A]"
                  >
                    No. WhatsApp / HP *
                  </label>
                  <input
                    id="create-phone"
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="081234567890"
                    className="font-data min-h-[44px] w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="create-date"
                    className="mb-1.5 block text-xs font-semibold text-[#0F172A]"
                  >
                    Tanggal Kirim *
                  </label>
                  <input
                    id="create-date"
                    type="date"
                    required
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="font-data min-h-[44px] w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="create-time"
                    className="mb-1.5 block text-xs font-semibold text-[#0F172A]"
                  >
                    Jam Kirim (WIB) *
                  </label>
                  <input
                    id="create-time"
                    type="time"
                    required
                    value={deliveryTime}
                    onChange={(e) => setDeliveryTime(e.target.value)}
                    className="font-data min-h-[44px] w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="create-notes"
                    className="mb-1.5 block text-xs font-semibold text-[#0F172A]"
                  >
                    Catatan Dapur / Kirim
                  </label>
                  <input
                    id="create-notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Opsional, mis. Sambal dipisah"
                    className="min-h-[44px] w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A]"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="create-address"
                  className="mb-1.5 block text-xs font-semibold text-[#0F172A]"
                >
                  Alamat Pengiriman *
                </label>
                <input
                  id="create-address"
                  type="text"
                  required
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Jl. Merdeka No. 10, Bandung"
                  className="min-h-[44px] w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A]"
                />
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 bg-[#F8FAFC] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold tracking-wide text-[#0F172A] uppercase">
                    Item Paket Pesanan
                  </span>
                  <button
                    type="button"
                    onClick={handleAddDraftItem}
                    disabled={packages.length === 0}
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-[#CBD5E1] bg-white px-3.5 text-xs font-semibold text-[#0F172A] hover:bg-slate-50 disabled:opacity-50"
                  >
                    + Tambah Baris Paket
                  </button>
                </div>

                <div className="space-y-2.5">
                  {draftItems.map((item, idx) => {
                    const selectedPkg = packageMap.get(item.packageId);
                    const rowSubtotal = selectedPkg ? selectedPkg.priceIdr * (item.qty || 0) : 0;
                    return (
                      <div
                        key={item.key}
                        className="grid grid-cols-1 gap-2.5 sm:grid-cols-12 sm:items-center"
                      >
                        <div className="sm:col-span-6">
                          <label htmlFor={`pkg-select-${item.key}`} className="sr-only">
                            Pilih paket baris {idx + 1}
                          </label>
                          <select
                            id={`pkg-select-${item.key}`}
                            value={item.packageId}
                            onChange={(e) => {
                              const nextPkgId = Number(e.target.value);
                              const nextPkg = packageMap.get(nextPkgId);
                              handleUpdateDraftItem(item.key, {
                                packageId: nextPkgId,
                                qty: nextPkg ? Math.max(item.qty, nextPkg.minOrderQty) : item.qty,
                              });
                            }}
                            className="min-h-[44px] w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A]"
                          >
                            {packages.map((pkg) => (
                              <option key={pkg.id} value={pkg.id}>
                                {pkg.name} — {formatIdr(pkg.priceIdr)} (min {pkg.minOrderQty})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="sm:col-span-2">
                          <label htmlFor={`pkg-qty-${item.key}`} className="sr-only">
                            Jumlah box baris {idx + 1}
                          </label>
                          <input
                            id={`pkg-qty-${item.key}`}
                            type="number"
                            min={1}
                            required
                            value={item.qty}
                            onChange={(e) =>
                              handleUpdateDraftItem(item.key, {
                                qty: Math.max(0, Number.parseInt(e.target.value || "0", 10)),
                              })
                            }
                            className="font-data min-h-[44px] w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-sm text-[#0F172A]"
                          />
                        </div>

                        <div className="font-data text-sm font-semibold text-[#0F172A] sm:col-span-2 sm:text-right">
                          {formatIdr(rowSubtotal)}
                        </div>

                        <div className="sm:col-span-2 sm:text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveDraftItem(item.key)}
                            disabled={draftItems.length <= 1}
                            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-3 text-sm">
                  <div className="flex flex-wrap gap-5">
                    <span>
                      Total Box:{" "}
                      <strong className="font-data text-[#0F172A]">
                        {draftTotals.totalBoxes} box
                      </strong>
                    </span>
                    <span>
                      Estimasi Tagihan:{" "}
                      <strong className="font-data text-[#0F172A]">
                        {formatIdr(draftTotals.totalIdr)}
                      </strong>
                    </span>
                    <span>
                      Min. DP ({settings.minDpPercent}%):{" "}
                      <strong className="font-data text-[#C2410C]">
                        {formatIdr(draftTotals.minDpIdr)}
                      </strong>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    resetCreateForm();
                    setIsCreateOpen(false);
                  }}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-[#CBD5E1] bg-white px-4 text-sm font-semibold text-[#475569] hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCreate}
                  className="inline-flex min-h-[44px] items-center rounded-lg bg-[#C2410C] px-5 text-sm font-semibold text-white hover:bg-[#9A3412] disabled:opacity-60"
                >
                  {isSubmittingCreate ? "Menyimpan..." : "Simpan Pre-Order"}
                </button>
              </div>
            </form>
          ) : null}

          {/* Filter Chip Status */}
          <div
            role="group"
            aria-label="Filter status pre-order"
            className="flex flex-wrap items-center gap-2"
          >
            {STATUS_FILTERS.map((chip) => {
              const isSelected = statusFilter === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setStatusFilter(chip.key)}
                  className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3.5 text-xs font-semibold transition-colors ${
                    isSelected
                      ? "border-[#0F172A] bg-[#0F172A] text-white"
                      : "border-[#CBD5E1] bg-white text-[#475569] hover:bg-slate-50 hover:text-[#0F172A]"
                  }`}
                >
                  <span>{chip.label}</span>
                  <span
                    className={`font-data rounded-full px-1.5 py-0.5 text-[11px] ${
                      isSelected ? "bg-slate-700 text-white" : "bg-slate-100 text-[#0F172A]"
                    }`}
                  >
                    {statusCounts[chip.key]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Daftar Kartu PO */}
          {filteredOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-white p-8 text-center">
              <p className="text-sm font-semibold text-[#0F172A]">
                Tidak ada pre-order yang sesuai filter.
              </p>
              <p className="mt-1 text-xs text-[#475569]">
                Coba ubah kata kunci pencarian atau pilih filter status Semua.
              </p>
              {(searchQuery || statusFilter !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("ALL");
                  }}
                  className="mt-4 inline-flex min-h-[44px] items-center rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-4 text-sm font-semibold text-[#0F172A] hover:bg-slate-100"
                >
                  Reset Filter
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredOrders.map((order) => {
                const nextAction = NEXT_FORWARD_TRANSITION[order.status];
                const canCancel =
                  order.status !== "SELESAI_DIKIRIM" && order.status !== "DIBATALKAN";
                const isBusy = busyOrderId === order.id;
                const isConfirmingCancel = confirmCancelOrderId === order.id;
                const isCopied = copiedOrderId === order.id;

                return (
                  <article
                    key={order.id}
                    className="rounded-xl border border-[#CBD5E1] bg-white p-5 shadow-xs"
                  >
                    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="font-data text-sm font-bold text-[#0F172A]">
                            {order.orderCode}
                          </span>
                          <StatusBadge status={order.status} />
                          <span className="font-data rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-[#0F172A]">
                            {order.totalBoxes} box
                          </span>
                        </div>
                        <p className="text-base font-bold text-[#0F172A]">
                          {order.customerName}
                          {order.institutionName ? (
                            <span className="font-normal text-[#475569]">
                              {" "}
                              — {order.institutionName}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-[#475569]">
                          <span className="font-data font-medium text-[#0F172A]">
                            {order.customerPhone}
                          </span>
                          {" • "}
                          {order.deliveryAddress}
                        </p>
                      </div>

                      <div className="shrink-0 rounded-lg border border-slate-200 bg-[#F8FAFC] px-3.5 py-2 sm:text-right">
                        <p className="text-[11px] font-semibold tracking-wide text-[#475569] uppercase">
                          Jadwal Kirim
                        </p>
                        <p className="font-data text-sm font-bold text-[#0F172A]">
                          {order.deliveryDate} • {order.deliveryTime} WIB
                        </p>
                      </div>
                    </div>

                    {order.notes ? (
                      <div className="mt-3 rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-xs text-[#92400E]">
                        <span className="font-semibold">Catatan:</span> {order.notes}
                      </div>
                    ) : null}

                    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12">
                      {/* Item Paket */}
                      <div className="space-y-2 lg:col-span-7">
                        <p className="text-xs font-bold tracking-wide text-[#475569] uppercase">
                          Rincian Paket
                        </p>
                        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-[#F8FAFC]">
                          {order.items.map((item) => (
                            <li
                              key={item.id}
                              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                            >
                              <span>
                                <strong className="font-data text-[#0F172A]">{item.qty}x</strong>{" "}
                                {item.packageNameSnapshot}
                              </span>
                              <span className="font-data font-semibold text-[#0F172A]">
                                {formatIdr(item.subtotalIdr)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Rincian Tagihan */}
                      <div className="space-y-2 lg:col-span-5">
                        <p className="text-xs font-bold tracking-wide text-[#475569] uppercase">
                          Rincian Tagihan
                        </p>
                        <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-[#F8FAFC] p-3">
                          <div>
                            <p className="text-[11px] font-medium text-[#475569]">Total</p>
                            <p className="font-data mt-0.5 text-sm font-bold text-[#0F172A]">
                              {formatIdr(order.totalIdr)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] font-medium text-[#475569]">Terbayar</p>
                            <p className="font-data mt-0.5 text-sm font-bold text-[#047857]">
                              {formatIdr(order.paidIdr)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] font-medium text-[#475569]">Sisa</p>
                            <p
                              className={`font-data mt-0.5 text-sm font-bold ${
                                order.remainingIdr > 0 ? "text-[#C2410C]" : "text-[#0F172A]"
                              }`}
                            >
                              {formatIdr(order.remainingIdr)}
                            </p>
                          </div>
                        </div>

                        {order.status === "MENUNGGU_DP" && order.paidIdr < order.minDpIdr ? (
                          <p className="text-xs text-[#B45309]">
                            Butuh DP min.{" "}
                            <span className="font-data font-semibold">
                              {formatIdr(order.minDpIdr)}
                            </span>{" "}
                            di Kasir agar dapat dijadwalkan.
                          </p>
                        ) : null}

                        {order.status === "SIAP_KIRIM" && order.remainingIdr > 0 ? (
                          <p className="text-xs text-[#0F766E]">
                            Sisa{" "}
                            <span className="font-data font-semibold">
                              {formatIdr(order.remainingIdr)}
                            </span>{" "}
                            wajib dilunasi sebelum status Selesai Dikirim.
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {/* Action Bar */}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-200 pt-4">
                      <div className="flex flex-wrap items-center gap-2.5">
                        {nextAction ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleStatusTransition(order.id, nextAction.toStatus)}
                            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#0F172A] px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
                          >
                            {isBusy ? "Memproses..." : nextAction.label}
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => handleCopyWaSummary(order)}
                          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-4 text-sm font-semibold text-[#0F172A] transition-colors hover:bg-slate-50"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                            className="h-4 w-4 fill-none stroke-current"
                            strokeWidth={2}
                          >
                            <rect x="9" y="9" width="11" height="11" rx="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          <span>{isCopied ? "Nota WA Tersalin" : "Salin Nota WA"}</span>
                        </button>
                      </div>

                      {canCancel ? (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() =>
                            setConfirmCancelOrderId((prev) =>
                              prev === order.id ? null : order.id
                            )
                          }
                          className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[#FECACA] bg-white px-4 text-sm font-semibold text-[#B91C1C] transition-colors hover:bg-[#FEF2F2] disabled:opacity-60"
                        >
                          Batalkan PO
                        </button>
                      ) : null}
                    </div>

                    {isConfirmingCancel ? (
                      <div
                        role="region"
                        aria-label={`Konfirmasi pembatalan ${order.orderCode}`}
                        className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-3"
                      >
                        <p className="text-sm font-medium text-[#991B1B]">
                          Batalkan PO <span className="font-data font-bold">{order.orderCode}</span>?
                          Kuota <span className="font-data font-bold">{order.totalBoxes} box</span>{" "}
                          akan dikembalikan ke tanggal {order.deliveryDate}.
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmCancelOrderId(null)}
                            className="inline-flex min-h-[44px] items-center rounded-lg border border-[#CBD5E1] bg-white px-3.5 text-sm font-semibold text-[#0F172A] hover:bg-slate-50"
                          >
                            Tidak
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleStatusTransition(order.id, "DIBATALKAN")}
                            className="inline-flex min-h-[44px] items-center rounded-lg bg-[#DC2626] px-4 text-sm font-semibold text-white hover:bg-[#B91C1C] disabled:opacity-60"
                          >
                            {isBusy ? "Membatalkan..." : "Ya, Batalkan PO"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : (
        <section aria-label="Daftar Belanja dan Prep BOM" className="space-y-5">
          {/* Date Range + Presets */}
          <div className="space-y-4 rounded-xl border border-[#CBD5E1] bg-white p-5 shadow-xs">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="bom-from"
                    className="mb-1.5 block text-xs font-semibold text-[#0F172A]"
                  >
                    Tanggal Mulai
                  </label>
                  <input
                    id="bom-from"
                    type="date"
                    value={bomFrom}
                    onChange={(e) => handleBomRangeChange(e.target.value, bomTo)}
                    className="font-data min-h-[44px] w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 text-sm text-[#0F172A]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="bom-to"
                    className="mb-1.5 block text-xs font-semibold text-[#0F172A]"
                  >
                    Tanggal Akhir
                  </label>
                  <input
                    id="bom-to"
                    type="date"
                    value={bomTo}
                    onChange={(e) => handleBomRangeChange(bomFrom, e.target.value)}
                    className="font-data min-h-[44px] w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 text-sm text-[#0F172A]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-[#475569]">Preset Cepat</p>
                <div className="flex flex-wrap gap-2">
                  {BOM_PRESETS.map((preset) => {
                    const isActive = bomFrom === preset.from && bomTo === preset.to;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handleBomRangeChange(preset.from, preset.to)}
                        className={`font-data inline-flex min-h-[44px] items-center rounded-lg border px-3.5 text-xs font-semibold transition-colors ${
                          isActive
                            ? "border-[#C2410C] bg-[#FFF7ED] text-[#C2410C]"
                            : "border-[#CBD5E1] bg-white text-[#0F172A] hover:bg-slate-50"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <p className="text-xs text-[#475569]">
              Agregasi otomatis menghitung PO berstatus{" "}
              <strong className="text-[#0F172A]">Terjadwal</strong>,{" "}
              <strong className="text-[#0F172A]">Diproduksi</strong>, dan{" "}
              <strong className="text-[#0F172A]">Siap Kirim</strong> pada rentang tanggal{" "}
              <span className="font-data font-semibold text-[#0F172A]">
                {bomFrom} s/d {bomTo}
              </span>
              .
            </p>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 shadow-xs">
              <p className="text-xs font-semibold text-[#475569]">Total Jenis Bahan &amp; Kemasan</p>
              <p className="font-data mt-1 text-2xl font-bold text-[#0F172A]">
                {shoppingItems.length} item
              </p>
            </div>
            <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 shadow-xs">
              <p className="text-xs font-semibold text-[#475569]">Bahan Baku vs Kemasan</p>
              <p className="font-data mt-1 text-sm font-bold text-[#0F172A]">
                {formatIdr(bomSummary.rawCostIdr)}{" "}
                <span className="font-normal text-[#475569]">/</span>{" "}
                {formatIdr(bomSummary.packagingCostIdr)}
              </p>
            </div>
            <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 shadow-xs">
              <p className="text-xs font-semibold text-[#475569]">Total Estimasi Biaya Bahan</p>
              <p className="font-data mt-1 text-2xl font-bold text-[#C2410C]">
                {formatIdr(bomSummary.totalCostIdr)}
              </p>
            </div>
          </div>

          {/* BOM Table */}
          <div className="overflow-hidden rounded-xl border border-[#CBD5E1] bg-white shadow-xs">
            {isBomLoading ? (
              <div className="p-8 text-center text-sm text-[#475569]">
                Menghitung agregasi kebutuhan bahan...
              </div>
            ) : shoppingItems.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm font-semibold text-[#0F172A]">
                  Belum ada kebutuhan bahan pada rentang tanggal ini.
                </p>
                <p className="mt-1 text-xs text-[#475569]">
                  Pastikan terdapat PO berstatus Terjadwal, Diproduksi, atau Siap Kirim pada tanggal
                  tersebut.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#CBD5E1] bg-[#F8FAFC] text-xs font-bold tracking-wide text-[#475569] uppercase">
                      <th className="px-4 py-3">Nama Bahan / Kemasan</th>
                      <th className="px-4 py-3">Kategori</th>
                      <th className="px-4 py-3 text-right">Total Kebutuhan</th>
                      <th className="px-4 py-3 text-right">Estimasi Biaya</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {shoppingItems.map((item) => {
                      const isRaw = item.category === "BAHAN_BAKU";
                      return (
                        <tr
                          key={`${item.category}-${item.ingredientName}-${item.unit}`}
                          className="hover:bg-slate-50"
                        >
                          <td className="px-4 py-3 font-medium text-[#0F172A]">
                            {item.ingredientName}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                isRaw
                                  ? "border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C]"
                                  : "border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]"
                              }`}
                            >
                              {isRaw ? "Bahan Baku" : "Kemasan"}
                            </span>
                          </td>
                          <td className="font-data px-4 py-3 text-right font-semibold text-[#0F172A]">
                            {item.totalQty.toLocaleString("id-ID")} {item.unit}
                          </td>
                          <td className="font-data px-4 py-3 text-right font-semibold text-[#0F172A]">
                            {formatIdr(item.estimatedCostIdr)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[#CBD5E1] bg-[#F8FAFC]">
                      <td colSpan={3} className="px-4 py-3.5 text-right font-bold text-[#0F172A]">
                        Total Estimasi Biaya Bahan
                      </td>
                      <td className="font-data px-4 py-3.5 text-right text-base font-bold text-[#C2410C]">
                        {formatIdr(bomSummary.totalCostIdr)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
