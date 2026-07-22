const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

function isDev() {
  return !app.isPackaged;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: 'Ark Studio GUI',
    backgroundColor: '#f4f6f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev()) {
    win.loadURL('http://127.0.0.1:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isHttpUrl(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    const currentUrl = win.webContents.getURL();
    if (url !== currentUrl) event.preventDefault();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

function normalizeBaseUrl(baseUrl) {
  const value = String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  const parsed = new URL(value);
  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    throw new Error('Base URL 仅支持 http 或 https。');
  }
  return parsed.toString().replace(/\/+$/, '');
}

function ensureApiKey(apiKey) {
  const value = String(apiKey || '').trim().replace(/^Bearer\s+/i, '');
  if (!value) throw new Error('请先填写火山方舟 API Key。');
  return value;
}

function parseHttpUrl(url) {
  const parsed = new URL(String(url || '').trim());
  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    throw new Error('仅支持打开或下载 http/https URL。');
  }
  return parsed.toString();
}

function isHttpUrl(url) {
  try {
    parseHttpUrl(url);
    return true;
  } catch {
    return false;
  }
}

async function readArkResponse(resp) {
  const text = await resp.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!resp.ok) {
    const message = data?.error?.message || data?.message || text || `HTTP ${resp.status}`;
    throw new Error(message);
  }
  return data;
}

async function arkRequest({ apiKey, baseUrl, method, path: requestPath, body }) {
  const key = ensureApiKey(apiKey);
  const resp = await fetch(`${normalizeBaseUrl(baseUrl)}${requestPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return readArkResponse(resp);
}

ipcMain.handle('ark:generateImage', async (_event, payload) => {
  return arkRequest({
    apiKey: payload.apiKey,
    baseUrl: payload.baseUrl,
    method: 'POST',
    path: '/images/generations',
    body: payload.body
  });
});

ipcMain.handle('ark:createVideoTask', async (_event, payload) => {
  return arkRequest({
    apiKey: payload.apiKey,
    baseUrl: payload.baseUrl,
    method: 'POST',
    path: '/contents/generations/tasks',
    body: payload.body
  });
});

ipcMain.handle('ark:getVideoTask', async (_event, payload) => {
  const id = encodeURIComponent(payload.id || '');
  if (!id) throw new Error('缺少视频任务 ID。');
  return arkRequest({
    apiKey: payload.apiKey,
    baseUrl: payload.baseUrl,
    method: 'GET',
    path: `/contents/generations/tasks/${id}`
  });
});

ipcMain.handle('file:pickImage', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择参考图片',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tiff'] }
    ]
  });
  if (result.canceled) return [];
  return Promise.all(result.filePaths.map(async (filePath) => {
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase().replace('jpg', 'jpeg') || 'png';
    return {
      filePath,
      name: path.basename(filePath),
      dataUrl: `data:image/${ext};base64,${buffer.toString('base64')}`
    };
  }));
});

ipcMain.handle('file:downloadUrl', async (_event, payload) => {
  const url = parseHttpUrl(payload.url);
  const defaultPath = payload.defaultPath || 'ark-output';
  const result = await dialog.showSaveDialog({ defaultPath });
  if (result.canceled || !result.filePath) return { canceled: true };

  const resp = await fetch(url);
  if (!resp.ok || !resp.body) throw new Error(`下载失败：HTTP ${resp.status}`);
  await pipeline(resp.body, createWriteStream(result.filePath));
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle('shell:openExternal', async (_event, url) => {
  await shell.openExternal(parseHttpUrl(url));
});
