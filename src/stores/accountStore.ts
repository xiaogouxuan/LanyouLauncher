import { create } from "zustand";
import type { Account } from "@/types/account";

interface AccountState {
  accounts: Account[];
  activeAccount: Account | null;
  loading: boolean;
  setAccounts: (accounts: Account[]) => void;
  setActiveAccount: (account: Account | null) => void;
  setLoading: (loading: boolean) => void;
  addAccount: (account: Account) => void;
  removeAccount: (id: string) => void;
  updateAccount: (id: string, updates: Partial<Account>) => void;
}

export const useAccountStore = create<AccountState>()((set) => ({
  accounts: [],
  activeAccount: null,
  loading: false,
  setAccounts: (accounts) => set({ accounts }),
  setActiveAccount: (account) => set({ activeAccount: account }),
  setLoading: (loading) => set({ loading }),
  addAccount: (account) =>
    set((s) => ({ accounts: [...s.accounts, account] })),
  removeAccount: (id) =>
    set((s) => ({
      accounts: s.accounts.filter((a) => a.id !== id),
      activeAccount:
        s.activeAccount?.id === id ? null : s.activeAccount,
    })),
  updateAccount: (id, updates) =>
    set((s) => ({
      accounts: s.accounts.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
      activeAccount:
        s.activeAccount?.id === id
          ? { ...s.activeAccount, ...updates }
          : s.activeAccount,
    })),
}));