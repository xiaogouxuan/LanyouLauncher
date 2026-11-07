export type TaskType = "version_download" | "mod_download" | "game_launch";

export type TaskStatus = "pending" | "running" | "success" | "error";

export interface Task {
  id: string;
  type: TaskType;
  title: string;
  status: TaskStatus;

  // 任务进度百分比，取值 0-100
  progress: number;

  total?: number;
  current?: number;
  message?: string;

  // 下载速度，单位字节每秒
  speed?: number;

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
