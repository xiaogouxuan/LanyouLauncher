import { create } from "zustand";
import type { ModInfo, ModFilter } from "@/types/mod";

interface ModState {
  installedMods: ModInfo[];
  searchResults: ModInfo[];
  searchLoading: boolean;
  setInstalledMods: (mods: ModInfo[]) => void;
  setSearchResults: (mods: ModInfo[]) => void;
  setSearchLoading: (loading: boolean) => void;
  addMod: (mod: ModInfo) => void;
  removeMod: (id: string) => void;
  updateMod: (id: string, updates: Partial<ModInfo>) => void;
}

export const useModStore = create<ModState>()((set) => ({
  installedMods: [],
  searchResults: [],
  searchLoading: false,
  setInstalledMods: (mods) => set({ installedMods: mods }),
  setSearchResults: (mods) => set({ searchResults: mods }),
  setSearchLoading: (loading) => set({ searchLoading: loading }),
  addMod: (mod) =>
    set((s) => ({ installedMods: [...s.installedMods, mod] })),
  removeMod: (id) =>
    set((s) => ({
      installedMods: s.installedMods.filter((m) => m.id !== id),
    })),
  updateMod: (id, updates) =>
    set((s) => ({
      installedMods: s.installedMods.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),
}));