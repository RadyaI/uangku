"use client";


import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, Plus, Trash2, X, Check, ArrowDownLeft,
  Info, Wallet, BarChart2, RefreshCw, ChevronRight, Loader2,
} from "lucide-react";
import toast from "react-hot-toast";
import { Timestamp } from "firebase/firestore";

import {
  createPortfolioSnapshot,
  getPortfolioSnapshots,
  deletePortfolioSnapshot,
} from "@/utils/crud";
import {
  getInvestmentTopups,
  createInvestmentTopup,
  deleteInvestmentTopup,
  InvestmentTopup,
} from "@/utils/investment";
import type { Account, PortfolioSnapshot } from "@/types";

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtShort = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}M`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}jt`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return fmt(n);
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

interface InvestmentPanelProps {
  account: Account;
  allAccounts: Account[];
  accentColor: string;
  onRefresh: () => void;
}

type ActiveModal = "none" | "topup" | "updateNilai";

export default function InvestmentPanel({
  account,
  allAccounts,
  accentColor,
  onRefresh,
}: InvestmentPanelProps) {
  const [loading, setLoading] = useState(true);
  const [topups, setTopups] = useState<InvestmentTopup[]>([]);
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([]);
  const [modal, setModal] = useState<ActiveModal>("none");
  const now = new Date();

  // ─── Form state ────────────────────────────────────────────────────────────
  const [topupForm, setTopupForm] = useState({
    amount: "",
    fromAccountId: "", // kosong = manual, diisi = dari bank
    note: "",
    date: now.toISOString().split("T")[0],
  });

  const [nilaiForm, setNilaiForm] = useState({
    totalValue: "",
    note: "",
    date: now.toISOString().split("T")[0],
  });

  // ─── Load data ──────────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    try {
      const [tops, snaps] = await Promise.all([
        getInvestmentTopups(account.id),
        getPortfolioSnapshots(account.id),
      ]);
      setTopups(tops);
      setSnapshots(snaps.sort((a, b) => b.snapshotDate.toMillis() - a.snapshotDate.toMillis()));
    } catch {
      toast.error("Gagal load data investasi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [account.id]);

  // ─── Derived values ──────────────────────────────────────────────────────────
  const totalModal = topups.reduce((s, t) => s + t.amount, 0);
  const latestSnap = snapshots[0] ?? null;
  const nilaiSekarang = latestSnap?.totalValue ?? null;
  const returnAmount = nilaiSekarang !== null ? nilaiSekarang - totalModal : null;
  const returnPct = totalModal > 0 && returnAmount !== null
    ? (returnAmount / totalModal) * 100
    : null;

  const chartData = snapshots
    .slice(0, 12)
    .reverse()
    .map((s) => ({
      label: `${MONTHS[s.snapshotDate.toDate().getMonth()]} '${String(s.snapshotDate.toDate().getFullYear()).slice(2)}`,
      nilai: s.totalValue,
      modal: totalModal,
    }));

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleTopup = async () => {
    const amount = parseFloat(topupForm.amount.replace(/\D/g, ""));
    if (!amount || amount <= 0) return toast.error("Masukkan nominal yang valid");

    try {
      await createInvestmentTopup({
        accountId: account.id,
        amount,
        note: topupForm.note,
        date: Timestamp.fromDate(new Date(topupForm.date)),
        ...(topupForm.fromAccountId ? { fromAccountId: topupForm.fromAccountId } : {}),
      });
      toast.success(`Topup ${fmt(amount)} berhasil dicatat! 🎉`);
      setModal("none");
      setTopupForm({ amount: "", fromAccountId: "", note: "", date: now.toISOString().split("T")[0] });
      await loadData();
      onRefresh();
    } catch {
      toast.error("Gagal simpan topup");
    }
  };

  const handleUpdateNilai = async () => {
    const totalValue = parseFloat(nilaiForm.totalValue.replace(/\D/g, ""));
    if (!totalValue || totalValue <= 0) return toast.error("Masukkan nilai portofolio");

    const returnAmt = totalValue - totalModal;
    const returnPct = totalModal > 0 ? (returnAmt / totalModal) * 100 : 0;

    try {
      await createPortfolioSnapshot({
        accountId: account.id,
        totalValue,
        totalInvested: totalModal,
        returnAmount: returnAmt,
        returnPercent: returnPct,
        snapshotDate: Timestamp.fromDate(new Date(nilaiForm.date)),
      });
      toast.success("Nilai portofolio diperbarui! 📈");
      setModal("none");
      setNilaiForm({ totalValue: "", note: "", date: now.toISOString().split("T")[0] });
      await loadData();
      onRefresh();
    } catch {
      toast.error("Gagal update nilai");
    }
  };

  const handleDeleteTopup = async (id: string) => {
    if (!confirm("Hapus topup ini? Balance akun akan dikembalikan.")) return;
    try {
      await deleteInvestmentTopup(id);
      toast.success("Topup dihapus");
      await loadData();
      onRefresh();
    } catch {
      toast.error("Gagal hapus topup");
    }
  };

  const handleDeleteSnap = async (id: string) => {
    if (!confirm("Hapus catatan nilai ini?")) return;
    try {
      await deletePortfolioSnapshot(id);
      toast.success("Catatan nilai dihapus");
      await loadData();
    } catch {
      toast.error("Gagal hapus");
    }
  };

  const bankAccounts = allAccounts.filter(
    (a) => a.id !== account.id && (a.type === "bank" || a.type === "cash")
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <>
      {/* ── Header Aksi ── */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => setModal("topup")}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-white text-sm font-bold transition-all hover:opacity-90 shadow-sm"
          style={{ background: accentColor }}
        >
          <Plus className="w-4 h-4" />
          Topup Modal
        </button>
        <button
          onClick={() => setModal("updateNilai")}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-bold border-2 transition-all hover:opacity-80"
          style={{ borderColor: accentColor, color: accentColor, background: `${accentColor}10` }}
        >
          <RefreshCw className="w-4 h-4" />
          Update Nilai
        </button>
      </div>

      {/* ── Info tooltip ── */}
      <div className="bg-slate-50 rounded-2xl p-3 mb-5 flex gap-2">
        <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-500 space-y-1">
          <p><span className="font-bold text-slate-700">Topup Modal</span> = catat setiap kali nambah/beli investasi. Balance akun otomatis bertambah.</p>
          <p><span className="font-bold text-slate-700">Update Nilai</span> = catat nilai portofolio sekarang dari app reksadana/saham. Buat track profit/loss.</p>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-slate-50 rounded-2xl p-3 text-center">
          <p className="text-xs text-slate-400 mb-1 font-medium">Total Modal</p>
          <p className="text-sm font-extrabold text-slate-700">{fmtShort(totalModal)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{topups.length}x topup</p>
        </div>
        <div
          className="rounded-2xl p-3 text-center"
          style={{ background: `${accentColor}12` }}
        >
          <p className="text-xs mb-1 font-medium" style={{ color: accentColor }}>Nilai Sekarang</p>
          <p className="text-sm font-extrabold text-slate-700">
            {nilaiSekarang !== null ? fmtShort(nilaiSekarang) : "—"}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {latestSnap
              ? latestSnap.snapshotDate.toDate().toLocaleDateString("id-ID", { day: "numeric", month: "short" })
              : "Belum dicatat"}
          </p>
        </div>
        <div
          className={`rounded-2xl p-3 text-center ${returnAmount === null ? "bg-slate-50" : returnAmount >= 0 ? "bg-emerald-50" : "bg-rose-50"}`}
        >
          <p className={`text-xs mb-1 font-medium ${returnAmount === null ? "text-slate-400" : returnAmount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            Return
          </p>
          <p className={`text-sm font-extrabold ${returnAmount === null ? "text-slate-400" : returnAmount >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
            {returnAmount !== null
              ? `${returnAmount >= 0 ? "+" : ""}${fmtShort(returnAmount)}`
              : "—"}
          </p>
          <p className={`text-xs mt-0.5 font-bold ${returnPct === null ? "text-slate-400" : returnPct >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
            {returnPct !== null ? `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%` : "—"}
          </p>
        </div>
      </div>

      {/* ── Chart Pertumbuhan ── */}
      {chartData.length > 1 && (
        <div className="card p-4 mb-5">
          <h3 className="text-xs font-bold text-slate-600 mb-3">Pertumbuhan Nilai vs Modal</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`invGrad-${account.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accentColor} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmtShort} tick={{ fontSize: 9, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                formatter={(v, name) => [fmtShort(Number(v)), name]}
                contentStyle={{ borderRadius: "10px", border: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.1)", fontSize: "11px" }}
              />
              <Area type="monotone" dataKey="modal" name="Modal" stroke="#94a3b8" strokeWidth={1.5} fill="none" dot={false} strokeDasharray="4 3" />
              <Area type="monotone" dataKey="nilai" name="Nilai" stroke={accentColor} strokeWidth={2.5} fill={`url(#invGrad-${account.id})`} dot={{ fill: accentColor, r: 3, strokeWidth: 0 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Tab: Riwayat Topup ── */}
      <div className="card p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-4 h-4 text-slate-400" />
          <h3 className="text-xs font-bold text-slate-700">Riwayat Topup Modal</h3>
        </div>
        {topups.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-6">Belum ada topup. Yuk mulai investasi! 💪</p>
        ) : (
          <div className="flex flex-col gap-1">
            {topups.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 group transition-all">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0" style={{ background: `${accentColor}15` }}>
                  <ArrowDownLeft className="w-3.5 h-3.5" style={{ color: accentColor }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">
                    {t.note || "Topup Modal"}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs text-slate-400">
                      {t.date.toDate().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                    {t.fromAccountId && (
                      <span className="text-xs text-indigo-400 font-medium">
                        ← {allAccounts.find((a) => a.id === t.fromAccountId)?.name ?? "Bank"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className="text-sm font-bold" style={{ color: accentColor }}>+{fmtShort(t.amount)}</p>
                  <button
                    onClick={() => handleDeleteTopup(t.id)}
                    className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-rose-50 text-slate-300 hover:text-rose-400 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Tab: Riwayat Nilai ── */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-3">
          <BarChart2 className="w-4 h-4 text-slate-400" />
          <h3 className="text-xs font-bold text-slate-700">Riwayat Nilai Portofolio</h3>
        </div>
        {snapshots.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-6">Belum ada catatan nilai. Update nilai sekarang!</p>
        ) : (
          <div className="flex flex-col gap-1">
            {snapshots.map((s) => {
              const ret = s.returnPercent;
              return (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 group transition-all">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm flex-shrink-0 ${ret >= 0 ? "bg-emerald-50" : "bg-rose-50"}`}>
                    {ret >= 0
                      ? <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                      : <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">
                      {fmtShort(s.totalValue)}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {s.snapshotDate.toDate().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <p className={`text-xs font-bold ${ret >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {ret >= 0 ? "+" : ""}{ret.toFixed(2)}%
                      </p>
                      <p className={`text-xs ${ret >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                        {s.returnAmount >= 0 ? "+" : ""}{fmtShort(s.returnAmount)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteSnap(s.id)}
                      className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-rose-50 text-slate-300 hover:text-rose-400 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      <AnimatePresence>
        {modal !== "none" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setModal("none"); }}
          >
            <motion.div
              initial={{ opacity: 0, y: 60, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.96 }}
              transition={{ type: "spring", damping: 26, stiffness: 320 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl"
            >

              {/* ── Modal: Topup Modal ── */}
              {modal === "topup" && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-slate-800">Topup Modal 💸</h3>
                    <button onClick={() => setModal("none")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mb-5">Catat setiap kali lo beli/tambah investasi. Balance akun akan otomatis bertambah.</p>

                  <div className="space-y-3">
                    {/* Nominal */}
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1.5 block">Nominal Topup</label>
                      <input
                        type="text"
                        placeholder="Rp 0"
                        autoFocus
                        value={topupForm.amount ? `Rp ${Number(topupForm.amount.replace(/\D/g, "")).toLocaleString("id-ID")}` : ""}
                        onChange={(e) => setTopupForm((p) => ({ ...p, amount: e.target.value.replace(/\D/g, "") }))}
                        className="w-full border border-slate-100 bg-slate-50 rounded-xl px-4 py-3 text-slate-700 font-bold text-xl transition-all"
                      />
                    </div>

                    {/* Sumber Dana */}
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1.5 block">Sumber Dana (Opsional)</label>
                      <select
                        value={topupForm.fromAccountId}
                        onChange={(e) => setTopupForm((p) => ({ ...p, fromAccountId: e.target.value }))}
                        className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all"
                      >
                        <option value="">Manual / Tidak dari akun lain</option>
                        {bankAccounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.name} — {fmtShort(a.balance)}</option>
                        ))}
                      </select>
                      {topupForm.fromAccountId && (
                        <p className="text-xs text-indigo-500 mt-1.5 font-medium">
                          ✓ Balance {allAccounts.find((a) => a.id === topupForm.fromAccountId)?.name} akan dikurangi otomatis
                        </p>
                      )}
                    </div>

                    {/* Tanggal */}
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1.5 block">Tanggal</label>
                      <input
                        type="date"
                        value={topupForm.date}
                        onChange={(e) => setTopupForm((p) => ({ ...p, date: e.target.value }))}
                        className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all"
                      />
                    </div>

                    {/* Catatan */}
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1.5 block">Catatan (Opsional)</label>
                      <input
                        type="text"
                        placeholder="Misal: Beli reksadana pasar uang"
                        value={topupForm.note}
                        onChange={(e) => setTopupForm((p) => ({ ...p, note: e.target.value }))}
                        className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all"
                      />
                    </div>
                  </div>

                  {/* Preview */}
                  {topupForm.amount && (
                    <div className="mt-3 p-3 rounded-xl text-xs font-medium space-y-1" style={{ background: `${accentColor}10`, color: accentColor }}>
                      <p>✓ Total modal baru: <span className="font-bold">{fmtShort(totalModal + Number(topupForm.amount.replace(/\D/g, "")))}</span></p>
                      {topupForm.fromAccountId && (
                        <p>✓ Balance {allAccounts.find((a) => a.id === topupForm.fromAccountId)?.name} akan berkurang: <span className="font-bold">-{fmtShort(Number(topupForm.amount.replace(/\D/g, "")))}</span></p>
                      )}
                    </div>
                  )}

                  <button
                    onClick={handleTopup}
                    className="mt-4 w-full py-3 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90"
                    style={{ background: accentColor }}
                  >
                    <Check className="w-4 h-4" /> Simpan Topup
                  </button>
                </>
              )}

              {/* ── Modal: Update Nilai ── */}
              {modal === "updateNilai" && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-slate-800">Update Nilai 📊</h3>
                    <button onClick={() => setModal("none")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mb-5">Catat nilai portofolio lo sekarang. Cek di app reksadana/saham lo, lalu input di sini.</p>

                  {/* Info modal saat ini */}
                  {totalModal > 0 && (
                    <div className="bg-slate-50 rounded-xl p-3 mb-4">
                      <p className="text-xs text-slate-500 font-medium">Total modal lo saat ini: <span className="font-bold text-slate-700">{fmt(totalModal)}</span></p>
                      <p className="text-xs text-slate-400 mt-0.5">Return akan dihitung otomatis dari nilai yang lo input</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    {/* Nilai saat ini */}
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1.5 block">Nilai Portofolio Sekarang</label>
                      <input
                        type="text"
                        placeholder="Rp 0"
                        autoFocus
                        value={nilaiForm.totalValue ? `Rp ${Number(nilaiForm.totalValue.replace(/\D/g, "")).toLocaleString("id-ID")}` : ""}
                        onChange={(e) => setNilaiForm((p) => ({ ...p, totalValue: e.target.value.replace(/\D/g, "") }))}
                        className="w-full border border-slate-100 bg-slate-50 rounded-xl px-4 py-3 text-slate-700 font-bold text-xl transition-all"
                      />
                    </div>

                    {/* Tanggal */}
                    <div>
                      <label className="text-xs font-bold text-slate-500 mb-1.5 block">Tanggal</label>
                      <input
                        type="date"
                        value={nilaiForm.date}
                        onChange={(e) => setNilaiForm((p) => ({ ...p, date: e.target.value }))}
                        className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all"
                      />
                    </div>
                  </div>

                  {/* Preview Return */}
                  {nilaiForm.totalValue && totalModal > 0 && (() => {
                    const val = Number(nilaiForm.totalValue.replace(/\D/g, ""));
                    const ret = val - totalModal;
                    const retPct = (ret / totalModal) * 100;
                    const isPositive = ret >= 0;
                    return (
                      <div className={`mt-3 p-4 rounded-xl text-xs space-y-1.5 ${isPositive ? "bg-emerald-50" : "bg-rose-50"}`}>
                        <p className={`font-bold text-sm ${isPositive ? "text-emerald-700" : "text-rose-700"}`}>
                          {isPositive ? "📈 Profit!" : "📉 Rugi nih..."} {isPositive ? "+" : ""}{fmtShort(ret)} ({retPct >= 0 ? "+" : ""}{retPct.toFixed(2)}%)
                        </p>
                        <p className={isPositive ? "text-emerald-600" : "text-rose-600"}>
                          Modal: {fmt(totalModal)} → Nilai: {fmt(val)}
                        </p>
                      </div>
                    );
                  })()}

                  {nilaiForm.totalValue && totalModal === 0 && (
                    <div className="mt-3 p-3 bg-amber-50 rounded-xl text-xs text-amber-600">
                      ⚠️ Belum ada riwayat topup. Return akan dihitung sebagai 0% karena modal = 0.
                    </div>
                  )}

                  <button
                    onClick={handleUpdateNilai}
                    className="mt-4 w-full py-3 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:opacity-90"
                    style={{ background: accentColor }}
                  >
                    <Check className="w-4 h-4" /> Simpan Nilai
                  </button>
                </>
              )}

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}