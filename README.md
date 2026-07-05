# LanyouLauncher

**LanyouLauncher** 是一个基于 Tauri v2 的 Minecraft 启动器。目前处于 Beta 阶段（v0.1.0-beta）。

## 功能

- 游戏版本管理 — 浏览、下载和管理不同 Minecraft 版本
- 加载器支持 — 支持 Fabric（Forge 安装功能尚未完成）
- 模组浏览 — 集成 Modrinth 和 CurseForge 模组平台
- 账户系统 — 支持微软登录和离线模式
- Java 管理 — 自动检测系统已安装的 Java
- 启动配置 — 自定义内存分配、JVM 参数
- 个性化 — 主题色、壁纸、背景图、窗口透明度调节
- 任务面板 — 可视化下载和启动进度
- 皮肤预览 — 内置 3D 皮肤模型查看器

## 技术栈

- **前端:** React + TypeScript + Tailwind CSS + Zustand + Vite
- **后端:** Rust + Tauri v2

## 开发

```bash
npm install
npm run tauri dev     # 开发模式
npm run tauri build   # 构建安装包
```

## 许可

MIT
