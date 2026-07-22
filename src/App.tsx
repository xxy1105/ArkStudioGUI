import { FormEvent, useEffect, useRef, useState } from 'react';

type AppSettings = {
  apiKey: string;
};

type BillingType = 'pay_as_you_go' | 'agent_plan';

type VideoStatus = {
  id?: string;
  task_id?: string;
  model?: string;
  status?: string;
  content?: {
    video_url?: string;
    last_frame_url?: string;
  };
  usage?: {
    completion_tokens?: number;
    total_tokens?: number;
  };
  created_at?: number;
  updated_at?: number;
  seed?: number;
  resolution?: string;
  ratio?: string;
  duration?: number;
  framespersecond?: number;
  service_tier?: string;
  execution_expires_after?: number;
  generate_audio?: boolean;
  draft?: boolean;
  priority?: number;
  error?: {
    code?: string;
    message?: string;
  } | null;
  [key: string]: unknown;
};

type MediaItem = {
  label: string;
  value: string;
  preview?: string;
};

type RequestMedia = {
  images: MediaItem[];
  videos: MediaItem[];
  audio: MediaItem[];
};

type RequestCard = {
  id: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  billingType: BillingType;
  model: string;
  prompt: string;
  body: Record<string, unknown>;
  media: RequestMedia;
  response?: VideoStatus;
  errorMessage?: string;
};

type CgtForm = {
  billingType: BillingType;
  model: string;
  prompt: string;
  ratio: string;
  duration: number;
  imageUrls: string;
  videoUrls: string;
  audioUrls: string;
  watermark: boolean;
  generateAudio: boolean;
};

const DEFAULT_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const PAY_AS_YOU_GO_API_KEY_URL = 'https://console.volcengine.com/ark/region:cn-beijing/apiKey?apikey=%7B%7D';
const AGENT_PLAN_URL = 'https://console.volcengine.com/ark/region:cn-beijing/subscription/agent-plan';

const defaultForm: CgtForm = {
  billingType: 'pay_as_you_go',
  model: 'doubao-seedance-2-0-260128',
  prompt: '',
  ratio: '16:9',
  duration: 5,
  imageUrls: '',
  videoUrls: '',
  audioUrls: '',
  watermark: false,
  generateAudio: true
};

function splitLines(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim().replace(/^`+|`+$/g, '').trim())
    .filter(Boolean);
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function normalizeApiKey(value: string) {
  return value.trim().replace(/^Bearer\s+/i, '');
}

function maskApiKey(value: string) {
  const key = normalizeApiKey(value);
  if (!key) return '';
  const head = key.slice(0, 3);
  const tail = key.slice(-3);
  const hiddenCount = Math.max(3, Math.min(10, key.length - 6));
  return key.length <= 6 ? `${head}${'•'.repeat(3)}` : `${head}${'•'.repeat(hiddenCount)}${tail}`;
}

function isArkApiKey(value: string) {
  return normalizeApiKey(value).startsWith('ark-');
}

function normalizeSettings(settings: AppSettings): AppSettings {
  return {
    apiKey: normalizeApiKey(settings.apiKey)
  };
}

function getVideoTaskId(response: VideoStatus, fallbackId = '') {
  const taskId = typeof response.task_id === 'string' ? response.task_id : '';
  return (response.id || taskId || fallbackId).trim();
}

function getStatusLabel(status?: string) {
  const labels: Record<string, string> = {
    queued: '排队中',
    running: '运行中',
    succeeded: '已完成',
    failed: '失败',
    expired: '超时',
    cancelled: '取消',
    created: '已创建'
  };
  return labels[status || ''] || status || '未知';
}

function getStatusClass(status?: string) {
  if (status === 'succeeded') return 'success';
  if (status === 'failed' || status === 'expired' || status === 'cancelled') return 'failed';
  return 'pending';
}

function getBillingLabel(value: BillingType) {
  return value === 'agent_plan' ? 'Agent Plan' : '按量计费';
}

function getBillingHint(value: BillingType) {
  return value === 'agent_plan' ? '使用 Agent Plan 套餐权益发起，请先确认套餐已开通。' : '使用按量计费 API Key 发起，请先获取 ark- 开头的 API Key。';
}

function getBillingLink(value: BillingType) {
  if (value === 'agent_plan') {
    return {
      label: '开通或查看 Agent Plan',
      href: AGENT_PLAN_URL
    };
  }
  return {
    label: '获取按量计费 API Key',
    href: PAY_AS_YOU_GO_API_KEY_URL
  };
}

function safeFileName(prefix: string, ext: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${stamp}.${ext}`;
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function formatUnixTime(value?: number) {
  if (!value) return '无';
  return new Date(value * 1000).toLocaleString();
}

function formatValue(value: unknown) {
  if (value === undefined || value === null || value === '') return '无';
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

function cleanUrl(value?: string) {
  return (value || '').trim().replace(/^`+|`+$/g, '').trim();
}

function buildRequest(form: CgtForm, pickedImages: PickedImage[]) {
  const prompt = form.prompt.trim();
  const imageUrls = splitLines(form.imageUrls);
  const videoUrls = splitLines(form.videoUrls);
  const audioUrls = splitLines(form.audioUrls);
  const content: Record<string, unknown>[] = [];

  if (prompt) content.push({ type: 'text', text: prompt });

  imageUrls.forEach((url, index) => {
    content.push({ type: 'image_url', role: 'reference_image', image_url: { url } });
  });

  pickedImages.forEach((image) => {
    content.push({ type: 'image_url', role: 'reference_image', image_url: { url: image.dataUrl } });
  });

  videoUrls.forEach((url) => {
    content.push({ type: 'video_url', role: 'reference_video', video_url: { url } });
  });

  audioUrls.forEach((url) => {
    content.push({ type: 'audio_url', role: 'reference_audio', audio_url: { url } });
  });

  const body: Record<string, unknown> = {
    model: form.model.trim(),
    content,
    ratio: form.ratio,
    duration: Number(form.duration),
    watermark: form.watermark,
    generate_audio: form.generateAudio
  };

  const media: RequestMedia = {
    images: [
      ...imageUrls.map((url, index) => ({ label: `图片 ${index + 1}`, value: url, preview: url })),
      ...pickedImages.map((image, index) => ({
        label: image.name || `本地图片 ${index + 1}`,
        value: image.dataUrl,
        preview: image.dataUrl
      }))
    ],
    videos: videoUrls.map((url, index) => ({ label: `视频 ${index + 1}`, value: url })),
    audio: audioUrls.map((url, index) => ({ label: `音频 ${index + 1}`, value: url }))
  };

  return { body, media, prompt };
}

function validateRequest(form: CgtForm, media: RequestMedia, body: Record<string, unknown>) {
  const content = Array.isArray(body.content) ? body.content : [];
  if (!form.model.trim()) throw new Error('请填写模型 ID 或 Endpoint ID。');
  if (content.length === 0) throw new Error('至少填写一段文本，或添加图片/视频/音频素材。');
  if (media.audio.length > 0 && media.images.length === 0 && media.videos.length === 0 && !form.prompt.trim()) {
    throw new Error('音频不能单独发起任务，请同时提供文本、图片或视频。');
  }
}

function App() {
  const [settings, setSettings] = useState<AppSettings>(() => ({
    apiKey: normalizeApiKey(localStorage.getItem('arkApiKey') || '')
  }));
  const [rememberKey, setRememberKey] = useState(Boolean(localStorage.getItem('arkApiKey')));
  const [form, setForm] = useState<CgtForm>(defaultForm);
  const [pickedImages, setPickedImages] = useState<PickedImage[]>([]);
  const [cards, setCards] = useState<RequestCard[]>([]);
  const [activeId, setActiveId] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('准备就绪');
  const [error, setError] = useState('');

  const activeCard = cards.find((card) => card.id === activeId) || cards[0];
  const billingLink = getBillingLink(form.billingType);

  const updateSetting = (key: keyof AppSettings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const updateForm = (key: keyof CgtForm, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveSettings = () => {
    const normalized = normalizeSettings(settings);
    if (normalized.apiKey && !isArkApiKey(normalized.apiKey)) {
      setError('火山方舟 API Key 应以 ark- 开头，直接输入 ark-xxx 即可。');
      return;
    }
    setError('');
    setSettings(normalized);
    if (rememberKey) {
      localStorage.setItem('arkApiKey', normalized.apiKey);
    } else {
      localStorage.removeItem('arkApiKey');
    }
    setStatusMessage('配置已保存');
  };

  const pickImages = async () => {
    setError('');
    try {
      const api = window.arkDesktop;
      if (!api?.pickImage) throw new Error('本地选图需要在桌面应用中使用。也可以直接粘贴图片 URL。');
      const images = await api.pickImage();
      setPickedImages((prev) => [...prev, ...images]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const removePickedImage = (index: number) => {
    setPickedImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');

    try {
      const api = window.arkDesktop;
      if (!api?.createVideoTask) throw new Error('创建 CGT 任务需要在桌面应用中使用。浏览器预览只用于检查界面。');

      const { body, media, prompt } = buildRequest(form, pickedImages);
      validateRequest(form, media, body);

      const normalizedSettings = normalizeSettings(settings);
      if (!isArkApiKey(normalizedSettings.apiKey)) {
        throw new Error('火山方舟 API Key 应以 ark- 开头，直接输入 ark-xxx 即可。');
      }
      setLoading(true);
      setStatusMessage('正在发起 CGT 任务');

      const response = await api.createVideoTask({
        apiKey: normalizedSettings.apiKey,
        baseUrl: DEFAULT_BASE_URL,
        body
      });

      const id = getVideoTaskId(response);
      if (!id) throw new Error('任务已返回，但响应里没有 cgt id。请查看原始响应。');

      const now = Date.now();
      const card: RequestCard = {
        id,
        status: response.status || 'created',
        createdAt: now,
        updatedAt: now,
        billingType: form.billingType,
        model: form.model.trim(),
        prompt,
        body,
        media,
        response
      };

      setCards((prev) => [card, ...prev.filter((item) => item.id !== id)].slice(0, 30));
      setActiveId(id);
      setStatusMessage(`已发起：${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatusMessage('未发起任务');
    } finally {
      setLoading(false);
    }
  };

  const refreshCard = async (id: string) => {
    setError('');
    try {
      const api = window.arkDesktop;
      if (!api?.getVideoTask) throw new Error('查询任务需要在桌面应用中使用。');
      const normalizedSettings = normalizeSettings(settings);
      const response = await api.getVideoTask({
        apiKey: normalizedSettings.apiKey,
        baseUrl: DEFAULT_BASE_URL,
        id
      });
      const statusId = getVideoTaskId(response, id);
      setCards((prev) => prev.map((card) => {
        if (card.id !== id) return card;
        return {
          ...card,
          id: statusId,
          status: response.status || card.status,
          updatedAt: Date.now(),
          response,
          errorMessage: response.error?.message
        };
      }));
      setActiveId(statusId);
      setStatusMessage(`状态已更新：${getStatusLabel(response.status)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openExternal = async (url: string) => {
    try {
      const api = window.arkDesktop;
      if (!api?.openExternal) throw new Error('外部打开需要在桌面应用中使用。');
      await api.openExternal(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const downloadVideo = async (url: string, id: string) => {
    try {
      const api = window.arkDesktop;
      if (!api?.downloadUrl) throw new Error('下载需要在桌面应用中使用。');
      await api.downloadUrl({ url, defaultPath: safeFileName(id || 'seedance', 'mp4') });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Ark CGT</p>
          <h1>发起内容生成任务</h1>
          <p className="subtle">整理文本和素材，提交后生成一张对应 cgt id 的请求卡片。</p>
        </div>
        <div className="topbar-meta">
          <span className="status-pill">{statusMessage}</span>
        </div>
      </header>

      <section className="settings-strip card">
        <label>
          <span>套餐</span>
          <select value={form.billingType} onChange={(event) => updateForm('billingType', event.target.value as BillingType)}>
            <option value="pay_as_you_go">按量计费</option>
            <option value="agent_plan">Agent Plan 套餐</option>
          </select>
        </label>
        <label>
          <span>API Key</span>
          <ApiKeyInput value={settings.apiKey} onChange={(value) => updateSetting('apiKey', value)} />
          <small className="field-note">直接输入 ark-xxx；展示时只露前三位和后三位。</small>
        </label>
        <a className="plan-link" href={billingLink.href} target="_blank" rel="noreferrer">
          <b>{billingLink.label}</b>
          <span>{getBillingHint(form.billingType)}</span>
        </a>
        <label className="checkbox-row">
          <input type="checkbox" checked={rememberKey} onChange={(event) => setRememberKey(event.target.checked)} />
          <span>记住 Key</span>
        </label>
        <button className="secondary" onClick={saveSettings}>保存</button>
      </section>

      {error && <section className="error-banner">{error}</section>}

      <section className="layout">
        <form className="card compose-card" onSubmit={submit}>
          <div className="section-title">
            <h2>内容</h2>
            <span>文本必填或素材必填</span>
          </div>

          <label>
            <span>模型 / Endpoint</span>
            <input value={form.model} onChange={(event) => updateForm('model', event.target.value)} />
          </label>

          <label>
            <span>文本</span>
            <textarea
              rows={8}
              placeholder="写清楚要生成的视频内容、镜头、动作、参考素材如何使用。"
              value={form.prompt}
              onChange={(event) => updateForm('prompt', event.target.value)}
            />
          </label>

          <div className="compact-grid">
            <label>
              <span>画幅</span>
              <select value={form.ratio} onChange={(event) => updateForm('ratio', event.target.value)}>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
                <option value="4:3">4:3</option>
                <option value="3:4">3:4</option>
                <option value="adaptive">adaptive</option>
              </select>
            </label>
            <label>
              <span>时长</span>
              <input
                type="number"
                min="1"
                max="15"
                value={form.duration}
                onChange={(event) => updateForm('duration', Number(event.target.value))}
              />
            </label>
          </div>

          <div className="inline-options">
            <label className="checkbox-row">
              <input type="checkbox" checked={form.generateAudio} onChange={(event) => updateForm('generateAudio', event.target.checked)} />
              <span>生成音频</span>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={form.watermark} onChange={(event) => updateForm('watermark', event.target.checked)} />
              <span>加水印</span>
            </label>
          </div>

          <div className="section-title">
            <h2>素材</h2>
            <span>每行一个 URL；本地图会以 base64 随请求提交</span>
          </div>

          <label>
            <span>图片</span>
            <textarea rows={3} value={form.imageUrls} onChange={(event) => updateForm('imageUrls', event.target.value)} />
          </label>
          <div className="upload-row">
            <button type="button" className="secondary" onClick={pickImages}>选择本地图</button>
            {pickedImages.length > 0 && <span className="subtle">{pickedImages.length} 张本地图</span>}
          </div>
          {pickedImages.length > 0 && (
            <div className="picked-list">
              {pickedImages.map((image, index) => (
                <button type="button" key={`${image.filePath}-${index}`} onClick={() => removePickedImage(index)}>
                  {image.name} ×
                </button>
              ))}
            </div>
          )}

          <label>
            <span>视频</span>
            <textarea rows={3} value={form.videoUrls} onChange={(event) => updateForm('videoUrls', event.target.value)} />
          </label>

          <label>
            <span>音频</span>
            <textarea rows={2} value={form.audioUrls} onChange={(event) => updateForm('audioUrls', event.target.value)} />
          </label>

          <button className="primary submit-button" disabled={loading}>
            {loading ? '发起中...' : '发起 CGT 任务'}
          </button>
        </form>

        <aside className="request-column">
          <div className="request-toolbar">
            <h2>请求卡片</h2>
            <span>{cards.length ? `${cards.length} 条` : '等待提交'}</span>
          </div>

          {cards.length === 0 ? (
            <div className="card empty-panel">
              <b>还没有 cgt id</b>
              <p>提交后，这里会出现一张卡片。卡片包含文本、图片、视频、音频和实际请求 JSON。</p>
            </div>
          ) : (
            <div className="request-list">
              {cards.map((card) => (
                <RequestCardView
                  key={card.id}
                  card={card}
                  active={card.id === activeCard?.id}
                  onSelect={() => setActiveId(card.id)}
                  onRefresh={() => refreshCard(card.id)}
                  onOpen={openExternal}
                  onDownload={downloadVideo}
                />
              ))}
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function RequestCardView({
  card,
  active,
  onSelect,
  onRefresh,
  onOpen,
  onDownload
}: {
  card: RequestCard;
  active: boolean;
  onSelect: () => void;
  onRefresh: () => void;
  onOpen: (url: string) => void;
  onDownload: (url: string, id: string) => void;
}) {
  const videoUrl = cleanUrl(card.response?.content?.video_url);
  const lastFrameUrl = cleanUrl(card.response?.content?.last_frame_url);

  return (
    <article className={`card request-card ${active ? 'active' : ''}`}>
      <button type="button" className="card-hit-area" onClick={onSelect} aria-label={`选中 ${card.id}`} />
      <div className="request-head">
        <div>
          <span className="mono">{card.id}</span>
          <p>{card.model} · {getBillingLabel(card.billingType)}</p>
        </div>
        <span className={`state ${getStatusClass(card.status)}`}>{getStatusLabel(card.status)}</span>
      </div>

      <p className="time-line">创建 {formatTime(card.createdAt)} · 更新 {formatTime(card.updatedAt)}</p>

      <section className="request-section">
        <h3>文本</h3>
        <p className="prompt-box">{card.prompt || '未填写文本'}</p>
      </section>

      <MediaBlock title="图片" items={card.media.images} kind="image" />
      <MediaBlock title="视频" items={card.media.videos} kind="video" onOpen={onOpen} />
      <MediaBlock title="音频" items={card.media.audio} kind="audio" onOpen={onOpen} />

      {card.response && <ResultSummary response={card.response} />}

      {videoUrl && (
        <section className="request-section output-box">
          <h3>结果</h3>
          <video src={videoUrl} controls />
          <div className="button-row">
            <button type="button" onClick={() => onDownload(videoUrl, card.id)}>下载视频</button>
            <button type="button" className="secondary" onClick={() => onOpen(videoUrl)}>浏览器打开</button>
          </div>
        </section>
      )}

      {lastFrameUrl && (
        <section className="request-section">
          <h3>尾帧</h3>
          <img className="last-frame" src={lastFrameUrl} alt="尾帧" />
        </section>
      )}

      {card.errorMessage && <p className="error-text">{card.errorMessage}</p>}

      <div className="card-actions">
        <button type="button" className="secondary" onClick={onRefresh}>刷新状态</button>
      </div>

      <details>
        <summary>请求 JSON</summary>
        <pre>{prettyJson(card.body)}</pre>
      </details>

      {card.response && (
        <details>
          <summary>响应 JSON</summary>
          <pre>{prettyJson(card.response)}</pre>
        </details>
      )}
    </article>
  );
}

function ResultSummary({ response }: { response: VideoStatus }) {
  const videoUrl = cleanUrl(response.content?.video_url);
  const groups: Array<{ title: string; fields: Array<[string, unknown]> }> = [
    {
      title: '基本信息',
      fields: [
        ['CGT ID', getVideoTaskId(response)],
        ['模型', response.model],
        ['状态', getStatusLabel(response.status)],
        ['创建时间', formatUnixTime(response.created_at)],
        ['更新时间', formatUnixTime(response.updated_at)]
      ]
    },
    {
      title: '用量',
      fields: [
        ['Completion Tokens', response.usage?.completion_tokens],
        ['Total Tokens', response.usage?.total_tokens]
      ]
    },
    {
      title: '生成参数',
      fields: [
        ['Seed', response.seed],
        ['清晰度', response.resolution],
        ['比例', response.ratio],
        ['时长', response.duration ? `${response.duration}s` : undefined],
        ['帧率', response.framespersecond ? `${response.framespersecond} fps` : undefined]
      ]
    },
    {
      title: '执行参数',
      fields: [
        ['服务等级', response.service_tier],
        ['超时时间', response.execution_expires_after ? `${response.execution_expires_after}s` : undefined],
        ['生成音频', response.generate_audio],
        ['草稿', response.draft],
        ['优先级', response.priority]
      ]
    }
  ];

  return (
    <section className="request-section">
      <h3>结果字段</h3>
      <div className="result-groups">
        {groups.map((group) => (
          <div className="result-group" key={group.title}>
            <b>{group.title}</b>
            <div className="field-grid">
              {group.fields.map(([label, value]) => (
                <div className="field-cell" key={label}>
                  <span>{label}</span>
                  <strong>{formatValue(value)}</strong>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="url-cell">
        <span>视频 URL</span>
        <strong>{videoUrl || '无'}</strong>
      </div>
    </section>
  );
}

function ApiKeyInput({ value, onChange }: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const maskTimerRef = useRef<number | undefined>(undefined);

  const closeEditing = () => {
    window.clearTimeout(maskTimerRef.current);
    onChange(normalizeApiKey(value));
    setEditing(false);
  };

  useEffect(() => {
    return () => window.clearTimeout(maskTimerRef.current);
  }, []);

  return editing ? (
    <input
      className="api-key-input"
      type="password"
      inputMode="text"
      autoComplete="off"
      autoFocus
      spellCheck={false}
      placeholder="ark-xxx"
      value={value}
      onChange={(event) => {
        const nextValue = event.target.value;
        onChange(nextValue);
        window.clearTimeout(maskTimerRef.current);
        maskTimerRef.current = window.setTimeout(() => {
          onChange(normalizeApiKey(nextValue));
          setEditing(false);
        }, 1000);
      }}
      onBlur={closeEditing}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === 'Escape' || event.key === 'Tab') {
          closeEditing();
        }
      }}
    />
  ) : (
    <button type="button" className="api-key-display" onClick={() => setEditing(true)}>
      {value ? maskApiKey(value) : 'ark-xxx'}
    </button>
  );
}

function MediaBlock({
  title,
  items,
  kind,
  onOpen
}: {
  title: string;
  items: MediaItem[];
  kind: 'image' | 'video' | 'audio';
  onOpen?: (url: string) => void;
}) {
  return (
    <section className="request-section">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="empty-line">无</p>
      ) : (
        <div className={kind === 'image' ? 'media-grid' : 'media-list'}>
          {items.map((item, index) => (
            <div className="media-item" key={`${item.value}-${index}`}>
              {kind === 'image' && item.preview ? <img src={item.preview} alt={item.label} /> : <span className="media-kind">{title}</span>}
              <div>
                <b>{item.label}</b>
                <p>{item.value.length > 160 ? `${item.value.slice(0, 160)}...` : item.value}</p>
                {onOpen && item.value.startsWith('http') && (
                  <button type="button" className="text-button" onClick={() => onOpen(item.value)}>打开</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default App;
