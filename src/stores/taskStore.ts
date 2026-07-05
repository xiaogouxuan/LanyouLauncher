import { create } from "zustand";
import type { Task, TaskProgressUpdate, TaskType, TaskStatus } from "@/types/task";

interface TaskState {
  tasks: Task[];
  addTask: (task: Omit<Task, "createdAt" | "updatedAt">) => void;
  updateTask: (id: string, update: TaskProgressUpdate) => void;
  removeTask: (id: string) => void;
  clearCompleted: () => void;
}

export const useTaskStore = create<TaskState>()((set) => ({
  tasks: [],
  addTask: (task) =>
    set((s) => {
      const now = Date.now();
      if (s.tasks.some((t) => t.id === task.id)) return s;
      return {
        tasks: [
          {
            ...task,
            createdAt: now,
            updatedAt: now,
          },
          ...s.tasks,
        ],
      };
    }),
  updateTask: (id, update) =>
    set((s) => ({
      tasks: s.tasks.map((t) =>
        t.id === id
          ? {
              ...t,
              progress: update.progress ?? t.progress,
              total: update.total ?? t.total,
              current: update.current ?? t.current,
              message: update.message ?? t.message,
              speed: update.speed ?? t.speed,
              stage: update.stage ?? t.stage,
              status: update.status ?? t.status,
              error: update.error ?? t.error,
              updatedAt: Date.now(),
            }
          : t
      ),
    })),
  removeTask: (id) =>
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== id),
    })),
  clearCompleted: () =>
    set((s) => ({
      tasks: s.tasks.filter((t) => t.status !== "success" && t.status !== "error"),
    })),
}));

export function createTaskId(type: TaskType, key: string): string {
  return `${type}:${key}:${Date.now()}`;
}
