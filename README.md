# Ark Studio GUI

用于调用火山方舟大模型 Seedream 图片生成和 Seedance 视频生成的跨平台桌面 GUI，支持 Windows 和 macOS 打包。

## 功能

- Seedream：文生图、图生图、多参考图、组图、URL/Base64 返回、预览和下载。
- Seedance：文生视频、首帧/尾帧/参考图输入、创建异步任务、查询/轮询状态、视频预览和下载。
- 配置：可填写 API Key、Base URL、模型 ID 或 Endpoint ID。
- 打包：Electron Builder 输出 macOS `dmg/zip` 和 Windows `nsis/portable`。

## 环境要求

- Node.js 18+
- npm 9+
- 火山方舟 API Key
- 已在火山方舟控制台开通对应模型或配置 Endpoint

## 安装与运行

```bash
npm install
npm run dev
```

## 打包

```bash
npm run dist:mac
npm run dist:win
```

默认脚本会生成 macOS x64/arm64 和 Windows x64 产物。若需要 ARM64 Windows 包，可运行：

```bash
npm run dist:win:arm64
```

打包产物位于 `release/`。通常建议在对应系统上构建并最终测试对应平台安装包。

## API 说明

默认 Base URL：

```text
https://ark.cn-beijing.volces.com/api/v3
```

Seedream 调用：

```text
POST /images/generations
```

Seedance 调用：

```text
POST /contents/generations/tasks
GET /contents/generations/tasks/{id}
```

## 使用建议

- API Key 不建议长期保存；如勾选“记住 API Key”，会保存到本机 `localStorage`。
- Seedance 生成结果 URL 有有效期，生成成功后请及时下载。
- 模型 ID 会随火山方舟版本更新变化，界面中可以直接改成你的 Model ID 或 Endpoint ID。
- 如果首尾帧能力报参数错误，请优先使用公开图片 URL，并确认当前模型支持该能力。
