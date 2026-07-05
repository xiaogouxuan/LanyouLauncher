# LanyouLauncher

**LanyouLauncher** 是一个基于 Tauri v2 的 Minecraft 启动器，前端使用 React + TypeScript 构建，UI 采用 Material Design 3（MD3）设计语言。

目前处于 **Beta 阶段**（v0.1.0-beta）。

## 功能

- **游戏版本管理** — 浏览官方版本列表，下载和删除不同 Minecraft 版本
- **加载器支持** — 支持安装 Fabric 加载器（Forge 安装功能尚未完成）
- **模组浏览** — 集成 Modrinth 和 CurseForge 平台，支持搜索和筛选
- **账户系统** — 支持微软正版登录和离线模式
- **Java 管理** — 自动检测系统中已安装的 Java 运行时
- **启动配置** — 自定义内存分配、下载源（官方/镜像），支持版本隔离
- **个性主题** — 可自定义主题色，支持浅色/深色/跟随系统，内置壁纸和自定义背景图
- **毛玻璃效果** — 支持背景透明度、模糊度调节
- **任务面板** — 可视化展示下载和启动进度
- **皮肤预览** — 内置 3D 皮肤模型查看器
- **自动更新** — 支持检查 GitHub Release 更新

## 技术栈

- **前端框架:** React 18 + TypeScript
- **UI 设计:** Material Design 3（MD3）Expressive 主题
- **样式方案:** Tailwind CSS + CSS 变量动态换肤
- **状态管理:** Zustand
- **路由:** React Router 6
- **构建工具:** Vite 6
- **桌面框架:** Tauri v2（Rust 后端）
- **图标库:** Lucide React

## 开发

```bash
# 安装依赖
npm install

# 启动开发模式
npm run tauri dev

# 构建安装包
npm run tauri build
```

## 许可

MIT
