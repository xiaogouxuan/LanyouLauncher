# LanyouLauncher

<p align="center">
  <img src="public/logo.png" alt="LanyouLauncher Logo" width="128" />
</p>

<p align="center">
  <strong>蓝柚启动器</strong> - 一个现代、简洁的 Minecraft 启动器
</p>

<p align="center">
  <a href="https://github.com/xiaogouxuan/LanyouLauncher/releases"><img src="https://img.shields.io/github/v/release/xiaogouxuan/LanyouLauncher?include_prereleases&style=flat-square" alt="Release" /></a>
  <a href="https://gitee.com/xiaogouxuan/lanyou-launcher"><img src="https://img.shields.io/badge/Gitee-%E5%9B%BD%E5%86%85%E9%95%9C%E5%83%8F-c71d23?style=flat-square" alt="Gitee" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg?style=flat-square" alt="License" /></a>
  <img src="https://img.shields.io/badge/status-beta-orange?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/badge/tauri-v2-ffc131?style=flat-square" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/react-18-61dafb?style=flat-square" alt="React 18" />
</p>

---

## 简介

LanyouLauncher 是一个基于 [Tauri v2](https://v2.tauri.app/) 的 Minecraft 启动器。前端使用 React 18 + TypeScript 构建，界面遵循 Material Design 3（MD3）设计语言；后端使用 Rust 实现版本下载、账户认证、游戏启动与进程管理等核心能力。

当前版本为 **0.5.0-beta**，处于公开测试阶段，欢迎试用与反馈。

采用便携式数据布局：启动器数据保存在可执行文件所在目录下的 `LanyouLauncher` 文件夹，游戏数据保存在同目录的 `.minecraft` 文件夹，便于迁移与备份。

---

## 功能

### 游戏与版本

- 浏览 Mojang 官方版本列表，一键下载或删除任意版本。
- 识别 Release、Snapshot、旧版 Beta/Alpha 等版本类型，自动标注愚人节版本。
- 支持 Fabric、Quilt、Forge、NeoForge 四种 Mod 加载器安装。
- 启动前对版本文件进行完整性扫描，自动补全缺失或损坏的文件。
- 下载过程按字节实时显示进度，支持官方源与 BMCLAPI 镜像切换。

### Mod

- 集成 Modrinth 与 CurseForge，支持关键词搜索、版本筛选与分类过滤。
- 下载后自动安装到对应游戏版本，支持启用、禁用与删除。
- 支持版本隔离：为单个版本使用独立的 `.minecraft` 目录，存档、Mod 与配置互不影响。

### 账户

- 微软正版登录，内置 Webview PKCE OAuth 流程，Token 自动刷新。
- 离线模式，支持自定义皮肤。
- 外置登录（authlib-injector），可连接第三方皮肤站。
- 多账号管理，快速切换当前账号。

### 联机

- 基于 EasyTier 的虚拟局域网联机，无需公网 IP 与端口映射。
- 房主创建房间后生成邀请码，客人粘贴邀请码即可加入。
- 自动识别 Minecraft 局域网开放端口，减少端口填写错误。
- 支持一键启动游戏并进入对应房间。
- 内置图文教程弹窗，房主与客人分别提供分步截图指引。

### Java 与启动

- 跨平台自动检测系统中的 Java 运行时，按游戏版本匹配所需 Java 大版本。
- 支持在启动器内下载缺失的 Java。
- 自定义内存分配与 JVM 参数。
- 启动日志实时输出，异常退出时提供崩溃原因分析。

### 界面

- MD3 动态调色板，主题色随壁纸变化，支持浅色、深色与跟随系统。
- 内置多张壁纸，支持自定义背景图、透明度与模糊度调节。
- 无边框透明窗口，毛玻璃效果。
- 任务面板集中展示下载与启动进度。
- 命令面板（Ctrl+K）快速跳转到页面、版本与账号。
- 中英文双语界面。

---

## 技术架构

| 层级 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Tauri v2 | 轻量跨平台桌面框架，Rust 后端 |
| 前端框架 | React 18 + TypeScript | 组件化 UI，路由懒加载 |
| UI 设计 | Material Design 3 | Expressive 主题，动态调色板 |
| 样式方案 | Tailwind CSS + CSS 变量 | 原子化样式，运行时换肤 |
| 状态管理 | Zustand 5 | 轻量状态管理 |
| 路由 | React Router 6 | 单页应用路由 |
| 构建工具 | Vite 6 | 前端构建与开发服务器 |
| 图标库 | Lucide React | SVG 图标 |
| 后端语言 | Rust（edition 2021） | 下载、认证、启动与进程管理 |
| HTTP 客户端 | reqwest + rustls | 异步 HTTP 与 TLS |
| 打包 | Tauri Bundle | NSIS 安装包 |

### 关键 Rust 模块

| 模块 | 说明 |
|------|------|
| `services/auth/microsoft.rs` | 微软 OAuth PKCE 流程：授权、Xbox Live、XSTS、Minecraft 认证与档案获取 |
| `services/auth/thirdparty.rs` | 外置登录：下载 authlib-injector 并注入启动参数 |
| `services/version/download.rs` | 版本下载：清单、客户端 jar、资源索引、依赖库、natives、资源文件与日志配置 |
| `services/version/loader.rs` | 加载器安装：Fabric/Quilt 继承式 JSON，Forge/NeoForge 通过 installer 安装 |
| `services/launch/config.rs` | 启动参数构建：变量替换、条件规则、Log4j 漏洞防护 |
| `services/launch/process.rs` | 进程管理：日志捕获、快速退出检测、终止进程 |
| `services/java/detector.rs` | Java 检测：跨平台搜索、版本解析与匹配 |
| `services/java/downloader.rs` | Java 下载与解压 |
| `services/easytier/` | 联机：EasyTier 核心安装、房间启动、状态与端口检测 |

---

## 环境要求

### 开发环境

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| Node.js | 18+ | 前端运行时 |
| Rust | 1.77.2+ | 后端编译 |
| 系统 C++ 工具链 | - | Windows 需 Visual Studio Build Tools，macOS 需 Xcode CLT，Linux 需 build-essential |
| WebView2 | - | Windows 10/11 自带，Windows 7/8 需手动安装 |

### 运行环境

- Windows 10 及以上
- macOS 10.15 及以上
- Linux（需要 WebKitGTK 2.40 及以上）

---

## 安装

### 下载安装包

Gitee 为国内主仓库，GitHub 为备用镜像。前往以下任一处下载最新版本：

- Gitee Releases（推荐）：https://gitee.com/xiaogouxuan/lanyou-launcher/releases
- GitHub Releases（备用）：https://github.com/xiaogouxuan/LanyouLauncher/releases

- Windows 安装版：`LanyouLauncher_0.5.0_x64-setup.exe`
- Windows 便携版：`LanyouLauncher_0.5.0-portable.exe`

安装包仅用于安装程序本体。首次启动时，启动器会在自身目录创建 `LanyouLauncher` 与 `.minecraft` 文件夹。

### 从源码构建

```bash
# 克隆仓库（Gitee 主仓库）
git clone https://gitee.com/xiaogouxuan/lanyou-launcher.git
cd lanyou-launcher

# 安装前端依赖
npm install

# 开发模式
npm run tauri dev

# 构建生产版本
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`。

注意事项：

- 首次构建时 Cargo 需要下载并编译 Rust 依赖，耗时较长。
- Windows 用户需安装 [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)，并勾选「使用 C++ 的桌面开发」工作负载。
- Linux 用户需安装 `libwebkit2gtk-4.1-dev`、`libgtk-3-dev` 等系统依赖，详见 [Tauri 官方文档](https://v2.tauri.app/start/prerequisites/)。

---

## 使用指南

### 启动 Minecraft

1. 在「账号」页面添加微软正版账号、离线账号或外置登录账号。
2. 在「版本」页面选择目标版本并下载；可在「设置」中切换下载源。
3. 如需 Mod，可在版本详情页安装 Fabric、Forge、Quilt 或 NeoForge。
4. 在「设置」中调整内存分配与 JVM 参数。
5. 回到主页，确认版本与账号后点击「启动游戏」。

### 安装 Mod

1. 进入「Mod」页面，输入名称搜索。
2. 切换 Modrinth 或 CurseForge 平台查看结果。
3. 打开 Mod 详情页，选择适配版本后安装。
4. 已安装的 Mod 可在管理界面启用、禁用或删除。

### 联机

1. 房主在「联机」页面选择「我是房主」，填写房间名称与连接密钥。
2. 房主启动游戏并进入世界，按 Esc 打开「对局域网开放」，记录端口。
3. 回到启动器，确认局域网端口一致后点击「创建房间」。
4. 复制邀请码发送给好友。
5. 好友选择「我是客人」，粘贴邀请码并加入房间。
6. 连接成功后，双方均可点击「一键进入游戏」。

启动器内提供完整图文教程，首次进入联机页面会自动弹出，也可通过页面右上角「图文教程」重新查看。

注意：游戏内开放端口必须与启动器填写的端口一致；双方需要使用相同的 Minecraft 版本。

### 主题定制

进入「设置」的个性化区域：

- 切换浅色、深色或跟随系统。
- 选择主题色，界面会随壁纸动态调整。
- 选择内置壁纸或上传自定义背景图。
- 调整背景透明度与模糊度。

### 皮肤

- 离线账号可选取本地 PNG 图片作为皮肤。
- 在皮肤预览页面可旋转查看 3D 模型，支持双层皮肤渲染。

---

## 项目结构

```
src/
├── components/      # UI 组件
│   ├── layout/      #   布局组件
│   ├── common/      #   通用组件
│   ├── ui/          #   基础 UI 组件
│   ├── game/        #   游戏相关组件
│   ├── account/     #   账号相关组件
│   ├── mod/         #   Mod 相关组件
│   ├── multiplayer/ #   联机与图文教程组件
│   └── task/        #   任务面板组件
├── pages/           # 页面组件
├── stores/          # Zustand 状态管理
├── services/        # Tauri API 调用封装
├── i18n/            # 国际化
│   └── locales/     #   翻译文件
├── types/           # TypeScript 类型定义
├── router/          # 路由配置
└── utils/           # 工具函数

src-tauri/src/
├── commands/        # Tauri Commands
├── models/          # 数据模型
├── services/        # 核心业务逻辑
│   ├── auth/        #   认证服务
│   ├── java/        #   Java 检测与下载
│   ├── launch/      #   启动服务
│   ├── mod_platform/#   Mod 平台对接
│   ├── easytier/    #   联机服务
│   ├── update/      #   更新服务
│   └── version/     #   版本服务
├── state/           # 全局应用状态
├── i18n/            # 后端国际化错误消息
└── utils/           # 工具函数

public/
├── img/             # 加载器图标与装饰图片
├── tutorial/        # 联机图文教程截图
├── logo.png         # 应用图标
└── app-icon.png     # 窗口图标
```

---

## 技术栈

| 类型 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Tauri | v2 |
| 前端 | React + TypeScript | 18.3 |
| UI 设计 | Material Design 3 | Expressive |
| 样式 | Tailwind CSS + CSS 变量 | 3.4 |
| 状态管理 | Zustand | 5.0 |
| 路由 | React Router | 6.28 |
| 构建 | Vite | 6.0 |
| 图标 | Lucide React | 0.468 |
| 后端 | Rust | edition 2021 |
| HTTP | reqwest + rustls | 0.12 |
| 异步 | Tokio | 1 |

### Tauri 插件

| 插件 | 用途 |
|------|------|
| `plugin-shell` | Shell 操作 |
| `plugin-dialog` | 原生文件对话框 |
| `plugin-fs` | 文件系统访问 |
| `plugin-process` | 进程管理 |
| `plugin-notification` | 系统通知 |
| `plugin-store` | 键值存储 |
| `plugin-updater` | 自动更新 |
| `plugin-log` | 调试日志 |

---

## 常见问题

**启动器无法启动，提示缺少 WebView2**

Windows 10/11 通常自带 WebView2。若缺失，请从微软官网安装 WebView2 Runtime。

**游戏启动后立即退出**

打开启动日志查看错误信息。常见原因包括 Java 版本不匹配、内存不足、Mod 冲突或版本文件损坏。启动器会给出对应的诊断提示。

**联机时好友无法连接**

确认双方使用相同游戏版本，房主在游戏内开放的端口与启动器填写的端口完全一致，邀请码完整复制。

**下载速度慢**

在设置中切换下载源为 BMCLAPI 镜像。

---

## 贡献

欢迎提交 Issue 与 Pull Request。

### 反馈问题

请在 Gitee Issues（主）或 GitHub Issues（备用）提交，并附上：

- 操作系统与版本
- 启动器版本号
- 问题描述与复现步骤
- 相关截图或日志

Gitee Issues：https://gitee.com/xiaogouxuan/lanyou-launcher/issues
GitHub Issues：https://github.com/xiaogouxuan/LanyouLauncher/issues

### 提交代码

1. Fork 本仓库。
2. 创建分支，命名遵循 `feat/xxx`、`fix/xxx`、`refactor/xxx`、`docs/xxx`。
3. 提交前执行检查：

```bash
npm run build
cd src-tauri && cargo check
```

4. 提交信息遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/)，常用类型：

- `feat`：新功能
- `fix`：问题修复
- `refactor`：代码重构
- `docs`：文档更新
- `style`：格式调整
- `chore`：构建或工具链变更

5. 推送分支并发起 Pull Request。

### 开发约定

- 页面组件使用 `React.lazy` 懒加载，新增页面需在 `src/router/index.tsx` 注册路由。
- 全局状态在 `src/stores/` 下创建。
- 新增 Tauri Command 需在 `src-tauri/src/lib.rs` 注册。
- 所有用户可见文本使用 `t("key")`，翻译文件位于 `src/i18n/locales/`。
- 前端类型需与 `src-tauri/src/models/` 中的 Rust 结构保持一致。

---

## 许可证

本项目基于 [GNU General Public License v3.0](LICENSE)（GPL-3.0）开源。

你可以自由使用、修改和分发本项目，但分发衍生作品时必须保留相同的开源许可证，并提供完整的源代码。

---

<p align="center">
  LanyouLauncher 由 <a href="https://space.bilibili.com/3546803513329823">1B2T服务器维护团队</a> 维护
</p>
