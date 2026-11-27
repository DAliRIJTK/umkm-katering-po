"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type {
  DailyCapacityInfo,
  MenuPackage,
  PackageCategory,
  PublicSettings,
} from "@/lib/domain/types";
import { CATEGORY_LABELS, formatIdr, formatMinDp } from "@/lib/format";

interface Props {
  initialSettings: PublicSettings;
  initialPackages: MenuPackage[];
  initialCapacities: DailyCapacityInfo[];
}

export function PublicCatalogClient({
  initialSettings,
  initialPackages,
  initialCapacities,
}: Props) {
  const [selectedCategory, setSelectedCategory] = useState<"ALL" | PackageCategory>("ALL");
  const [cartQty, setCartQty] = useState<Record<number, number>>(() => {
    const first = initialPackages[0];
    return first ? { [first.id]: first.minOrderQty } : {};
  });

  const [deliveryDate, setDeliveryDate] = useState<string>(
    initialCapacities[1]?.date || "2026-11-28"
  );
  const [deliveryTime, setDeliveryTime] = useState<string>("09:00");
  const [capacityInfo, setCapacityInfo] = useState<DailyCapacityInfo | null>(
    initialCapacities.find((c) => c.date === "2026-11-28") || initialCapacities[0] || null
  );
  const [loadingCap, setLoadingCap] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [institutionName, setInstitutionName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdOrder, setCreatedOrder] = useState<{
    orderCode: string;
    totalIdr: number;
    minDpIdr: number;
    deliveryDate: string;
    deliveryTime: string;
  } | null>(null);

  const filteredPackages = useMemo(() => {
    if (selectedCategory === "ALL") return initialPackages;
    return initialPackages.filter((p) => p.category === selectedCategory);
  }, [initialPackages, selectedCategory]);

  const selectedItems = useMemo(() => {
    return initialPackages
      .filter((pkg) => pkg.id in cartQty)
      .map((pkg) => ({
        pkg,
        qty: cartQty[pkg.id] ?? 0,
      }));
  }, [initialPackages, cartQty]);

  const totals = useMemo(() => {
    const totalBoxes = selectedItems.reduce((sum, item) => sum + item.qty, 0);
    const totalIdr = selectedItems.reduce((sum, item) => sum + item.qty * item.pkg.priceIdr, 0);
    const minDpIdr = formatMinDp(totalIdr, initialSettings.minDpPercent);
    const remainingIdr = Math.max(0, totalIdr - minDpIdr);
    return { totalBoxes, totalIdr, minDpIdr, remainingIdr };
  }, [selectedItems, initialSettings.minDpPercent]);

  const minQtyWarnings = useMemo(() => {
    return selectedItems.filter((item) => item.qty < item.pkg.minOrderQty);
  }, [selectedItems]);

  async function refreshCapacity(nextDate: string) {
    setDeliveryDate(nextDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) return;
    setLoadingCap(true);
    try {
      const res = await fetch(`/api/capacity?date=${encodeURIComponent(nextDate)}`);
      if (res.ok) {
        const data = (await res.json()) as DailyCapacityInfo;
        setCapacityInfo(data);
      }
    } finally {
      setLoadingCap(false);
    }
  }

  function setPackageCount(pkg: MenuPackage, nextCount: number, remove = false) {
    setCreatedOrder(null);
    setErrorMsg(null);
    setCartQty((prev) => {
      const next = { ...prev };
      if (remove) {
        delete next[pkg.id];
      } else {
        next[pkg.id] = Math.max(0, Math.min(5000, nextCount));
      }
      return next;
    });
  }

  async function handleSubmitOrder(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setCreatedOrder(null);

    if (selectedItems.length === 0) {
      setErrorMsg("Pilih minimal 1 paket menu pada kalkulator sebelum mengajukan pre-order.");
      return;
    }
    if (minQtyWarnings.length > 0) {
      const first = minQtyWarnings[0];
      setErrorMsg(
        `Jumlah untuk ${first.pkg.name} minimal ${first.pkg.minOrderQty} ${first.pkg.unitLabel}.`
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          institutionName,
          customerPhone,
          deliveryAddress,
          deliveryDate,
          deliveryTime,
          notes,
          items: selectedItems.map((i) => ({ packageId: i.pkg.id, qty: i.qty })),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorMsg(json.error || "Gagal mengajukan pre-order.");
        return;
      }
      setCreatedOrder({
        orderCode: json.order.orderCode,
        totalIdr: json.order.totalIdr,
        minDpIdr: json.order.minDpIdr,
        deliveryDate: json.order.deliveryDate,
        deliveryTime: json.order.deliveryTime,
      });
      setCartQty({});
      setCustomerName("");
      setInstitutionName("");
      setCustomerPhone("");
      setDeliveryAddress("");
      setNotes("");
      await refreshCapacity(deliveryDate);
    } catch {
      setErrorMsg("Koneksi ke server lokal gagal. Coba beberapa saat lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  const exceedsCapacity =
    capacityInfo !== null && totals.totalBoxes > 0 && totals.totalBoxes > capacityInfo.remainingBoxes;

  return (
    <>
      <section className="border-b border-[#E5D3C8] bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:items-center lg:py-16">
          <div className="lg:col-span-8">
            <h1 className="font-display text-3xl leading-tight font-bold tracking-tight text-[#0F172A] sm:text-5xl">
              Nasi Kotak &amp; Snack Box Acara Tepat Waktu.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-[#574337] sm:text-lg">
              {initialSettings.businessName} melayani pesanan rapat kantor, pengajian, dan syukuran di{" "}
              {initialSettings.addressArea}. Cek sisa kapasitas masak harian sebelum memesan dan
              pantau progres produksi langsung lewat kode PO.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a
                href="#kalkulator"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#C2410C] px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#9A3412]"
              >
                Hitung Estimasi Paket
              </a>
              <Link
                href="/lacak"
                className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-[#CBD5E1] bg-white px-5 py-2.5 text-sm font-semibold text-[#0F172A] transition-colors hover:bg-[#FDF4F0]"
              >
                Lacak Kode PO
              </Link>
            </div>
          </div>

          <aside className="rounded-2xl border border-[#E5D3C8] bg-[#FFF7ED] p-6 lg:col-span-4">
            <p className="text-xs font-semibold tracking-wide text-[#574337] uppercase">
              Kapasitas Dapur Harian
            </p>
            <p className="font-data mt-1 text-3xl font-bold text-[#C2410C]">
              {initialSettings.dailyCapacityBoxes} box/hari
            </p>
            <dl className="mt-5 space-y-3 border-t border-[#E5D3C8] pt-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#574337]">Syarat Masuk Jadwal Masak</dt>
                <dd className="font-data font-bold text-[#0F172A]">
                  DP {initialSettings.minDpPercent}%
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#574337]">Pelunasan Tagihan</dt>
                <dd className="font-semibold text-[#0F172A]">Sebelum Kirim</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="text-[#574337]">Kontak Dapur</dt>
                <dd className="font-data font-semibold text-[#0F172A]">
                  {initialSettings.whatsappNumber}
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      <section id="katalog" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold text-[#0F172A] sm:text-3xl">
              Pilihan Paket Katering
            </h2>
            <p className="mt-1 text-sm text-[#574337]">
              Semua harga sudah termasuk kemasan rapi, sendok, tisu, dan persiapan higienis.
            </p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter kategori paket">
            {(
              [
                ["ALL", "Semua Paket"],
                ["NASI_KOTAK", "Nasi Kotak"],
                ["SNACK_BOX", "Snack Box"],
                ["TUMPENG_PRASMANAN", "Bento & Syukuran"],
              ] as const
            ).map(([cat, label]) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`min-h-[44px] cursor-pointer rounded-xl px-4 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-[#C2410C] text-white"
                      : "border border-[#E5D3C8] bg-white text-[#574337] hover:bg-[#FDF4F0] hover:text-[#0F172A]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {filteredPackages.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-[#E5D3C8] bg-white p-8 text-center">
            <p className="text-sm font-semibold text-[#0F172A]">
              Belum ada paket aktif pada kategori ini.
            </p>
            <button
              type="button"
              onClick={() => setSelectedCategory("ALL")}
              className="mt-3 min-h-[44px] cursor-pointer rounded-xl bg-[#C2410C] px-4 text-sm font-bold text-white hover:bg-[#9A3412]"
            >
              Tampilkan Semua Paket
            </button>
          </div>
        ) : (
          <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredPackages.map((pkg) => {
              const inCart = pkg.id in cartQty;
              const qty = cartQty[pkg.id] ?? 0;
              return (
                <article
                  key={pkg.id}
                  className="flex flex-col justify-between rounded-2xl border border-[#E5D3C8] bg-white p-5 transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-full bg-[#FFEDD5] px-3 py-1 text-xs font-semibold text-[#C2410C]">
                        {CATEGORY_LABELS[pkg.category]}
                      </span>
                      <span className="text-xs font-medium text-[#574337]">
                        Min. {pkg.minOrderQty} {pkg.unitLabel}
                      </span>
                    </div>
                    <h3 className="mt-3 text-lg font-bold text-[#0F172A]">{pkg.name}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[#574337]">
                      {pkg.description}
                    </p>

                    {pkg.ingredients.length > 0 && (
                      <ul className="mt-4 space-y-1 border-t border-[#F3E6DC] pt-3 text-xs text-[#574337]">
                        {pkg.ingredients.slice(0, 4).map((ing) => (
                          <li key={ing.id} className="flex items-center justify-between gap-2">
                            <span>{ing.ingredientName}</span>
                            <span className="font-data text-[#0F172A]">
                              {ing.qtyPerBox} {ing.unit}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-[#F3E6DC] pt-4">
                    <div>
                      <p className="font-data text-lg font-bold text-[#C2410C]">
                        {formatIdr(pkg.priceIdr)}
                      </p>
                      <p className="text-xs text-[#574337]">per {pkg.unitLabel}</p>
                    </div>

                    {!inCart ? (
                      <button
                        type="button"
                        onClick={() => setPackageCount(pkg, pkg.minOrderQty)}
                        className="min-h-[44px] cursor-pointer rounded-xl border border-[#EA580C] bg-[#FFF7ED] px-4 text-sm font-bold text-[#C2410C] transition-colors hover:bg-[#C2410C] hover:text-white"
                      >
                        + Tambah ke Hitungan
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label={`Kurangi ${pkg.name}`}
                          onClick={() =>
                            setPackageCount(
                              pkg,
                              qty <= pkg.minOrderQty ? 0 : qty - 5,
                              qty <= pkg.minOrderQty
                            )
                          }
                          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-base font-bold text-[#0F172A] hover:bg-[#F8FAFC]"
                        >
                          -
                        </button>
                        <span className="font-data min-w-[3.2rem] text-center text-sm font-bold text-[#0F172A]">
                          {qty}
                        </span>
                        <button
                          type="button"
                          aria-label={`Tambah ${pkg.name}`}
                          onClick={() => setPackageCount(pkg, qty + 5)}
                          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg bg-[#C2410C] text-base font-bold text-white hover:bg-[#9A3412]"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section id="kalkulator" className="border-t border-[#E5D3C8] bg-white py-12">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <h2 className="font-display text-2xl font-bold text-[#0F172A]">
              Kalkulator Estimasi &amp; Kuota
            </h2>
            <p className="mt-1 text-sm text-[#574337]">
              Sesuaikan jumlah porsi dan periksa ketersediaan kuota dapur pada tanggal acara Anda.
            </p>

            <div className="mt-5 rounded-2xl border border-[#E5D3C8] bg-[#FFF7ED] p-5">
              <label htmlFor="calc-date" className="block text-sm font-semibold text-[#0F172A]">
                Tanggal Pengiriman Acara
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id="calc-date"
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => refreshCapacity(e.target.value)}
                  className="min-h-[44px] flex-1 rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm font-medium text-[#0F172A]"
                />
                {initialCapacities.map((slot) => (
                  <button
                    key={slot.date}
                    type="button"
                    onClick={() => refreshCapacity(slot.date)}
                    className={`min-h-[44px] cursor-pointer rounded-xl px-3 text-xs font-semibold ${
                      deliveryDate === slot.date
                        ? "bg-[#0F172A] text-white"
                        : "border border-[#CBD5E1] bg-white text-[#574337] hover:bg-[#F8FAFC]"
                    }`}
                  >
                    {slot.date.slice(5)}
                  </button>
                ))}
              </div>

              {capacityInfo && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-[#574337]">
                      {loadingCap ? "Memeriksa slot..." : `Slot ${capacityInfo.date}`}
                    </span>
                    <span className="font-data text-[#0F172A]">
                      Sisa {capacityInfo.remainingBoxes} / {capacityInfo.capacityBoxes} box
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
                    <div
                      className={`h-full rounded-full ${
                        capacityInfo.utilizationPct >= 85 ? "bg-[#DC2626]" : "bg-[#EA580C]"
                      }`}
                      style={{ width: `${capacityInfo.utilizationPct}%` }}
                    />
                  </div>
                  {exceedsCapacity && (
                    <p className="mt-2 text-xs font-semibold text-[#DC2626]">
                      Total pesanan Anda ({totals.totalBoxes} box) melebihi sisa kuota tanggal ini.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 rounded-2xl border border-[#E5D3C8] bg-[#FDF4F0] p-5">
              <h3 className="text-sm font-bold text-[#0F172A]">Ringkasan Pilihan Paket</h3>
              {selectedItems.length === 0 ? (
                <p className="mt-3 text-sm text-[#574337]">
                  Belum ada paket dipilih. Klik tombol &ldquo;+ Tambah ke Hitungan&rdquo; pada
                  daftar paket di atas.
                </p>
              ) : (
                <div className="mt-3">
                  <div className="divide-y divide-[#E5D3C8]">
                    {selectedItems.map(({ pkg, qty }) => (
                      <div
                        key={pkg.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0"
                      >
                        <div className="min-w-[160px] flex-1">
                          <p className="text-sm font-semibold text-[#0F172A]">{pkg.name}</p>
                          <p className="font-data text-xs text-[#574337]">
                            {formatIdr(pkg.priceIdr)} × {qty} ={" "}
                            <strong className="text-[#0F172A]">
                              {formatIdr(qty * pkg.priceIdr)}
                            </strong>
                          </p>
                          {qty < pkg.minOrderQty && (
                            <p className="text-xs font-semibold text-[#DC2626]">
                              Minimal {pkg.minOrderQty} {pkg.unitLabel}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            max={5000}
                            aria-label={`Jumlah box ${pkg.name}`}
                            value={qty}
                            onChange={(e) => {
                              const val = e.target.value === "" ? 0 : Number(e.target.value);
                              setPackageCount(pkg, Number.isFinite(val) ? val : 0);
                            }}
                            className="font-data min-h-[44px] w-20 rounded-lg border border-[#CBD5E1] bg-white px-2 text-center text-sm font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => setPackageCount(pkg, 0, true)}
                            className="min-h-[44px] cursor-pointer rounded-lg px-2.5 text-xs font-semibold text-[#B91C1C] hover:bg-[#FEE2E2]"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <dl className="space-y-2 border-t border-[#E5D3C8] pt-3 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-[#574337]">Total Porsi</dt>
                      <dd className="font-data font-bold text-[#0F172A]">
                        {totals.totalBoxes} box
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#574337]">Estimasi Total Tagihan</dt>
                      <dd className="font-data text-base font-bold text-[#0F172A]">
                        {formatIdr(totals.totalIdr)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="font-semibold text-[#C2410C]">
                        Minimal DP {initialSettings.minDpPercent}% (Jadwal Masak)
                      </dt>
                      <dd className="font-data font-bold text-[#C2410C]">
                        {formatIdr(totals.minDpIdr)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-[#574337]">Sisa Pelunasan Sebelum Kirim</dt>
                      <dd className="font-data font-semibold text-[#574337]">
                        {formatIdr(totals.remainingIdr)}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-7">
            <form
              onSubmit={handleSubmitOrder}
              className="rounded-2xl border border-[#E5D3C8] bg-[#FFFBF7] p-6 sm:p-8"
            >
              <h3 className="font-display text-xl font-bold text-[#0F172A]">
                Ajukan Pre-Order Acara
              </h3>
              <p className="mt-1 text-sm text-[#574337]">
                Pesanan langsung dicatat dengan status <strong>Menunggu DP</strong> dan mendapatkan
                kode PO unik untuk pelacakan.
              </p>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="po-name" className="block text-sm font-semibold text-[#0F172A]">
                    Nama Pemesan *
                  </label>
                  <input
                    id="po-name"
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Contoh: Ibu Rina"
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="po-inst" className="block text-sm font-semibold text-[#0F172A]">
                    Instansi / Acara (Opsional)
                  </label>
                  <input
                    id="po-inst"
                    type="text"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    placeholder="Contoh: Pengajian RW 04 / Rapat Divisi"
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="po-phone" className="block text-sm font-semibold text-[#0F172A]">
                    Nomor HP / WhatsApp *
                  </label>
                  <input
                    id="po-phone"
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="081234567890"
                    className="font-data mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="po-time" className="block text-sm font-semibold text-[#0F172A]">
                    Jam Tiba Acara (WIB) *
                  </label>
                  <input
                    id="po-time"
                    type="time"
                    required
                    value={deliveryTime}
                    onChange={(e) => setDeliveryTime(e.target.value)}
                    className="font-data mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label htmlFor="po-addr" className="block text-sm font-semibold text-[#0F172A]">
                  Alamat Pengantaran Lengkap *
                </label>
                <textarea
                  id="po-addr"
                  required
                  rows={2}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Nama jalan, gedung/patokan, kecamatan"
                  className="mt-1.5 w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-sm"
                />
              </div>

              <div className="mt-4">
                <label htmlFor="po-notes" className="block text-sm font-semibold text-[#0F172A]">
                  Catatan Khusus Dapur (Opsional)
                </label>
                <input
                  id="po-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contoh: Sambal dipisah, tanpa kacang"
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
                />
              </div>

              {errorMsg && (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm font-medium text-[#B91C1C]"
                >
                  {errorMsg}
                </div>
              )}

              {createdOrder && (
                <div
                  role="status"
                  className="mt-4 rounded-xl border border-[#A7F3D0] bg-[#ECFDF5] p-4 text-sm text-[#065F46]"
                >
                  <p className="font-bold">
                    Pre-Order berhasil dicatat! Kode PO:{" "}
                    <span className="font-data">{createdOrder.orderCode}</span>
                  </p>
                  <p className="mt-1">
                    Jadwal: {createdOrder.deliveryDate} pukul {createdOrder.deliveryTime} WIB.
                    Segera konfirmasi DP minimal{" "}
                    <strong className="font-data">{formatIdr(createdOrder.minDpIdr)}</strong> dari
                    total <strong className="font-data">{formatIdr(createdOrder.totalIdr)}</strong>.
                  </p>
                  <Link
                    href={`/lacak?code=${encodeURIComponent(createdOrder.orderCode)}`}
                    className="mt-2 inline-flex min-h-[44px] items-center font-semibold text-[#047857] underline"
                  >
                    Buka halaman Lacak PO &rarr;
                  </Link>
                </div>
              )}

              <div className="mt-6">
                <button
                  type="submit"
                  disabled={submitting || exceedsCapacity}
                  className="min-h-[48px] w-full cursor-pointer rounded-xl bg-[#C2410C] px-6 text-sm font-bold text-white transition-colors hover:bg-[#9A3412] disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {submitting
                    ? "Menyimpan Pre-Order..."
                    : "Ajukan Pre-Order (Simpan ke Antrean Menunggu DP)"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}
