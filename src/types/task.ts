export type TaskType = "version_download" | "mod_download" | "game_launch";

export type TaskStatus = "pending" | "running" | "success" | "error";

export interface Task {
  id: string;
  type: TaskType;
  title: string;
  status: TaskStatus;
  progress: number; // 0-100
  total?: number;
  current?: number;
  message?: string;
  speed?: number; // bytes per second
  stage?: string;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export interface TaskProgressUpdate {
  id?: string;
  progress?: number;
  total?: number;
  current?: number;
  message?: string;
  speed?: number;
  stage?: string;
  status?: TaskStatus;
  error?: string;
}
