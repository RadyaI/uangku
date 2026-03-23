import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/utils/firebase";
import { Account, COLLECTIONS } from "@/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InvestmentTopup {
  id: string;
  accountId: string;
  amount: number;
  note: string;
  date: Timestamp;
  createdAt: Timestamp;
  fromAccountId?: string;
}

export type CreateInvestmentTopup = Omit<InvestmentTopup, "id" | "createdAt">;

const TOPUP_COLLECTION = "investmentTopups";

// ─── Investment Topup CRUD ───────────────────────────────────────────────────

export async function getInvestmentTopups(accountId: string): Promise<InvestmentTopup[]> {
  try {
    const q = query(
      collection(db, TOPUP_COLLECTION),
      where("accountId", "==", accountId),
      orderBy("date", "desc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as InvestmentTopup));
  } catch (err) {
    console.error("[getInvestmentTopups]", err);
    throw err;
  }
}

export async function createInvestmentTopup(data: CreateInvestmentTopup): Promise<string> {
  try {
    const batch = writeBatch(db);

    // Simpan record topup
    const topupRef = doc(collection(db, TOPUP_COLLECTION));
    batch.set(topupRef, {
      ...data,
      createdAt: serverTimestamp(),
    });

    // Update balance akun investasi tujuan
    const investRef = doc(db, COLLECTIONS.accounts, data.accountId);
    const investSnap = await getDoc(investRef);
    if (investSnap.exists()) {
      const acc = investSnap.data() as Account;
      batch.update(investRef, { balance: acc.balance + data.amount });
    }

    // Kalau topup dari akun bank, kurangi balance bank
    if (data.fromAccountId) {
      const bankRef = doc(db, COLLECTIONS.accounts, data.fromAccountId);
      const bankSnap = await getDoc(bankRef);
      if (bankSnap.exists()) {
        const bankAcc = bankSnap.data() as Account;
        batch.update(bankRef, { balance: bankAcc.balance - data.amount });
      }
    }

    await batch.commit();
    return topupRef.id;
  } catch (err) {
    console.error("[createInvestmentTopup]", err);
    throw err;
  }
}

export async function deleteInvestmentTopup(id: string): Promise<void> {
  try {
    const snap = await getDoc(doc(db, TOPUP_COLLECTION, id));
    if (!snap.exists()) return;

    const topup = { id: snap.id, ...snap.data() } as InvestmentTopup;
    const batch = writeBatch(db);

    // Hapus record topup
    batch.delete(doc(db, TOPUP_COLLECTION, id));

    // Kembalikan balance akun investasi
    const investRef = doc(db, COLLECTIONS.accounts, topup.accountId);
    const investSnap = await getDoc(investRef);
    if (investSnap.exists()) {
      const acc = investSnap.data() as Account;
      batch.update(investRef, { balance: acc.balance - topup.amount });
    }

    // Kembalikan balance akun bank kalau topup dari bank
    if (topup.fromAccountId) {
      const bankRef = doc(db, COLLECTIONS.accounts, topup.fromAccountId);
      const bankSnap = await getDoc(bankRef);
      if (bankSnap.exists()) {
        const bankAcc = bankSnap.data() as Account;
        batch.update(bankRef, { balance: bankAcc.balance + topup.amount });
      }
    }

    await batch.commit();
  } catch (err) {
    console.error("[deleteInvestmentTopup]", err);
    throw err;
  }
}

// ─── Kalkulasi Total Modal ────────────────────────────────────────────────────
// Hitung total modal dari riwayat topup

export async function getTotalInvestedFromTopups(accountId: string): Promise<number> {
  try {
    const topups = await getInvestmentTopups(accountId);
    return topups.reduce((s, t) => s + t.amount, 0);
  } catch (err) {
    console.error("[getTotalInvestedFromTopups]", err);
    throw err;
  }
}