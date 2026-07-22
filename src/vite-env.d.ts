/// <reference types="vite/client" />

type PickedImage = {
  filePath: string;
  name: string;
  dataUrl: string;
};

type ArkDesktopApi = {
  generateImage: (payload: { apiKey: string; baseUrl: string; body: unknown }) => Promise<any>;
  createVideoTask: (payload: { apiKey: string; baseUrl: string; body: unknown }) => Promise<any>;
  getVideoTask: (payload: { apiKey: string; baseUrl: string; id: string }) => Promise<any>;
  pickImage: () => Promise<PickedImage[]>;
  downloadUrl: (payload: { url: string; defaultPath?: string }) => Promise<{ canceled: boolean; filePath?: string }>;
  openExternal: (url: string) => Promise<void>;
};

interface Window {
  arkDesktop?: ArkDesktopApi;
}
