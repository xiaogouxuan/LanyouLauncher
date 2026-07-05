import { create } from "zustand";
import type { LaunchConfig, LogEntry, LaunchProgress } from "@/types/launch";

const defaultLaunchConfig: LaunchConfig = {
  version_id: "",
  account_id: "",
  memory_min: 1024,
  memory_max: 4096,
  jvm_args: [],
  resolution_width: 854,
  resolution_height: 480,
  java_path: "java",
  game_dir: null,
};

const defaultLaunchProgress: LaunchProgress = {
  step: 0,
  total: 5,
  label: "",
};

interface LaunchState {
  isLaunching: boolean;
  isRunning: boolean;
  logs: LogEntry[];
  launchConfig: LaunchConfig;
  launchProgress: LaunchProgress;
  setIsLaunching: (v: boolean) => void;
  setIsRunning: (v: boolean) => void;
  setLaunchConfig: (config: Partial<LaunchConfig>) => void;
  appendLog: (entry: LogEntry) => void;
  clearLogs: () => void;
  resetConfig: () => void;
  setLaunchFailed: (entry: LogEntry) => void;
  setLaunchProgress: (progress: Partial<LaunchProgress>) => void;
  resetLaunchProgress: () => void;
}

export const useLaunchStore = create<LaunchState>()((set) => ({
  isLaunching: false,
  isRunning: false,
  logs: [],
  launchConfig: { ...defaultLaunchConfig },
  launchProgress: { ...defaultLaunchProgress },
  setIsLaunching: (v) => set({ isLaunching: v }),
  setIsRunning: (v) => set({ isRunning: v }),
  setLaunchConfig: (config) =>
    set((s) => ({
      launchConfig: { ...s.launchConfig, ...config },
    })),
  appendLog: (entry) =>
    set((s) => ({
      logs: [...s.logs.slice(-500), entry],
    })),
  clearLogs: () => set({ logs: [] }),
  resetConfig: () => set({ launchConfig: { ...defaultLaunchConfig } }),
  setLaunchFailed: (entry) =>
    set((s) => ({
      isLaunching: false,
      isRunning: false,
      launchProgress: { ...defaultLaunchProgress },
      logs: [...s.logs.slice(-500), entry],
    })),
  setLaunchProgress: (progress) =>
    set((s) => ({
      launchProgress: { ...s.launchProgress, ...progress },
    })),
  resetLaunchProgress: () => set({ launchProgress: { ...defaultLaunchProgress } }),
}));