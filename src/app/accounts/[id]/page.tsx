"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  ArrowLeft, Edit2, Check, X, Wallet, TrendingUp, TrendingDown,
  ArrowDownLeft, ArrowUpRight, Repeat2, Trash2, Plus, RefreshCw,
  AlertTriangle, Loader2, ChevronDown, PiggyBank,
} from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { motion as m } from "framer-motion";
import toast, { Toaster } from "react-hot-toast";
import Swal from "sweetalert2";
import { Timestamp } from "firebase/firestore";

import {
  getAccountDetail,
  updateAccountBalance,
  updateAccountInfo,
  getAccountTransactions,
  getAccountMonthlyHistory,
  getAccountPortfolioHistory,
} from "@/utils/account";
import {
  getCategories,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getAccounts,
} from "@/utils/crud";
import type { Account, Transaction, Category, PortfolioSnapshot } from "@/types";

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtShort = (n: number) => {
  if (Math.abs(n) >= 100_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 100_000_000) return `${(n / 1_000_000).toFixed(1)}jt`;
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const ACCOUNT_COLOR: Record<string, string> = {
  bank: "#6366f1",
  mutual_fund: "#10b981",
  stock: "#f59e0b",
  cash: "#3b82f6",
};

const ACCOUNT_LABEL: Record<string, string> = {
  bank: "🏦 Bank",
  mutual_fund: "📊 Reksa Dana",
  stock: "📈 Saham",
  cash: "💵 Tunai",
};

type Modal = "none" | "editBalance" | "editInfo" | "addTx" | "editTx";

export default function AccountDetailPage() {
  const router = useRouter();
  const params = useParams();
  const accountId = params.id as string;
  const now = new Date();

  const [account, setAccount] = useState<Account | null>(null);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [monthlyHistory, setMonthlyHistory] = useState<Awaited<ReturnType<typeof getAccountMonthlyHistory>>>([]);
  const [portfolioHistory, setPortfolioHistory] = useState<PortfolioSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterMonth, setFilterMonth] = useState<number | "all">("all");
  const [modal, setModal] = useState<Modal>("none");
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const [balanceInput, setBalanceInput] = useState("");
  const [infoForm, setInfoForm] = useState({ name: "", type: "bank" as Account["type"], currency: "IDR" });

  const [txForm, setTxForm] = useState<{
    type: "income" | "expense" | "transfer";
    amount: string;
    categoryId: string;
    toAccountId: string;
    fee: string;
    note: string;
    date: string;
  }>({
    type: "expense",
    amount: "",
    categoryId: "",
    toAccountId: "",
    fee: "",
    note: "",
    date: now.toISOString().split("T")[0],
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [acc, txs, cats, history, accs] = await Promise.all([
        getAccountDetail(accountId),
        getAccountTransactions(accountId, { limitCount: 100 }),
        getCategories(),
        getAccountMonthlyHistory(accountId, 6),
        getAccounts(),
      ]);
      if (!acc) { router.push("/"); return; }
      setAccount(acc);
      setAllAccounts(accs);
      setTransactions(txs);
      setCategories(cats);
      setMonthlyHistory(history);

      if (acc.type === "mutual_fund" || acc.type === "stock") {
        const ph = await getAccountPortfolioHistory(accountId);
        setPortfolioHistory(ph);
      }
    } catch {
      toast.error("Gagal memuat data akun");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredTx = filterMonth === "all"
    ? transactions
    : transactions.filter((t) => t.date.toDate().getMonth() === filterMonth);

  const totalIncome = filteredTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = filteredTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const totalTransferOut = filteredTx.filter((t) => t.type === "transfer" && t.accountId === accountId).reduce((s, t) => s + t.amount + (t.fee ?? 0), 0);
  const totalTransferIn = filteredTx.filter((t) => t.type === "transfer" && t.toAccountId === accountId).reduce((s, t) => s + t.amount, 0);

  const handleSaveBalance = async () => {
    const val = parseFloat(balanceInput.replace(/\D/g, ""));
    if (isNaN(val)) return toast.error("Nominal tidak valid");
    try {
      await updateAccountBalance(accountId, val);
      toast.success("Saldo diperbarui!");
      setModal("none");
      await loadData();
    } catch {
      toast.error("Gagal update saldo");
    }
  };

  const handleSaveInfo = async () => {
    if (!infoForm.name) return toast.error("Nama tidak boleh kosong");
    try {
      await updateAccountInfo(accountId, infoForm);
      toast.success("Info akun diperbarui!");
      setModal("none");
      await loadData();
    } catch {
      toast.error("Gagal update info");
    }
  };

  const handleSaveTx = async () => {
    if (!txForm.amount) return toast.error("Masukkan nominal");
    if (txForm.type === "transfer" && !txForm.toAccountId) return toast.error("Pilih akun tujuan");
    const amount = parseFloat(txForm.amount.replace(/\D/g, ""));
    if (isNaN(amount) || amount <= 0) return toast.error("Nominal tidak valid");
    const fee = txForm.fee ? parseFloat(txForm.fee.replace(/\D/g, "")) : 0;

    try {
      const payload = {
        type: txForm.type,
        amount,
        accountId,
        categoryId: txForm.type !== "transfer" ? (txForm.categoryId || null) : null,
        note: txForm.note,
        date: Timestamp.fromDate(new Date(txForm.date)),
        ...(txForm.type === "transfer" && txForm.toAccountId ? { toAccountId: txForm.toAccountId } : {}),
        ...(txForm.type === "transfer" && fee > 0 ? { fee } : {}),
      };

      if (selectedTx) {
        await updateTransaction(selectedTx.id, payload);
        toast.success("Transaksi diperbarui!");
      } else {
        await createTransaction(payload as any);
        toast.success("Transaksi ditambahkan!");
      }
      setModal("none");
      setSelectedTx(null);
      resetTxForm();
      await loadData();
    } catch {
      toast.error("Gagal simpan transaksi");
    }
  };

  const handleDeleteTx = async (id: string) => {
    const result = await Swal.fire({
      title: "Hapus transaksi?", text: "Saldo akun akan dikembalikan.",
      icon: "warning", showCancelButton: true,
      confirmButtonText: "Hapus", cancelButtonText: "Batal",
      confirmButtonColor: "#f43f5e", background: "#fff",
    });
    if (!result.isConfirmed) return;
    try {
      await deleteTransaction(id);
      toast.success("Transaksi dihapus");
      await loadData();
    } catch {
      toast.error("Gagal hapus");
    }
  };

  const openEditTx = (tx: Transaction) => {
    setSelectedTx(tx);
    setTxForm({
      type: tx.type,
      amount: String(tx.amount),
      categoryId: tx.categoryId ?? "",
      toAccountId: tx.toAccountId ?? "",
      fee: tx.fee ? String(tx.fee) : "",
      note: tx.note,
      date: tx.date.toDate().toISOString().split("T")[0],
    });
    setModal("editTx");
  };

  const resetTxForm = () => {
    setTxForm({ type: "expense", amount: "", categoryId: "", toAccountId: "", fee: "", note: "", date: now.toISOString().split("T")[0] });
  };

  const getCategoryInfo = (id: string | null) => categories.find((c) => c.id === id);
  const getAccountName = (id: string) => allAccounts.find((a) => a.id === id)?.name ?? id;

  const accentColor = account ? (ACCOUNT_COLOR[account.type] ?? "#6366f1") : "#6366f1";
  const isPortfolio = account?.type === "mutual_fund" || account?.type === "stock";

  const fade = (delay = 0) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay } });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f7ff] flex items-center justify-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">
          <Loader2 className="w-7 h-7 animate-spin" style={{ color: accentColor }} />
          <p className="text-slate-400 text-sm font-medium">Memuat akun...</p>
        </motion.div>
      </div>
    );
  }

  if (!account) return null;

  return (
    <div className="min-h-screen bg-[#f8f7ff]">
      <Toaster position="top-right" toastOptions={{ style: { borderRadius: "12px", fontFamily: "inherit" } }} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
        * { font-family: 'Plus Jakarta Sans', sans-serif; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #e0e0f0; border-radius: 99px; }
        .card { background: white; border-radius: 20px; box-shadow: 0 1px 3px rgba(99,102,241,0.06), 0 4px 16px rgba(99,102,241,0.04); }
        input:focus, select:focus { outline: none; border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99,102,241,0.12); }
      `}</style>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">

        {/* Header */}
        <motion.div {...fade(0)} className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="w-10 h-10 flex items-center justify-center rounded-2xl bg-white text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all border border-slate-100"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-xs text-slate-400 font-medium">{ACCOUNT_LABEL[account.type]}</p>
              <h1 className="text-xl lg:text-2xl font-extrabold text-slate-800">{account.name}</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setInfoForm({ name: account.name, type: account.type, currency: account.currency }); setModal("editInfo"); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white text-slate-500 hover:text-slate-700 text-xs font-semibold border border-slate-100 transition-all"
            >
              <Edit2 className="w-3.5 h-3.5" /> Edit Info
            </button>
            <button
              onClick={() => { resetTxForm(); setModal("addTx"); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-bold transition-all"
              style={{ background: accentColor }}
            >
              <Plus className="w-3.5 h-3.5" /> Transaksi
            </button>
          </div>
        </motion.div>

        {/* Balance Hero Card */}
        <motion.div {...fade(0.04)} className="card p-6 mb-5 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{ background: `radial-gradient(circle at 80% 50%, ${accentColor}, transparent 60%)` }} />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-slate-400 text-sm font-medium mb-2">Saldo Saat Ini</p>
              <p className="text-3xl lg:text-4xl font-extrabold text-slate-800 tracking-tight">{fmt(account.balance)}</p>
              <p className="text-xs text-slate-400 mt-2">{account.currency} · {ACCOUNT_LABEL[account.type]}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-lg font-extrabold" style={{ background: accentColor }}>
                {account.name.charAt(0)}
              </div>
              <button
                onClick={() => { setBalanceInput(String(account.balance)); setModal("editBalance"); }}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all hover:opacity-80"
                style={{ borderColor: accentColor, color: accentColor, background: `${accentColor}10` }}
              >
                <Edit2 className="w-3 h-3" /> Koreksi Saldo
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            {[
              { label: "Pemasukan", val: totalIncome, color: "text-emerald-600", bg: "bg-emerald-50", icon: <ArrowDownLeft className="w-3.5 h-3.5" /> },
              { label: "Pengeluaran", val: totalExpense, color: "text-rose-600", bg: "bg-rose-50", icon: <ArrowUpRight className="w-3.5 h-3.5" /> },
              { label: "Transfer Masuk", val: totalTransferIn, color: "text-indigo-600", bg: "bg-indigo-50", icon: <Repeat2 className="w-3.5 h-3.5" /> },
              { label: "Transfer Keluar", val: totalTransferOut, color: "text-amber-600", bg: "bg-amber-50", icon: <Repeat2 className="w-3.5 h-3.5" /> },
            ].map((s) => (
              <div key={s.label} className={`${s.bg} rounded-2xl p-3`}>
                <div className={`flex items-center gap-1 ${s.color} mb-1.5`}>
                  {s.icon}
                  <span className="text-xs font-semibold">{s.label}</span>
                </div>
                <p className={`text-sm font-bold ${s.color}`}>{fmtShort(s.val)}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left: Charts */}
          <div className="lg:col-span-2 flex flex-col gap-5">

            {/* Monthly Activity Chart */}
            <motion.div {...fade(0.07)} className="card p-5">
              <h2 className="text-sm font-bold text-slate-700 mb-4">Aktivitas Bulanan</h2>
              {monthlyHistory.every((r) => r.income === 0 && r.expense === 0 && r.transferIn === 0 && r.transferOut === 0) ? (
                <div className="py-12 text-center">
                  <p className="text-slate-300 text-3xl mb-2">📊</p>
                  <p className="text-slate-400 text-sm">Belum ada aktivitas</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={monthlyHistory} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={56} />
                    <Tooltip
                      formatter={(v) => fmtShort(Number(v))}
                      contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: "12px" }}
                    />
                    <Bar dataKey="income" name="Pemasukan" fill="#10b981" radius={[5, 5, 0, 0]} maxBarSize={24} />
                    <Bar dataKey="expense" name="Pengeluaran" fill="#f43f5e" radius={[5, 5, 0, 0]} maxBarSize={24} />
                    <Bar dataKey="transferIn" name="Masuk" fill="#6366f1" radius={[5, 5, 0, 0]} maxBarSize={24} />
                    <Bar dataKey="transferOut" name="Keluar" fill="#f59e0b" radius={[5, 5, 0, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </motion.div>

            {/* Portfolio history chart (if investment account) */}
            {isPortfolio && portfolioHistory.length > 1 && (
              <motion.div {...fade(0.09)} className="card p-5">
                <h2 className="text-sm font-bold text-slate-700 mb-4">Pertumbuhan Portofolio 📈</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart
                    data={portfolioHistory.map((s) => ({
                      label: MONTHS[s.snapshotDate.toDate().getMonth()],
                      nilai: s.totalValue,
                      modal: s.totalInvested,
                    }))}
                    margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="nilaiGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={56} />
                    <Tooltip formatter={(v) => fmtShort(Number(v))} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 20px rgba(0,0,0,0.08)", fontSize: "12px" }} />
                    <Area type="monotone" dataKey="modal" name="Modal" stroke="#6366f1" strokeWidth={1.5} fill="none" dot={false} strokeDasharray="4 3" />
                    <Area type="monotone" dataKey="nilai" name="Nilai" stroke="#10b981" strokeWidth={2.5} fill="url(#nilaiGrad)" dot={{ fill: "#10b981", r: 3, strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </motion.div>
            )}

            {/* Transaction History */}
            <motion.div {...fade(0.1)} className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-slate-700">Riwayat Transaksi</h2>
                <select
                  value={filterMonth === "all" ? "all" : String(filterMonth)}
                  onChange={(e) => setFilterMonth(e.target.value === "all" ? "all" : Number(e.target.value))}
                  className="text-xs border border-slate-100 bg-slate-50 rounded-xl px-3 py-1.5 text-slate-600 font-semibold"
                >
                  <option value="all">Semua</option>
                  {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
              </div>

              {filteredTx.length === 0 ? (
                <div className="py-12 text-center">
                  <Wallet className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">Belum ada transaksi</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {filteredTx.map((tx) => {
                    const cat = getCategoryInfo(tx.categoryId);
                    const isOut = tx.type === "expense" || (tx.type === "transfer" && tx.accountId === accountId);
                    const isIn = tx.type === "income" || (tx.type === "transfer" && tx.toAccountId === accountId);
                    const displayAmount = tx.type === "transfer" && tx.accountId === accountId
                      ? tx.amount + (tx.fee ?? 0)
                      : tx.amount;

                    return (
                      <motion.div
                        key={tx.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-all group"
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm flex-shrink-0 ${isIn && tx.type !== "transfer" ? "bg-emerald-50" : tx.type === "transfer" ? "bg-indigo-50" : "bg-rose-50"}`}>
                          {tx.type === "transfer" ? "↔" : cat?.icon ?? "💸"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-700 truncate">
                            {tx.note || (tx.type === "transfer"
                              ? tx.accountId === accountId
                                ? `→ ${getAccountName(tx.toAccountId ?? "")}`
                                : `← ${getAccountName(tx.accountId)}`
                              : cat?.name ?? "Transaksi")}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-xs text-slate-400">
                              {tx.date.toDate().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                            {tx.fee && tx.fee > 0 && (
                              <span className="text-xs text-amber-500 font-medium">+ biaya {fmtShort(tx.fee)}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-sm font-bold ${isIn ? "text-emerald-600" : "text-rose-600"}`}>
                            {isIn ? "+" : "-"}{fmtShort(displayAmount)}
                          </p>
                          <div className="flex gap-1 justify-end mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => openEditTx(tx)} className="p-1 rounded-lg hover:bg-indigo-50 text-slate-300 hover:text-indigo-500 transition-colors">
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button onClick={() => handleDeleteTx(tx.id)} className="p-1 rounded-lg hover:bg-rose-50 text-slate-300 hover:text-rose-500 transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          </div>

          {/* Right: Info + Quick Stats */}
          <div className="flex flex-col gap-5">

            {/* Account Info */}
            <motion.div {...fade(0.06)} className="card p-5">
              <h2 className="text-sm font-bold text-slate-700 mb-4">Info Akun</h2>
              <div className="space-y-3">
                {[
                  { label: "Nama", val: account.name },
                  { label: "Tipe", val: ACCOUNT_LABEL[account.type] },
                  { label: "Mata Uang", val: account.currency },
                  { label: "Dibuat", val: account.createdAt.toDate().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <span className="text-xs text-slate-400 font-medium">{item.label}</span>
                    <span className="text-xs font-bold text-slate-700">{item.val}</span>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Balance Correction Warning */}
            <motion.div {...fade(0.08)} className="card p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <RefreshCw className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-700">Koreksi Saldo</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Update langsung kalau ada selisih dengan saldo real</p>
                </div>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 mb-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">Ini override saldo secara langsung, tidak membuat transaksi baru.</p>
                </div>
              </div>
              <button
                onClick={() => { setBalanceInput(String(account.balance)); setModal("editBalance"); }}
                className="w-full py-2.5 rounded-xl text-sm font-bold transition-all border-2 hover:opacity-80"
                style={{ borderColor: accentColor, color: accentColor }}
              >
                Set Saldo Manual
              </button>
            </motion.div>

            {/* Monthly Net summary */}
            {monthlyHistory.length > 0 && (
              <motion.div {...fade(0.1)} className="card p-5">
                <h2 className="text-sm font-bold text-slate-700 mb-3">Net per Bulan</h2>
                <div className="flex flex-col gap-2">
                  {monthlyHistory.slice(-4).reverse().map((row) => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-medium w-16">{row.label}</span>
                      <div className="flex-1 mx-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(Math.abs(row.net) / Math.max(...monthlyHistory.map((r) => Math.abs(r.net)), 1) * 100, 100)}%`,
                            background: row.net >= 0 ? "#10b981" : "#f43f5e",
                          }}
                        />
                      </div>
                      <span className={`text-xs font-bold w-20 text-right ${row.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                        {row.net >= 0 ? "+" : ""}{fmtShort(row.net)}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* ── MODALS ── */}
      <AnimatePresence>
        {modal !== "none" && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) { setModal("none"); setSelectedTx(null); } }}
          >
            <motion.div
              initial={{ opacity: 0, y: 60, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.96 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl"
            >

              {/* Edit Balance */}
              {modal === "editBalance" && (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-slate-800">Koreksi Saldo</h3>
                    <button onClick={() => setModal("none")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="bg-amber-50 rounded-2xl p-4 mb-4">
                    <p className="text-xs text-amber-700 font-medium">Saldo saat ini: <span className="font-bold">{fmt(account.balance)}</span></p>
                    <p className="text-xs text-amber-500 mt-1">Masukkan saldo baru sesuai kondisi real</p>
                  </div>
                  <input
                    type="text"
                    placeholder="Saldo baru (Rp)"
                    value={balanceInput ? `Rp ${Number(balanceInput.replace(/\D/g, "")).toLocaleString("id-ID")}` : ""}
                    onChange={(e) => setBalanceInput(e.target.value.replace(/\D/g, ""))}
                    className="w-full border border-slate-100 bg-slate-50 rounded-xl px-4 py-3 text-slate-700 font-bold text-lg transition-all mb-4"
                    autoFocus
                  />
                  {balanceInput && (
                    <div className={`mb-4 p-3 rounded-xl text-sm font-semibold flex items-center gap-2 ${Number(balanceInput) > account.balance ? "bg-emerald-50 text-emerald-700" : Number(balanceInput) < account.balance ? "bg-rose-50 text-rose-700" : "bg-slate-50 text-slate-500"}`}>
                      {Number(balanceInput) > account.balance
                        ? <><TrendingUp className="w-4 h-4" /> +{fmt(Number(balanceInput) - account.balance)} dari saldo sekarang</>
                        : Number(balanceInput) < account.balance
                        ? <><TrendingDown className="w-4 h-4" /> -{fmt(account.balance - Number(balanceInput))} dari saldo sekarang</>
                        : "Sama dengan saldo sekarang"}
                    </div>
                  )}
                  <button onClick={handleSaveBalance} className="w-full py-3 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2" style={{ background: accentColor }}>
                    <Check className="w-4 h-4" /> Simpan Saldo
                  </button>
                </>
              )}

              {/* Edit Info */}
              {modal === "editInfo" && (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-slate-800">Edit Info Akun</h3>
                    <button onClick={() => setModal("none")} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="space-y-3">
                    <input
                      type="text" placeholder="Nama Akun"
                      value={infoForm.name} onChange={(e) => setInfoForm((p) => ({ ...p, name: e.target.value }))}
                      className="w-full border border-slate-100 bg-slate-50 rounded-xl px-4 py-3 text-sm text-slate-700 font-semibold transition-all"
                      autoFocus
                    />
                    <select
                      value={infoForm.type} onChange={(e) => setInfoForm((p) => ({ ...p, type: e.target.value as Account["type"] }))}
                      className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all"
                    >
                      <option value="bank">🏦 Bank</option>
                      <option value="mutual_fund">📊 Reksa Dana</option>
                      <option value="stock">📈 Saham</option>
                      <option value="cash">💵 Tunai</option>
                    </select>
                    <input
                      type="text" placeholder="Mata Uang (IDR)"
                      value={infoForm.currency} onChange={(e) => setInfoForm((p) => ({ ...p, currency: e.target.value.toUpperCase() }))}
                      className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all"
                    />
                  </div>
                  <button onClick={handleSaveInfo} className="mt-4 w-full py-3 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2" style={{ background: accentColor }}>
                    <Check className="w-4 h-4" /> Simpan
                  </button>
                </>
              )}

              {/* Add / Edit Transaction */}
              {(modal === "addTx" || modal === "editTx") && (
                <>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold text-slate-800">{selectedTx ? "Edit Transaksi" : "Transaksi Baru"}</h3>
                    <button onClick={() => { setModal("none"); setSelectedTx(null); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex gap-2 mb-4">
                    {(["expense", "income", "transfer"] as const).map((t) => (
                      <button key={t} onClick={() => setTxForm((p) => ({ ...p, type: t }))}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${txForm.type === t ? t === "income" ? "bg-emerald-500 text-white" : t === "expense" ? "bg-rose-500 text-white" : "bg-indigo-500 text-white" : "bg-slate-50 text-slate-500 hover:bg-slate-100"}`}>
                        {t === "income" ? "Masuk" : t === "expense" ? "Keluar" : "Transfer"}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-3">
                    <input
                      type="text" placeholder="Nominal (Rp)"
                      value={txForm.amount ? `Rp ${Number(txForm.amount.replace(/\D/g, "")).toLocaleString("id-ID")}` : ""}
                      onChange={(e) => setTxForm((p) => ({ ...p, amount: e.target.value.replace(/\D/g, "") }))}
                      className="w-full border border-slate-100 bg-slate-50 rounded-xl px-4 py-3 text-slate-700 font-bold text-lg transition-all"
                    />
                    {txForm.type === "transfer" ? (
                      <select value={txForm.toAccountId} onChange={(e) => setTxForm((p) => ({ ...p, toAccountId: e.target.value }))}
                        className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all">
                        <option value="">Ke Akun</option>
                        {allAccounts.filter((a) => a.id !== accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    ) : (
                      <select value={txForm.categoryId} onChange={(e) => setTxForm((p) => ({ ...p, categoryId: e.target.value }))}
                        className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all">
                        <option value="">Pilih Kategori</option>
                        {categories.filter((c) => c.type === txForm.type).map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                      </select>
                    )}
                    <input type="date" value={txForm.date} onChange={(e) => setTxForm((p) => ({ ...p, date: e.target.value }))}
                      className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all" />
                    {txForm.type === "transfer" && (
                      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                        <p className="text-xs font-bold text-amber-600 mb-2">💸 Biaya Transfer / Pajak</p>
                        <input
                          type="text" placeholder="Nominal biaya (Rp) — opsional"
                          value={txForm.fee ? `Rp ${Number(txForm.fee.replace(/\D/g, "")).toLocaleString("id-ID")}` : ""}
                          onChange={(e) => setTxForm((p) => ({ ...p, fee: e.target.value.replace(/\D/g, "") }))}
                          className="w-full bg-transparent text-sm font-bold text-amber-700 placeholder:text-amber-300 focus:outline-none"
                        />
                        {txForm.fee && txForm.amount && (
                          <p className="text-xs text-amber-500 mt-1.5">
                            Dikurangi: Rp {(Number(txForm.amount.replace(/\D/g, "")) + Number(txForm.fee.replace(/\D/g, ""))).toLocaleString("id-ID")}
                          </p>
                        )}
                      </div>
                    )}
                    <input type="text" placeholder="Catatan (opsional)" value={txForm.note}
                      onChange={(e) => setTxForm((p) => ({ ...p, note: e.target.value }))}
                      className="w-full border border-slate-100 bg-slate-50 rounded-xl px-3 py-2.5 text-sm text-slate-700 font-medium transition-all" />
                  </div>
                  <button onClick={handleSaveTx} className="mt-4 w-full py-3 text-white rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2" style={{ background: accentColor }}>
                    <Check className="w-4 h-4" /> {selectedTx ? "Perbarui" : "Simpan"}
                  </button>
                </>
              )}

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}