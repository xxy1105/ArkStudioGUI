# Ark Studio GUI · Code Wiki

> 用于调用火山方舟（Volcengine Ark）大模型的内容生成能力的跨平台桌面 GUI。
> 当前前端实现聚焦于 **Seedance / CGT（Content Generation Task）视频生成** 异步任务流，主进程同时暴露了 Seedream 图片生成的 IPC 通道。

---

## 目录

1. [项目概述](#1-项目概述)
2. [项目整体架构](#2-项目整体架构)
3. [目录结构](#3-目录结构)
4. [技术栈与依赖关系](#4-技术栈与依赖关系)
5. [主要模块职责](#5-主要模块职责)
6. [关键类与函数说明](#6-关键类与函数说明)
7. [核心业务流程](#7-核心业务流程)
8. [IPC 通信契约](#8-ipc-通信契约)
9. [项目运行方式](#9-项目运行方式)
10. [打包与发布](#10-打包与发布)
11. [配置说明](#11-配置说明)
12. [安全设计要点](#12-安全设计要点)
13. [已知差异与注意事项](#13-已知差异与注意事项)

---

## 1. 项目概述

**Ark Studio GUI** 是一个基于 Electron + React + Vite + TypeScript 构建的桌面应用，封装了火山方舟 Ark API v3 的内容生成能力，提供图形化界面供用户：

- 配置 API Key 与计费方式（按量计费 / Agent Plan 套餐）。
- 编排文本提示词与多模态素材（图片 / 视频 / 音频 URL，或本地图片）。
- 发起异步视频生成任务（CGT），并维护一张「请求卡片」列表用于跟踪任务状态、预览结果、下载产物。
- 通过 Electron 主进程安全地访问文件系统、系统对话框与外部浏览器。

**默认 API 端点**：`https://ark.cn-beijing.volces.com/api/v3`

**默认视频模型**：`doubao-seedance-2-0-260128`（可在界面修改为其它 Model ID 或 Endpoint ID）。

---

## 2. 项目整体架构

应用采用经典的三层 Electron 架构：

```
┌──────────────────────────────────────────────────────────────────┐
│                      渲染进程 (React UI)                          │
│  src/main.tsx ──> src/App.tsx                                    │
│  - 状态管理 (useState)                                            │
│  - 表单编排 / 卡片列表 / 结果展示                                  │
│  - 通过 window.arkDesktop.* 调用桌面能力                          │
└────────────────────────────┬─────────────────────────────────────┘
                             │  contextBridge (contextIsolation)
┌────────────────────────────┴─────────────────────────────────────┐
│                    预加载脚本 (preload.cjs)                        │
│  electron/preload.cjs                                             │
│  - 暴露受限的 arkDesktop API 到 window                            │
│  - 仅转发 ipcRenderer.invoke，不泄漏 Node 能力                    │
└────────────────────────────┬─────────────────────────────────────┘
                             │  ipcMain.handle / ipcRenderer.invoke
┌────────────────────────────┴─────────────────────────────────────┐
│                      主进程 (Electron Main)                       │
│  electron/main.cjs                                                │
│  - 创建 BrowserWindow（contextIsolation / 禁用 nodeIntegration）  │
│  - 校验 Base URL / API Key                                        │
│  - 代理 Ark HTTP 请求 (fetch)                                     │
│  - 文件选择 / 下载 / 外部链接打开                                  │
└────────────────────────────┬─────────────────────────────────────┘
                             │  HTTPS
                             ▼
                火山方舟 Ark API v3
```

**关键设计原则**：

- **能力隔离**：渲染进程无法直接发起网络请求或访问文件系统，所有特权操作必须经 preload 暴露的 `arkDesktop` 对象，再由主进程校验后执行。
- **协议白名单**：主进程对所有外部 URL 仅放行 `http:` / `https:`，避免 `file:` 等协议滥用。
- **API Key 不落主进程**：Key 由渲染进程持有（可选写入 `localStorage`），每次调用随 payload 传入主进程，主进程即时校验、即时丢弃。
- **开发/生产双模式**：开发态加载 `http://127.0.0.1:5173`（Vite Dev Server）并打开 DevTools；生产态加载打包后的 `dist/index.html`。

---

## 3. 目录结构

```
ark-studio-gui/
├── electron/                 # Electron 主进程相关
│   ├── main.cjs              # 主进程入口：窗口、IPC、Ark 请求代理、文件操作
│   └── preload.cjs           # 预加载脚本：向渲染进程暴露 arkDesktop API
├── scripts/
│   └── push.sh               # Git 一键 add/commit/push 辅助脚本
├── src/                      # 前端源码（Vite 入口）
│   ├── App.tsx               # 应用主体（状态、表单、卡片、所有子组件）
│   ├── main.tsx              # React 渲染入口
│   ├── styles.css            # 全局样式与 CSS 变量
│   └── vite-env.d.ts         # Vite 类型引用 + 全局类型 (PickedImage / ArkDesktopApi / Window)
├── index.html                # HTML 模板，挂载 #root
├── package.json              # 依赖、脚本、electron-builder 配置
├── tsconfig.json             # TypeScript 编译选项
├── vite.config.ts            # Vite 配置（base、react 插件、端口）
├── README.md                 # 项目说明
└── LICENSE                   # MIT
```

---

## 4. 技术栈与依赖关系

### 运行时依赖（dependencies）

| 依赖 | 用途 |
| --- | --- |
| `react` / `react-dom` | UI 框架与 DOM 渲染（版本跟随 `latest`） |

### 开发依赖（devDependencies）

| 依赖 | 用途 |
| --- | --- |
| `vite` | 前端构建与开发服务器（端口 5173，strictPort） |
| `@vitejs/plugin-react` | Vite 的 React Fast Refresh 支持 |
| `typescript` | 类型检查（`tsconfig.json` 启用 strict） |
| `@types/react` / `@types/react-dom` | React 类型定义 |
| `electron` | 跨平台桌面运行时 |
| `electron-builder` | 打包为 dmg/zip（macOS）、nsis/portable（Windows） |
| `concurrently` | 并行启动 Vite 与 Electron（`npm run dev`） |
| `wait-on` | 等待 Vite 就绪后再启动 Electron |

### 依赖关系图（模块层）

```
index.html
   └── src/main.tsx
         ├── src/styles.css
         └── src/App.tsx
               └── window.arkDesktop (来自 preload.cjs)
                     └── ipcRenderer.invoke
                           └── electron/main.cjs (ipcMain.handle)
                                 ├── Ark API (fetch)
                                 ├── dialog (文件选择/保存)
                                 ├── fs (读写文件)
                                 └── shell (外部链接)
```

---

## 5. 主要模块职责

### 5.1 主进程 — [electron/main.cjs](file:///workspace/electron/main.cjs)

负责所有需要 Node/Electron 特权的操作：

1. **窗口管理**：`createWindow()` 创建 1280×860 的 `BrowserWindow`，配置 `contextIsolation: true`、`nodeIntegration: false`，并加载 preload。
2. **导航安全**：拦截 `setWindowOpenHandler`（仅允许 http/https 跳转到外部浏览器）与 `will-navigate`（禁止页面内导航离开当前 URL）。
3. **Ark 请求代理**：`arkRequest()` 统一处理 Base URL 规范化、API Key 校验、`Bearer` 鉴权头、响应解析与错误抛出。
4. **IPC 处理器**：注册 `ark:generateImage`、`ark:createVideoTask`、`ark:getVideoTask`、`file:pickImage`、`file:downloadUrl`、`shell:openExternal` 六个通道。
5. **文件操作**：图片选择（多选 + 转 base64 dataUrl）、URL 下载（流式 `pipeline` 写入用户选择的路径）。

### 5.2 预加载脚本 — [electron/preload.cjs](file:///workspace/electron/preload.cjs)

通过 `contextBridge.exposeInMainWorld('arkDesktop', ...)` 向渲染进程注入一个**受限 API 对象**，每个方法都只是 `ipcRenderer.invoke` 的薄封装，不暴露任何 Node 能力或 IPC 内部细节。

### 5.3 渲染层入口 — [src/main.tsx](file:///workspace/src/main.tsx)

使用 `ReactDOM.createRoot` 在 `#root` 上以 `StrictMode` 渲染 `<App />`，并引入全局样式 `styles.css`。

### 5.4 应用主体 — [src/App.tsx](file:///workspace/src/App.tsx)

单文件承载全部前端逻辑，包含：

- **类型定义**：`AppSettings`、`BillingType`、`VideoStatus`、`MediaItem`、`RequestMedia`、`RequestCard`、`CgtForm`。
- **工具函数**：URL/Key 规范化、状态标签映射、时间格式化、JSON 美化、请求体构造与校验等。
- **`App` 组件**：顶层状态管理（settings、form、cards、activeId、loading、error 等）与事件处理（保存配置、选图、提交、刷新、下载、外链打开）。
- **子组件**：`RequestCardView`、`ResultSummary`、`ApiKeyInput`、`MediaBlock`。

### 5.5 类型声明 — [src/vite-env.d.ts](file:///workspace/src/vite-env.d.ts)

声明全局类型 `PickedImage`、`ArkDesktopApi`，并扩展 `Window` 接口加入可选 `arkDesktop` 字段，使渲染层能类型安全地调用桌面 API。

### 5.6 辅助脚本 — [scripts/push.sh](file:///workspace/scripts/push.sh)

Bash 脚本，封装 `git add -A && git commit && git push`，支持将命令行参数作为提交信息，无改动时安全退出。

---

## 6. 关键类与函数说明

### 6.1 类型定义（src/App.tsx）

| 类型 | 说明 |
| --- | --- |
| `AppSettings` | 应用配置，目前仅含 `apiKey: string`。 |
| `BillingType` | 计费类型联合：`'pay_as_you_go' \| 'agent_plan'`。 |
| `VideoStatus` | Ark CGT 任务响应结构，含 `id/task_id`、`status`、`content.video_url`、`usage`、`seed`、`resolution`、`ratio`、`duration`、`error` 等字段，并带 `[key: string]: unknown` 索引签名以兼容扩展字段。 |
| `MediaItem` | 素材条目：`{ label, value, preview? }`。 |
| `RequestMedia` | 一次请求涉及的媒体集合：`{ images, videos, audio }`。 |
| `RequestCard` | 单张请求卡片的状态快照：`id`、`status`、`createdAt/updatedAt`、`billingType`、`model`、`prompt`、`body`、`media`、`response`、`errorMessage`。 |
| `CgtForm` | 表单状态：`billingType`、`model`、`prompt`、`ratio`、`duration`、`imageUrls/videoUrls/audioUrls`（多行 URL 文本）、`watermark`、`generateAudio`。 |

### 6.2 全局类型（src/vite-env.d.ts）

| 类型 | 说明 |
| --- | --- |
| `PickedImage` | 本地选择的图片：`{ filePath, name, dataUrl }`，`dataUrl` 为 base64 形式。 |
| `ArkDesktopApi` | preload 暴露的桌面 API 接口，包含 6 个方法（见 [第 8 节](#8-ipc-通信契约)）。 |

### 6.3 工具函数（src/App.tsx）

| 函数 | 签名 | 职责 |
| --- | --- | --- |
| `splitLines` | `(value: string) => string[]` | 按行拆分 URL，去除首尾空白与成对反引号，过滤空行。 |
| `prettyJson` | `(value: unknown) => string` | 以 2 空格缩进序列化 JSON，用于卡片中的 `<pre>` 展示。 |
| `normalizeApiKey` | `(value: string) => string` | 去除首尾空白，剥离前缀 `Bearer `（大小写不敏感）。 |
| `maskApiKey` | `(value: string) => string` | 脱敏显示：保留前 3 + 后 3 位，中间以 `•` 填充。 |
| `isArkApiKey` | `(value: string) => boolean` | 判断是否以 `ark-` 开头。 |
| `normalizeSettings` | `(settings) => AppSettings` | 规范化配置对象（目前仅处理 apiKey）。 |
| `getVideoTaskId` | `(response, fallbackId?) => string` | 优先取 `id`，其次 `task_id`，最后回退值，均 trim。 |
| `getStatusLabel` | `(status?) => string` | 状态码 → 中文标签映射（queued/running/succeeded/failed/expired/cancelled/created）。 |
| `getStatusClass` | `(status?) => string` | 状态码 → CSS 类名（success/failed/pending）。 |
| `getBillingLabel` | `(value) => string` | 计费类型 → 显示名。 |
| `getBillingHint` | `(value) => string` | 计费类型 → 提示文案。 |
| `getBillingLink` | `(value) => {label, href}` | 计费类型 → 控制台跳转链接。 |
| `safeFileName` | `(prefix, ext) => string` | 生成带 ISO 时间戳的文件名（`:` `.` 替换为 `-`）。 |
| `formatTime` | `(timestamp) => string` | 毫秒时间戳 → 本地化字符串。 |
| `formatUnixTime` | `(value?) => string` | 秒级 Unix 时间戳 → 本地化字符串，空值返回「无」。 |
| `formatValue` | `(value) => string` | 通用值格式化：空 → 「无」，布尔 → 「是/否」，其它转字符串。 |
| `cleanUrl` | `(value?) => string` | 去除 URL 首尾空白与反引号。 |
| `buildRequest` | `(form, pickedImages) => {body, media, prompt}` | **核心**：把表单与本地图组装为 Ark CGT 请求体 `content[]`（text/image_url/video_url/audio_url 条目）及展示用 `media`。 |
| `validateRequest` | `(form, media, body) => void` | 校验：模型必填、内容非空、音频不可单独使用。失败抛 `Error`。 |

### 6.4 组件（src/App.tsx）

#### `App`
顶层组件。管理所有状态：`settings`、`rememberKey`、`form`、`pickedImages`、`cards`、`activeId`、`loading`、`statusMessage`、`error`。提供事件处理函数：

- `updateSetting` / `updateForm`：受控更新。
- `saveSettings`：校验 `ark-` 前缀，按 `rememberKey` 写入或清除 `localStorage`。
- `pickImages`：调用 `window.arkDesktop.pickImage()` 追加本地图。
- `submit`：构造 + 校验 + 调用 `createVideoTask`，成功后新建/更新卡片（最多保留 30 条）。
- `refreshCard`：调用 `getVideoTask` 拉取最新状态并更新卡片。
- `openExternal` / `downloadVideo`：调用桌面能力打开外链或下载视频。

渲染结构：顶栏 → 配置条（套餐/API Key/链接/记住 Key/保存） → 错误横幅 → 双栏布局（左侧表单 + 右侧卡片列表）。

#### `RequestCardView`
单张卡片的展示组件。展示 CGT ID、模型/计费、状态徽章、时间、文本、媒体块、结果摘要、视频预览与下载、尾帧、错误信息、刷新按钮，以及可折叠的请求/响应 JSON。

#### `ResultSummary`
将 `VideoStatus` 响应按「基本信息 / 用量 / 生成参数 / 执行参数」四组字段网格化展示，并单独显示视频 URL。

#### `ApiKeyInput`
带脱敏的 API Key 输入组件。默认显示脱敏文本（点击进入编辑态），编辑时为 `password` 输入框，1 秒无输入或失焦/回车/Esc/Tab 时自动退出编辑并脱敏。使用 `useRef` 管理 setTimeout 句柄，卸载时清理。

#### `MediaBlock`
通用媒体展示块，支持 `image`（带预览图网格）/ `video` / `audio`（列表）三种形态，对 http 开头的 URL 提供「打开」按钮。

### 6.5 主进程关键函数（electron/main.cjs）

| 函数 | 职责 |
| --- | --- |
| `isDev()` | 通过 `app.isPackaged` 判断是否开发态。 |
| `createWindow()` | 创建主窗口，配置安全 webPreferences，按开发/生产加载不同 URL。 |
| `normalizeBaseUrl(baseUrl)` | 规范化 Base URL：trim、去尾部斜杠、URL 解析、协议白名单校验。 |
| `ensureApiKey(apiKey)` | 校验非空并剥离 `Bearer ` 前缀，失败抛错。 |
| `parseHttpUrl(url)` | 解析并校验仅 http/https 协议，返回规范 URL。 |
| `isHttpUrl(url)` | `parseHttpUrl` 的布尔包装，吞掉异常。 |
| `readArkResponse(resp)` | 读取响应文本，尝试 JSON 解析（失败则 `{raw}`），非 2xx 抛出友好错误信息。 |
| `arkRequest({apiKey, baseUrl, method, path, body})` | 统一 Ark 请求入口：拼 URL、设鉴权头、发 fetch、读响应。 |

### 6.6 IPC 处理器（electron/main.cjs）

| 通道 | 入参 | 行为 |
| --- | --- | --- |
| `ark:generateImage` | `{apiKey, baseUrl, body}` | `POST /images/generations` |
| `ark:createVideoTask` | `{apiKey, baseUrl, body}` | `POST /contents/generations/tasks` |
| `ark:getVideoTask` | `{apiKey, baseUrl, id}` | `GET /contents/generations/tasks/{id}`（id 经 `encodeURIComponent`） |
| `file:pickImage` | 无 | 弹出多选图片对话框，读取文件并转为 base64 dataUrl 返回 |
| `file:downloadUrl` | `{url, defaultPath?}` | 弹出保存对话框，流式下载 URL 内容到所选路径 |
| `shell:openExternal` | `url` | 校验协议后用系统默认浏览器打开 |

---

## 7. 核心业务流程

### 7.1 配置保存流程

```
用户输入 API Key（脱敏输入框）
   └─> saveSettings()
         ├─ normalizeSettings() 规范化
         ├─ isArkApiKey() 校验 ark- 前缀 ──失败──> setError
         └─ rememberKey ?
               true  : localStorage.setItem('arkApiKey', ...)
               false : localStorage.removeItem('arkApiKey')
         └─> setStatusMessage('配置已保存')
```

### 7.2 发起 CGT 视频任务流程

```
submit(form)
  ├─ buildRequest(form, pickedImages)
  │     ├─ 解析 prompt / imageUrls / videoUrls / audioUrls
  │     ├─ 组装 content[]：text / image_url / video_url / audio_url
  │     ├─ 合并 URL 图片与本地图（本地图以 base64 dataUrl 提交）
  │     └─ 返回 { body, media, prompt }
  ├─ validateRequest() ──失败──> 抛错并 setError
  ├─ 校验 ark- 前缀
  ├─ setLoading(true)
  ├─ window.arkDesktop.createVideoTask({apiKey, baseUrl, body})
  │     └─ ipcMain 'ark:createVideoTask'
  │           └─ arkRequest POST /contents/generations/tasks
  ├─ getVideoTaskId(response) ──无 id──> 抛错
  ├─ 构造 RequestCard，写入 cards（去重 + 截断 30 条）
  ├─ setActiveId(id)
  └─ setStatusMessage(`已发起：${id}`)
```

### 7.3 任务状态刷新流程

```
refreshCard(id)
  ├─ window.arkDesktop.getVideoTask({apiKey, baseUrl, id})
  │     └─ ipcMain 'ark:getVideoTask'
  │           └─ arkRequest GET /contents/generations/tasks/{id}
  ├─ getVideoTaskId(response, id)  // 服务端可能返回新 id
  ├─ setCards: 更新对应卡片的 status / updatedAt / response / errorMessage / id
  ├─ setActiveId(statusId)
  └─ setStatusMessage(`状态已更新：${getStatusLabel(...)}`)
```

> 注：当前实现为**手动刷新**（点击卡片「刷新状态」按钮），未做自动轮询。

### 7.4 本地图片选择流程

```
pickImages()
  ├─ window.arkDesktop.pickImage()
  │     └─ ipcMain 'file:pickImage'
  │           └─ dialog.showOpenDialog({multiSelections, 图片过滤器})
  │           └─ 对每个 filePath: fs.readFile -> base64 -> dataUrl
  └─ setPickedImages(prev => [...prev, ...images])
```

### 7.5 视频下载流程

```
downloadVideo(url, id)
  └─ window.arkDesktop.downloadUrl({url, defaultPath: safeFileName(id, 'mp4')})
        └─ ipcMain 'file:downloadUrl'
              ├─ parseHttpUrl(url) 协议校验
              ├─ dialog.showSaveDialog({defaultPath})
              ├─ fetch(url)
              └─ pipeline(resp.body, createWriteStream(filePath))
```

---

## 8. IPC 通信契约

渲染进程通过 `window.arkDesktop`（由 preload 注入）调用以下方法，每个方法对应一个 `ipcMain.handle` 通道：

| 渲染层 API | IPC 通道 | 请求参数 | 返回值 |
| --- | --- | --- | --- |
| `generateImage(payload)` | `ark:generateImage` | `{apiKey, baseUrl, body}` | Ark 图片生成响应 |
| `createVideoTask(payload)` | `ark:createVideoTask` | `{apiKey, baseUrl, body}` | CGT 任务创建响应（含 id） |
| `getVideoTask(payload)` | `ark:getVideoTask` | `{apiKey, baseUrl, id}` | CGT 任务状态响应 |
| `pickImage()` | `file:pickImage` | 无 | `PickedImage[]`（filePath/name/dataUrl） |
| `downloadUrl(payload)` | `file:downloadUrl` | `{url, defaultPath?}` | `{canceled, filePath?}` |
| `openExternal(url)` | `shell:openExternal` | `url: string` | `void` |

**契约约束**：

- 所有涉及外部 URL 的方法在主进程都会经 `parseHttpUrl` / `normalizeBaseUrl` 校验协议白名单（仅 `http:` / `https:`）。
- 涉及 Ark 的方法会经 `ensureApiKey` 校验 Key 非空。
- 渲染层在调用前会检查 `window.arkDesktop?.xxx` 是否存在，缺失时给出「需要在桌面应用中使用」的友好提示（兼容纯浏览器预览）。

---

## 9. 项目运行方式

### 9.1 环境要求

- Node.js 18+
- npm 9+
- 火山方舟 API Key（`ark-` 开头）
- 已在火山方舟控制台开通对应模型或配置 Endpoint

### 9.2 安装

```bash
npm install
```

### 9.3 开发模式

```bash
npm run dev
```

该脚本通过 `concurrently` 并行执行：

1. `vite --host 127.0.0.1`（启动开发服务器，端口 5173，`strictPort`）
2. `wait-on http://127.0.0.1:5173 && electron .`（等待 Vite 就绪后启动 Electron）

开发态下 Electron 加载 `http://127.0.0.1:5173` 并自动打开分离式 DevTools。

### 9.4 类型检查与构建

```bash
npm run build
```

执行 `tsc`（类型检查，`noEmit: true`）+ `vite build`（产物输出到 `dist/`）。

### 9.5 仅启动 Electron（生产态预览）

```bash
npm start
```

执行 `electron .`，入口为 `package.json` 的 `main` 字段：`electron/main.cjs`，加载 `dist/index.html`。

### 9.6 一键推送（开发辅助）

```bash
npm run push [提交信息]
```

调用 `scripts/push.sh`，自动 `git add -A && commit && push`；未提供信息则交互式询问。

---

## 10. 打包与发布

使用 `electron-builder` 打包，配置内嵌于 [package.json](file:///workspace/package.json) 的 `build` 字段。

| 脚本 | 命令 | 产物 |
| --- | --- | --- |
| `npm run dist` | `npm run build && electron-builder` | 默认当前平台 |
| `npm run dist:mac` | `--mac --x64 --arm64` | macOS `dmg` + `zip`（Intel & Apple Silicon） |
| `npm run dist:mac:arm64` | `--mac --arm64` | 仅 Apple Silicon |
| `npm run dist:win` | `--win --x64` | Windows `nsis` 安装包 + `portable` 便携版 |
| `npm run dist:win:arm64` | `--win --arm64` | Windows ARM64 |

**打包关键配置**：

- `appId`: `com.example.arkstudiogui`
- `productName`: `Ark Studio GUI`
- 产物输出目录：`release/`
- 打包文件：`dist/**/*`、`electron/**/*`、`package.json`
- macOS 分类：`public.app-category.graphics-design`
- Windows NSIS：非一键安装、允许自定义安装路径

> 建议在目标平台原生环境下构建并测试对应安装包。

---

## 11. 配置说明

### 11.1 Vite 配置（[vite.config.ts](file:///workspace/vite.config.ts)）

- `base: './'`：使用相对路径，便于 Electron 通过 `file://` 加载打包产物。
- `plugins: [react()]`：启用 React Fast Refresh。
- `server.port: 5173` + `strictPort: true`：固定端口，与 `wait-on` 监听地址一致。

### 11.2 TypeScript 配置（[tsconfig.json](file:///workspace/tsconfig.json)）

- `target: ES2020`，`lib: DOM + ES2020`
- `strict: true`，`forceConsistentCasingInFileNames`
- `module: ESNext`，`moduleResolution: Bundler`
- `jsx: react-jsx`（无需手动 import React）
- `noEmit: true`（仅类型检查，产物由 Vite 负责）
- `include: ["src"]`

### 11.3 运行时配置项

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `DEFAULT_BASE_URL` | `https://ark.cn-beijing.volces.com/api/v3` | Ark API 基址（前端与主进程各有一份常量） |
| 默认模型 | `doubao-seedance-2-0-260128` | 表单 `model` 默认值，可在界面修改 |
| 默认画幅 | `16:9` | 可选 16:9 / 9:16 / 1:1 / 4:3 / 3:4 / adaptive |
| 默认时长 | `5` 秒 | 范围 1–15 |
| `generateAudio` | `true` | 是否生成音频 |
| `watermark` | `false` | 是否加水印 |
| 卡片保留上限 | 30 条 | `setCards` 时 `.slice(0, 30)` |
| API Key 存储 | `localStorage['arkApiKey']` | 仅在勾选「记住 Key」时写入 |

---

## 12. 安全设计要点

1. **上下文隔离**：`contextIsolation: true` + `nodeIntegration: false`，渲染进程无法直接访问 Node API。
2. **预加载桥接**：仅通过 `contextBridge` 暴露 6 个明确的方法，不暴露 `ipcRenderer` 本身。
3. **协议白名单**：`ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:'])`，所有外链/下载/请求均经此校验。
4. **导航拦截**：
   - `setWindowOpenHandler`：新窗口一律拒绝（`action: 'deny'`），http/https 链接转交 `shell.openExternal`。
   - `will-navigate`：禁止离开当前 URL 的页面内导航。
5. **API Key 处理**：
   - 渲染层展示脱敏（`maskApiKey`）。
   - 主进程即时校验、剥离 `Bearer ` 前缀、不持久化。
   - 写入 `localStorage` 完全由用户「记住 Key」勾选控制。
6. **任务 ID 编码**：`getVideoTask` 中 `encodeURIComponent(payload.id)`，避免路径注入。

---

## 13. 已知差异与注意事项

1. **README 与实现的范围差异**：README 描述同时支持 Seedream（图片生成）与 Seedance（视频生成）。但当前 [src/App.tsx](file:///workspace/src/App.tsx) 前端**仅实现了视频生成（CGT）流程**；图片生成的 IPC 通道 `ark:generateImage` 与类型 `generateImage` 已在 [electron/main.cjs](file:///workspace/electron/main.cjs) 与 [src/vite-env.d.ts](file:///workspace/src/vite-env.d.ts) 中预留，但渲染层尚未调用。如需图片生成 UI，需在 App.tsx 中新增对应表单与调用逻辑。

2. **任务轮询**：当前为**手动刷新**，无自动轮询。如需实时跟踪，可在 `submit` 成功或 `refreshCard` 返回非终态时启动定时器调用 `getVideoTask`。

3. **结果 URL 有效期**：Seedance 生成的视频 URL 有有效期，生成成功后应及时下载（参见 README 使用建议）。

4. **首尾帧能力**：若报参数错误，优先使用公开图片 URL，并确认当前模型支持该能力。

5. **依赖版本**：`package.json` 中多数依赖固定为 `latest`，复现构建时可能因版本漂移产生差异；生产环境建议锁定具体版本。

6. **平台构建**：跨平台打包（如在 macOS 上打 Windows 包）可能因代码签名、原生依赖等问题失败，建议在目标平台原生构建。

---

*文档基于仓库当前快照生成，若代码后续演进，请同步更新本 Wiki。*
