"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  CashRecap,
  IngredientCategory,
  MenuPackage,
  PackageCategory,
  PublicSettings,
} from "@/lib/domain/types";
import { CATEGORY_LABELS, formatIdr } from "@/lib/format";

interface IngredientDraft {
  ingredientName: string;
  category: IngredientCategory;
  qtyPerBox: string;
  unit: string;
  estimatedUnitCostIdr: string;
}

function createEmptyIngredient(): IngredientDraft {
  return {
    ingredientName: "",
    category: "BAHAN_BAKU",
    qtyPerBox: "1",
    unit: "porsi",
    estimatedUnitCostIdr: "0",
  };
}

export function AdminConsole() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  const [pinInput, setPinInput] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [cashRecap, setCashRecap] = useState<CashRecap | null>(null);
  const [packages, setPackages] = useState<MenuPackage[]>([]);

  // Settings form state
  const [dailyCapacityBoxes, setDailyCapacityBoxes] = useState("200");
  const [minDpPercent, setMinDpPercent] = useState("30");
  const [businessName, setBusinessName] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [addressArea, setAddressArea] = useState("");
  const [newPin, setNewPin] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsFeedback, setSettingsFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Package toggle & create state
  const [togglingPkgId, setTogglingPkgId] = useState<number | null>(null);
  const [packageListFeedback, setPackageListFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const [pkgCode, setPkgCode] = useState("");
  const [pkgName, setPkgName] = useState("");
  const [pkgCategory, setPkgCategory] = useState<PackageCategory>("NASI_KOTAK");
  const [pkgDescription, setPkgDescription] = useState("");
  const [pkgUnitLabel, setPkgUnitLabel] = useState("box");
  const [pkgPriceIdr, setPkgPriceIdr] = useState("");
  const [pkgMinOrderQty, setPkgMinOrderQty] = useState("15");
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([
    createEmptyIngredient(),
  ]);
  const [creatingPkg, setCreatingPkg] = useState(false);
  const [createPkgFeedback, setCreatePkgFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const applySettingsToForm = useCallback((settings: PublicSettings) => {
    setDailyCapacityBoxes(String(settings.dailyCapacityBoxes));
    setMinDpPercent(String(settings.minDpPercent));
    setBusinessName(settings.businessName);
    setWhatsappNumber(settings.whatsappNumber);
    setAddressArea(settings.addressArea);
  }, []);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    setOverviewError(null);
    try {
      const res = await fetch("/api/admin/overview", { cache: "no-store" });
      const data = await res.json();
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!res.ok) {
        setOverviewError(data.error || "Gagal memuat ringkasan Admin.");
        return;
      }
      applySettingsToForm(data.settings as PublicSettings);
      setCashRecap(data.cashRecap as CashRecap);
      setPackages((data.packages ?? []) as MenuPackage[]);
    } catch {
      setOverviewError("Gagal menghubungi server untuk memuat data Admin.");
    } finally {
      setLoadingOverview(false);
    }
  }, [applySettingsToForm]);

  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const res = await fetch("/api/admin/session", { cache: "no-store" });
        const data = await res.json();
        if (!active) return;
        const isAuth = Boolean(data.authenticated);
        setAuthenticated(isAuth);
        if (isAuth) {
          void loadOverview();
        }
      } catch {
        if (active) {
          setAuthenticated(false);
        }
      } finally {
        if (active) {
          setCheckingSession(false);
        }
      }
    }
    void check();
    return () => {
      active = false;
    };
  }, [loadOverview]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "PIN Admin tidak valid.");
        return;
      }
      setPinInput("");
      setAuthenticated(true);
      await loadOverview();
    } catch {
      setLoginError("Gagal terhubung ke server untuk verifikasi PIN.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    setLogoutLoading(true);
    try {
      await fetch("/api/admin/session", { method: "POST" });
    } finally {
      setAuthenticated(false);
      setCashRecap(null);
      setPackages([]);
      setLogoutLoading(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsFeedback(null);
    setSavingSettings(true);
    try {
      const payload: Record<string, unknown> = {
        dailyCapacityBoxes: Number(dailyCapacityBoxes),
        minDpPercent: Number(minDpPercent),
        businessName: businessName.trim(),
        whatsappNumber: whatsappNumber.trim(),
        addressArea: addressArea.trim(),
      };
      if (newPin.trim() !== "") {
        payload.newPin = newPin.trim();
      }

      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.status === 401) {
        setAuthenticated(false);
        setLoginError(data.error || "Sesi Admin berakhir. Silakan masuk ulang.");
        return;
      }
      if (!res.ok) {
        setSettingsFeedback({
          type: "error",
          message: data.error || "Gagal menyimpan pengaturan.",
        });
        return;
      }

      applySettingsToForm(data.settings as PublicSettings);
      const pinChanged = newPin.trim() !== "";
      setNewPin("");
      setSettingsFeedback({
        type: "success",
        message: pinChanged
          ? "Pengaturan operasional dan PIN Admin baru berhasil disimpan."
          : "Pengaturan operasional dapur berhasil diperbarui.",
      });
    } catch {
      setSettingsFeedback({
        type: "error",
        message: "Gagal menghubungi server saat menyimpan pengaturan.",
      });
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleTogglePackage(pkg: MenuPackage) {
    setTogglingPkgId(pkg.id);
    setPackageListFeedback(null);
    try {
      const res = await fetch(`/api/admin/packages/${pkg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !pkg.isActive }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setAuthenticated(false);
        setLoginError(data.error || "Sesi Admin berakhir. Silakan masuk ulang.");
        return;
      }
      if (!res.ok) {
        setPackageListFeedback({
          type: "error",
          message: data.error || "Gagal mengubah status paket.",
        });
        return;
      }
      const updated = data.package as MenuPackage;
      setPackages((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setPackageListFeedback({
        type: "success",
        message: `Paket ${updated.name} kini berstatus ${updated.isActive ? "Aktif" : "Nonaktif"}.`,
      });
    } catch {
      setPackageListFeedback({
        type: "error",
        message: "Gagal menghubungi server saat mengubah status paket.",
      });
    } finally {
      setTogglingPkgId(null);
    }
  }

  function updateIngredientRow(index: number, patch: Partial<IngredientDraft>) {
    setIngredients((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row))
    );
  }

  function removeIngredientRow(index: number) {
    setIngredients((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== index)));
  }

  async function handleCreatePackage(e: React.FormEvent) {
    e.preventDefault();
    setCreatePkgFeedback(null);
    setCreatingPkg(true);

    try {
      const payload = {
        code: pkgCode.trim().toUpperCase(),
        name: pkgName.trim(),
        category: pkgCategory,
        description: pkgDescription.trim(),
        unitLabel: pkgUnitLabel.trim() || "box",
        priceIdr: Number(pkgPriceIdr),
        minOrderQty: Number(pkgMinOrderQty),
        ingredients: ingredients.map((row) => ({
          ingredientName: row.ingredientName.trim(),
          category: row.category,
          qtyPerBox: Number(row.qtyPerBox),
          unit: row.unit.trim(),
          estimatedUnitCostIdr: Number(row.estimatedUnitCostIdr || 0),
        })),
      };

      const res = await fetch("/api/admin/packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.status === 401) {
        setAuthenticated(false);
        setLoginError(data.error || "Sesi Admin berakhir. Silakan masuk ulang.");
        return;
      }
      if (!res.ok) {
        setCreatePkgFeedback({
          type: "error",
          message: data.error || "Gagal menambahkan paket baru.",
        });
        return;
      }

      const created = data.package as MenuPackage;
      setPackages((prev) => [...prev, created]);
      setPkgCode("");
      setPkgName("");
      setPkgCategory("NASI_KOTAK");
      setPkgDescription("");
      setPkgUnitLabel("box");
      setPkgPriceIdr("");
      setPkgMinOrderQty("15");
      setIngredients([createEmptyIngredient()]);
      setCreatePkgFeedback({
        type: "success",
        message: `Paket ${created.code} (${created.name}) beserta ${created.ingredients.length} komponen BOM berhasil ditambahkan.`,
      });
    } catch {
      setCreatePkgFeedback({
        type: "error",
        message: "Gagal menghubungi server saat menyimpan paket baru.",
      });
    } finally {
      setCreatingPkg(false);
    }
  }

  if (checkingSession) {
    return (
      <div className="rounded-2xl border border-[#CBD5E1] bg-white p-8 text-center text-sm text-[#475569]">
        Memeriksa sesi Admin...
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl border border-[#CBD5E1] bg-white p-6 sm:p-8">
          <p className="text-xs font-bold tracking-wider text-[#C2410C] uppercase">
            Area Terproteksi
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold text-[#0F172A]">
            Masuk Konsol Admin
          </h1>
          <p className="mt-2 text-sm text-[#475569]">
            Masukkan PIN Admin untuk mengelola rekap kas, kapasitas harian dapur, persentase DP, serta katalog paket dan BOM.
          </p>
          <p className="mt-2 rounded-xl border border-slate-200 bg-[#F8FAFC] px-3.5 py-2.5 text-xs text-[#475569]">
            PIN demo lokal default adalah{" "}
            <strong className="font-data text-[#0F172A]">271127</strong> bila belum diubah.
          </p>

          <form onSubmit={(e) => void handleLogin(e)} className="mt-5 space-y-4">
            <div>
              <label htmlFor="admin-pin" className="block text-sm font-semibold text-[#0F172A]">
                PIN Admin (4-8 digit)
              </label>
              <input
                id="admin-pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                required
                minLength={4}
                maxLength={8}
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="Masukkan PIN Admin"
                className="font-data mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm tracking-widest"
              />
            </div>

            {loginError && (
              <div
                role="alert"
                className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm font-medium text-[#B91C1C]"
              >
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="min-h-[44px] w-full cursor-pointer rounded-xl bg-[#C2410C] px-5 text-sm font-bold text-white transition-colors hover:bg-[#9A3412] disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {loginLoading ? "Memverifikasi PIN..." : "Masuk Admin"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-wider text-[#C2410C] uppercase">
            Kontrol Pemilik &amp; Pengaturan Dapur
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold text-[#0F172A] sm:text-3xl">
            Konsol Admin DapurRantang
          </h1>
          <p className="mt-1 text-sm text-[#475569]">
            Pantau arus kas, piutang aktif, kuota kapasitas harian, dan resep BOM tiap paket menu.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadOverview()}
            disabled={loadingOverview}
            className="min-h-[44px] cursor-pointer rounded-xl border border-[#CBD5E1] bg-white px-4 text-sm font-semibold text-[#0F172A] transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loadingOverview ? "Memuat..." : "Muat Ulang"}
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={logoutLoading}
            className="min-h-[44px] cursor-pointer rounded-xl bg-[#0F172A] px-4 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {logoutLoading ? "Keluar..." : "Keluar (Logout)"}
          </button>
        </div>
      </div>

      {overviewError && (
        <div
          role="alert"
          className="rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-sm font-medium text-[#B91C1C]"
        >
          {overviewError}
        </div>
      )}

      {/* 1. Rekap Kas & Piutang */}
      <section aria-labelledby="heading-cash-recap" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="heading-cash-recap" className="text-lg font-bold text-[#0F172A]">
            Rekap Kas &amp; Piutang
          </h2>
          {cashRecap && (
            <p className="font-data text-xs font-medium text-[#475569]">
              {cashRecap.activeOrderCount} PO aktif (tidak termasuk PO dibatalkan)
            </p>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-[#CBD5E1] bg-white p-4">
            <p className="text-xs font-semibold text-[#475569] uppercase">Total Kas Masuk</p>
            <p className="font-data mt-1 text-xl font-bold text-[#047857]">
              {cashRecap ? formatIdr(cashRecap.totalCollectedIdr) : "-"}
            </p>
          </div>
          <div className="rounded-2xl border border-[#CBD5E1] bg-white p-4">
            <p className="text-xs font-semibold text-[#475569] uppercase">Transfer</p>
            <p className="font-data mt-1 text-xl font-bold text-[#0F172A]">
              {cashRecap ? formatIdr(cashRecap.byMethod.TRANSFER) : "-"}
            </p>
          </div>
          <div className="rounded-2xl border border-[#CBD5E1] bg-white p-4">
            <p className="text-xs font-semibold text-[#475569] uppercase">QRIS</p>
            <p className="font-data mt-1 text-xl font-bold text-[#0F172A]">
              {cashRecap ? formatIdr(cashRecap.byMethod.QRIS) : "-"}
            </p>
          </div>
          <div className="rounded-2xl border border-[#CBD5E1] bg-white p-4">
            <p className="text-xs font-semibold text-[#475569] uppercase">Tunai</p>
            <p className="font-data mt-1 text-xl font-bold text-[#0F172A]">
              {cashRecap ? formatIdr(cashRecap.byMethod.TUNAI) : "-"}
            </p>
          </div>
          <div className="rounded-2xl border border-[#CBD5E1] bg-white p-4">
            <p className="text-xs font-semibold text-[#475569] uppercase">Piutang Aktif</p>
            <p className="font-data mt-1 text-xl font-bold text-[#C2410C]">
              {cashRecap ? formatIdr(cashRecap.totalReceivableIdr) : "-"}
            </p>
          </div>
        </div>
      </section>

      {/* 2. Pengaturan Kapasitas, Minimal DP & Ganti PIN */}
      <section
        aria-labelledby="heading-settings"
        className="rounded-2xl border border-[#CBD5E1] bg-white p-5 sm:p-6"
      >
        <h2 id="heading-settings" className="text-lg font-bold text-[#0F172A]">
          Pengaturan Kapasitas, Minimal DP &amp; Ganti PIN
        </h2>
        <p className="mt-1 text-sm text-[#475569]">
          Perubahan kapasitas harian langsung memengaruhi kalkulator kuota pemesanan pelanggan.
        </p>

        <form onSubmit={(e) => void handleSaveSettings(e)} className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="set-capacity" className="block text-sm font-semibold text-[#0F172A]">
              Kapasitas Harian (Box)
            </label>
            <input
              id="set-capacity"
              type="number"
              min={10}
              max={10000}
              required
              value={dailyCapacityBoxes}
              onChange={(e) => setDailyCapacityBoxes(e.target.value)}
              className="font-data mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="set-dp" className="block text-sm font-semibold text-[#0F172A]">
              Minimal DP (%)
            </label>
            <input
              id="set-dp"
              type="number"
              min={1}
              max={100}
              required
              value={minDpPercent}
              onChange={(e) => setMinDpPercent(e.target.value)}
              className="font-data mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="set-business" className="block text-sm font-semibold text-[#0F172A]">
              Nama Usaha
            </label>
            <input
              id="set-business"
              type="text"
              maxLength={120}
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="set-wa" className="block text-sm font-semibold text-[#0F172A]">
              Nomor WhatsApp
            </label>
            <input
              id="set-wa"
              type="text"
              required
              value={whatsappNumber}
              onChange={(e) => setWhatsappNumber(e.target.value)}
              className="font-data mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="set-area" className="block text-sm font-semibold text-[#0F172A]">
              Area Layanan
            </label>
            <input
              id="set-area"
              type="text"
              maxLength={160}
              required
              value={addressArea}
              onChange={(e) => setAddressArea(e.target.value)}
              className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
            />
          </div>

          <div>
            <label htmlFor="set-new-pin" className="block text-sm font-semibold text-[#0F172A]">
              Ganti PIN Admin (Opsional)
            </label>
            <input
              id="set-new-pin"
              type="password"
              inputMode="numeric"
              minLength={4}
              maxLength={8}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="Kosongkan jika tidak ingin mengubah PIN"
              className="font-data mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
            />
          </div>

          {settingsFeedback && (
            <div
              role={settingsFeedback.type === "error" ? "alert" : "status"}
              className={`sm:col-span-2 rounded-xl border px-4 py-3 text-sm font-medium ${
                settingsFeedback.type === "error"
                  ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]"
                  : "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]"
              }`}
            >
              {settingsFeedback.message}
            </div>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={savingSettings}
              className="min-h-[44px] cursor-pointer rounded-xl bg-[#C2410C] px-6 text-sm font-bold text-white transition-colors hover:bg-[#9A3412] disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {savingSettings ? "Menyimpan Pengaturan..." : "Simpan Pengaturan"}
            </button>
          </div>
        </form>
      </section>

      {/* 3. Katalog Paket & BOM */}
      <section aria-labelledby="heading-packages" className="space-y-6">
        <div className="rounded-2xl border border-[#CBD5E1] bg-white p-5 sm:p-6">
          <h2 id="heading-packages" className="text-lg font-bold text-[#0F172A]">
            Katalog Paket &amp; BOM
          </h2>
          <p className="mt-1 text-sm text-[#475569]">
            Aktifkan atau nonaktifkan paket pada katalog publik, serta periksa komposisi bahan (BOM) per box.
          </p>

          {packageListFeedback && (
            <div
              role={packageListFeedback.type === "error" ? "alert" : "status"}
              className={`mt-4 rounded-xl border px-4 py-3 text-sm font-medium ${
                packageListFeedback.type === "error"
                  ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]"
                  : "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]"
              }`}
            >
              {packageListFeedback.message}
            </div>
          )}

          <div className="mt-4 space-y-4">
            {packages.map((pkg) => (
              <article
                key={pkg.id}
                className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-data rounded-md bg-white px-2 py-0.5 text-xs font-bold text-[#0F172A] ring-1 ring-[#CBD5E1]">
                        {pkg.code}
                      </span>
                      <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-[#0F172A]">
                        {CATEGORY_LABELS[pkg.category]}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          pkg.isActive
                            ? "border-[#A7F3D0] bg-[#D1FAE5] text-[#047857]"
                            : "border-slate-300 bg-slate-200 text-[#475569]"
                        }`}
                      >
                        {pkg.isActive ? "Aktif" : "Nonaktif"}
                      </span>
                    </div>
                    <h3 className="mt-2 text-base font-bold text-[#0F172A]">{pkg.name}</h3>
                    <p className="mt-1 text-xs text-[#475569]">{pkg.description}</p>
                    <p className="font-data mt-2 text-sm font-bold text-[#C2410C]">
                      {formatIdr(pkg.priceIdr)} / {pkg.unitLabel} · Min. {pkg.minOrderQty}{" "}
                      {pkg.unitLabel}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleTogglePackage(pkg)}
                    disabled={togglingPkgId === pkg.id}
                    className={`min-h-[44px] cursor-pointer rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                      pkg.isActive
                        ? "border border-[#CBD5E1] bg-white text-[#0F172A] hover:bg-slate-100"
                        : "bg-[#047857] text-white hover:bg-[#065F46]"
                    }`}
                  >
                    {togglingPkgId === pkg.id
                      ? "Memproses..."
                      : pkg.isActive
                        ? "Nonaktifkan Paket"
                        : "Aktifkan Paket"}
                  </button>
                </div>

                <div className="mt-3 border-t border-slate-200 pt-3">
                  <p className="text-xs font-bold tracking-wider text-[#475569] uppercase">
                    Komposisi BOM ({pkg.ingredients.length} bahan)
                  </p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {pkg.ingredients.map((ing) => (
                      <li
                        key={ing.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-[#0F172A]">{ing.ingredientName}</p>
                          <p className="text-[#475569]">
                            {ing.category === "BAHAN_BAKU" ? "Bahan Baku" : "Kemasan"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-data font-bold text-[#0F172A]">
                            {ing.qtyPerBox} {ing.unit}
                          </p>
                          <p className="font-data text-[#475569]">
                            {formatIdr(ing.estimatedUnitCostIdr)}/{ing.unit}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[#CBD5E1] bg-white p-5 sm:p-6">
          <h3 className="text-lg font-bold text-[#0F172A]">Tambah Paket Menu &amp; Resep BOM Baru</h3>
          <p className="mt-1 text-sm text-[#475569]">
            Setiap paket baru otomatis tersambung ke kalkulator order pelanggan dan daftar belanja dapur.
          </p>

          <form onSubmit={(e) => void handleCreatePackage(e)} className="mt-5 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor="pkg-code" className="block text-sm font-semibold text-[#0F172A]">
                  Kode Paket
                </label>
                <input
                  id="pkg-code"
                  type="text"
                  maxLength={32}
                  required
                  value={pkgCode}
                  onChange={(e) => setPkgCode(e.target.value.toUpperCase())}
                  placeholder="PKT-AYG"
                  className="font-data mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm uppercase"
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="pkg-name" className="block text-sm font-semibold text-[#0F172A]">
                  Nama Paket
                </label>
                <input
                  id="pkg-name"
                  type="text"
                  maxLength={120}
                  required
                  value={pkgName}
                  onChange={(e) => setPkgName(e.target.value)}
                  placeholder="Nasi Kotak Ayam Geprek Sambal Matah"
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
                />
              </div>

              <div>
                <label htmlFor="pkg-cat" className="block text-sm font-semibold text-[#0F172A]">
                  Kategori
                </label>
                <select
                  id="pkg-cat"
                  value={pkgCategory}
                  onChange={(e) => setPkgCategory(e.target.value as PackageCategory)}
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3 text-sm"
                >
                  <option value="NASI_KOTAK">Nasi Kotak</option>
                  <option value="SNACK_BOX">Snack Box</option>
                  <option value="TUMPENG_PRASMANAN">Bento &amp; Syukuran</option>
                </select>
              </div>

              <div>
                <label htmlFor="pkg-price" className="block text-sm font-semibold text-[#0F172A]">
                  Harga per Unit (IDR)
                </label>
                <input
                  id="pkg-price"
                  type="number"
                  min={1000}
                  required
                  value={pkgPriceIdr}
                  onChange={(e) => setPkgPriceIdr(e.target.value)}
                  placeholder="30000"
                  className="font-data mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pkg-min" className="block text-sm font-semibold text-[#0F172A]">
                    Min. Order
                  </label>
                  <input
                    id="pkg-min"
                    type="number"
                    min={1}
                    max={1000}
                    required
                    value={pkgMinOrderQty}
                    onChange={(e) => setPkgMinOrderQty(e.target.value)}
                    className="font-data mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="pkg-unit" className="block text-sm font-semibold text-[#0F172A]">
                    Satuan
                  </label>
                  <input
                    id="pkg-unit"
                    type="text"
                    maxLength={24}
                    required
                    value={pkgUnitLabel}
                    onChange={(e) => setPkgUnitLabel(e.target.value)}
                    className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 text-sm"
                  />
                </div>
              </div>

              <div className="sm:col-span-2 lg:col-span-3">
                <label htmlFor="pkg-desc" className="block text-sm font-semibold text-[#0F172A]">
                  Deskripsi Paket
                </label>
                <textarea
                  id="pkg-desc"
                  rows={2}
                  maxLength={400}
                  required
                  value={pkgDescription}
                  onChange={(e) => setPkgDescription(e.target.value)}
                  placeholder="Isian lauk, lalapan, sambal, dan kelengkapan kemasan..."
                  className="mt-1.5 min-h-[44px] w-full rounded-xl border border-[#CBD5E1] bg-white px-3.5 py-2.5 text-sm"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-[#0F172A]">
                    Daftar Komponen Bahan BOM per Box
                  </h4>
                  <p className="text-xs text-[#475569]">
                    Minimal 1 komponen bahan baku atau kemasan.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setIngredients((prev) => [...prev, createEmptyIngredient()])
                  }
                  className="min-h-[44px] cursor-pointer rounded-xl border border-[#CBD5E1] bg-white px-4 text-xs font-bold text-[#0F172A] transition-colors hover:bg-slate-100"
                >
                  + Tambah Komponen Bahan
                </button>
              </div>

              <div className="space-y-3">
                {ingredients.map((row, index) => (
                  <div
                    key={index}
                    className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-12 sm:items-end"
                  >
                    <div className="sm:col-span-3">
                      <label
                        htmlFor={`ing-name-${index}`}
                        className="block text-xs font-semibold text-[#0F172A]"
                      >
                        Nama Bahan
                      </label>
                      <input
                        id={`ing-name-${index}`}
                        type="text"
                        maxLength={120}
                        required
                        value={row.ingredientName}
                        onChange={(e) =>
                          updateIngredientRow(index, { ingredientName: e.target.value })
                        }
                        placeholder="Beras Pulen"
                        className="mt-1 min-h-[44px] w-full rounded-lg border border-[#CBD5E1] px-3 text-sm"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor={`ing-cat-${index}`}
                        className="block text-xs font-semibold text-[#0F172A]"
                      >
                        Kategori
                      </label>
                      <select
                        id={`ing-cat-${index}`}
                        value={row.category}
                        onChange={(e) =>
                          updateIngredientRow(index, {
                            category: e.target.value as IngredientCategory,
                          })
                        }
                        className="mt-1 min-h-[44px] w-full rounded-lg border border-[#CBD5E1] bg-white px-2.5 text-sm"
                      >
                        <option value="BAHAN_BAKU">Bahan Baku</option>
                        <option value="KEMASAN">Kemasan</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor={`ing-qty-${index}`}
                        className="block text-xs font-semibold text-[#0F172A]"
                      >
                        Takaran / Box
                      </label>
                      <input
                        id={`ing-qty-${index}`}
                        type="number"
                        min={1}
                        required
                        value={row.qtyPerBox}
                        onChange={(e) =>
                          updateIngredientRow(index, { qtyPerBox: e.target.value })
                        }
                        className="font-data mt-1 min-h-[44px] w-full rounded-lg border border-[#CBD5E1] px-3 text-sm"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor={`ing-unit-${index}`}
                        className="block text-xs font-semibold text-[#0F172A]"
                      >
                        Satuan
                      </label>
                      <input
                        id={`ing-unit-${index}`}
                        type="text"
                        maxLength={24}
                        required
                        value={row.unit}
                        onChange={(e) =>
                          updateIngredientRow(index, { unit: e.target.value })
                        }
                        placeholder="gram / pcs"
                        className="mt-1 min-h-[44px] w-full rounded-lg border border-[#CBD5E1] px-3 text-sm"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label
                        htmlFor={`ing-cost-${index}`}
                        className="block text-xs font-semibold text-[#0F172A]"
                      >
                        Estimasi Harga (IDR)
                      </label>
                      <input
                        id={`ing-cost-${index}`}
                        type="number"
                        min={0}
                        required
                        value={row.estimatedUnitCostIdr}
                        onChange={(e) =>
                          updateIngredientRow(index, {
                            estimatedUnitCostIdr: e.target.value,
                          })
                        }
                        className="font-data mt-1 min-h-[44px] w-full rounded-lg border border-[#CBD5E1] px-3 text-sm"
                      />
                    </div>

                    <div className="sm:col-span-1">
                      <button
                        type="button"
                        onClick={() => removeIngredientRow(index)}
                        disabled={ingredients.length <= 1}
                        aria-label={`Hapus bahan baris ${index + 1}`}
                        className="min-h-[44px] w-full cursor-pointer rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-2 text-xs font-semibold text-[#B91C1C] transition-colors hover:bg-[#FEE2E2] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {createPkgFeedback && (
              <div
                role={createPkgFeedback.type === "error" ? "alert" : "status"}
                className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                  createPkgFeedback.type === "error"
                    ? "border-[#FCA5A5] bg-[#FEF2F2] text-[#B91C1C]"
                    : "border-[#A7F3D0] bg-[#ECFDF5] text-[#047857]"
                }`}
              >
                {createPkgFeedback.message}
              </div>
            )}

            <button
              type="submit"
              disabled={creatingPkg}
              className="min-h-[44px] cursor-pointer rounded-xl bg-[#C2410C] px-6 text-sm font-bold text-white transition-colors hover:bg-[#9A3412] disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {creatingPkg ? "Menyimpan Paket..." : "Tambah Paket & BOM"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
