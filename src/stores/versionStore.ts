import { create } from "zustand";
import type { VersionInfo, DownloadProgress } from "@/types/version";

interface VersionState {
  installedVersions: VersionInfo[];
  remoteVersions: VersionInfo[];
  downloadProgress: Record<string, DownloadProgress>;
  loading: boolean;
  setInstalledVersions: (versions: VersionInfo[]) => void;
  setRemoteVersions: (versions: VersionInfo[]) => void;
  setDownloadProgress: (id: string, progress: DownloadProgress) => void;
  setLoading: (loading: boolean) => void;
  addInstalledVersion: (version: VersionInfo) => void;
  removeInstalledVersion: (id: string) => void;
}

export const useVersionStore = create<VersionState>()((set) => ({
  installedVersions: [],
  remoteVersions: [],
  downloadProgress: {},
  loading: false,
  setInstalledVersions: (versions) => set({ installedVersions: versions }),
  setRemoteVersions: (versions) => set({ remoteVersions: versions }),
  setDownloadProgress: (id, progress) =>
    set((s) => ({
      downloadProgress: { ...s.downloadProgress, [id]: progress },
    })),
  setLoading: (loading) => set({ loading }),
  addInstalledVersion: (version) =>
    set((s) => ({
      installedVersions: [...s.installedVersions, version],
    })),
  removeInstalledVersion: (id) =>
    set((s) => ({
      installedVersions: s.installedVersions.filter((v) => v.id !== id),
    })),
}));