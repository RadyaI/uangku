import { Timestamp } from "firebase/firestore";

// ─── Shared ──────────────────────────────────────────────────────────────────
export type TransactionType = "income" | "expense" | "transfer";

export type AccountType = "bank" | "mutual_fund" | "stock" | "cash";

// ─── Account ─────────────────────────────────────────────────────────────────
// Semua "kantong" uang lo: Jago, Mandiri, Bibit, Ajaib
export interface Account {
  id: string;
  name: string;               // "Bank Jago", "Mandiri", dst
  type: AccountType;
  balance: number;            // saldo terakhir (update manual)
  currency: string;           // "IDR"
  isActive: boolean;
  createdAt: Timestamp;
}

// ─── Category ────────────────────────────────────────────────────────────────
export interface Category {
  id: string;
  name: string;
  icon: string;
  type: Exclude<TransactionType, "transfer">; // transfer gak butuh kategori
}

// ─── Transaction ─────────────────────────────────────────────────────────────
// Untuk Bank Jago & Mandiri — transaksi harian
export interface Transaction {
  id: string;
  accountId: string;          // linked ke account mana
  categoryId: string | null;  // null kalau tipe "transfer"
  type: TransactionType;
  amount: number;
  note: string;
  date: Timestamp;
  createdAt: Timestamp;
  // khusus transfer antar bank
  toAccountId?: string;       // diisi kalau type === "transfer"
}

// ─── Goal ────────────────────────────────────────────────────────────────────
export interface Goal {
  id: string;
  name: string;               // "Laptop baru", "Dana darurat 3 bulan"
  targetAmount: number;
  currentAmount: number;
  deadline: Timestamp | null;
  linkedAccountId: string | null; // opsional, link ke Mandiri misalnya
  isDone: boolean;
  createdAt: Timestamp;
}

// ─── Portfolio Snapshot ──────────────────────────────────────────────────────
// Untuk Bibit & Ajaib — dicatat manual tiap bulan
export interface PortfolioSnapshot {
  id: string;
  accountId: string;          // linked ke Bibit atau Ajaib
  totalValue: number;         // nilai portofolio saat snapshot
  totalInvested: number;      // total modal yang udah lo masukin
  returnAmount: number;       // totalValue - totalInvested
  returnPercent: number;      // (returnAmount / totalInvested) * 100
  snapshotDate: Timestamp;    // tanggal lo catat
  createdAt: Timestamp;
}

// ─── Net Worth Snapshot ──────────────────────────────────────────────────────
// Agregasi semua aset — dicatat manual tiap bulan
export interface NetWorthSnapshot {
  id: string;
  totalAssets: number;        // total semua akun + portofolio
  breakdown: {
    accountId: string;
    value: number;
  }[];
  snapshotDate: Timestamp;
  createdAt: Timestamp;
}

// ─── Firestore Collection Paths ──────────────────────────────────────────────
export const COLLECTIONS = {
  accounts:           "accounts",
  categories:         "categories",
  transactions:       "transactions",
  goals:              "goals",
  portfolioSnapshots: "portfolioSnapshots",
  netWorthSnapshots:  "netWorthSnapshots",
} as const;

// ─── DTOs ────────────────────────────────────────────────────────────────────
export type CreateTransaction       = Omit<Transaction, "id" | "createdAt">;
export type CreateGoal              = Omit<Goal, "id" | "createdAt">;
export type CreateCategory          = Omit<Category, "id">;
export type CreateAccount           = Omit<Account, "id" | "createdAt">;
export type CreatePortfolioSnapshot = Omit<PortfolioSnapshot, "id" | "createdAt">;
export type CreateNetWorthSnapshot  = Omit<NetWorthSnapshot, "id" | "createdAt">;