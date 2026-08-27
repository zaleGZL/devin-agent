import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Bot,
  CircleAlert,
  CircleStop,
  File,
  FolderOpen,
  LoaderCircle,
  MessageSquareText,
  Paperclip,
  Pause,
  Play,
  RotateCcw,
  Send,
  Settings2,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import type { TelegramBotStatus, TelegramMessage } from "../shared/types";
import { ModelPicker, PermissionPicker } from "./features/composer/ComposerControls";

export function TelegramBotView({ sidebarOpen, onShowSidebar }: { sidebarOpen: boolean; onShowSidebar(): void }) {
  const [status, setStatus] = useState<TelegramBotStatus>();
  const [messages, setMessages] = useState<TelegramMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [before, setBefore] = useState<number>();
  const [tokenDraft, setTokenDraft] = useState("");
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [clearValue, setClearValue] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const followLatestRef = useRef(true);

  const refresh = useCallback(async () => {
    const [nextStatus, history] = await Promise.all([
      window.devinAgent.telegram.getStatus(),
      window.devinAgent.telegram.getHistory({ limit: 100 }),
    ]);
    setStatus(nextStatus);
    setMessages(history.messages);
    setHasMore(history.hasMore);
    setBefore(history.before);
    followLatestRef.current = true;
  }, []);

  useEffect(() => {
    void refresh().catch((cause) => setError(messageOf(cause)));
    return window.devinAgent.telegram.onEvent((event) => {
      if (event.type === "status") setStatus(event.status);
      if (event.type === "history-reset") {
        setMessages([]);
        setTokenDraft("");
      }
      if (event.type === "message") {
        setMessages((current) => {
          const index = current.findIndex((item) => item.id === event.message.id);
          if (index < 0) {
            followLatestRef.current = true;
            return [...current, event.message];
          }
          const next = [...current];
          next[index] = event.message;
          return next;
        });
      }
    });
  }, [refresh]);

  useEffect(() => {
    if (!followLatestRef.current || messages.length === 0) return;
    followLatestRef.current = false;
    requestAnimationFrame(() => scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: status?.running ? "smooth" : "auto",
    }));
  }, [messages, status?.running]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.style.height = "auto";
    editor.style.height = `${Math.min(editor.scrollHeight, 190)}px`;
  }, [draft]);

  const chooseWorkspace = async () => {
    setError(undefined);
    const selected = await window.devinAgent.telegram.chooseWorkspace();
    if (!selected) return;
    const accepted = window.confirm(
      `将以下目录设为 Telegram Bot 的固定工作目录？\n\n${selected}\n\nBot 会按 Devin CLI 当前模式与组织策略在此目录处理消息；目录一旦绑定，只能在清除 Bot 数据后更换。`,
    );
    if (!accepted) return;
    await window.devinAgent.telegram.configureWorkspace(selected);
    await refresh();
  };

  const saveToken = async () => {
    const token = tokenDraft.trim();
    if (!token) return;
    setBusy(true);
    setError(undefined);
    try {
      await window.devinAgent.telegram.saveToken(token);
      setTokenDraft("");
      await refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text && attachments.length === 0) return;
    setDraft("");
    setAttachments([]);
    setError(undefined);
    try {
      await window.devinAgent.telegram.send({ text, attachmentPaths: attachments });
    } catch (cause) {
      setDraft(text);
      setAttachments(attachments);
      setError(messageOf(cause));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  };

  const loadOlder = async () => {
    const page = await window.devinAgent.telegram.getHistory({ before, limit: 100 });
    setMessages((current) => [...page.messages, ...current]);
    setHasMore(page.hasMore);
    setBefore(page.before);
  };

  if (!status) {
    return <div className="weixin-view"><div className="loading-state"><LoaderCircle className="spin" />正在加载 Telegram Bot…</div></div>;
  }

  const bound = status.botId != null && status.state !== "token-required";
  return (
    <section className="weixin-view">
      <header className="thread-header weixin-header">
        <div className="header-left">
          {!sidebarOpen && (
            <button className="icon-button sidebar-reveal" onClick={onShowSidebar} aria-label="显示侧栏">
              <MessageSquareText size={16} />
            </button>
          )}
          <span className="weixin-avatar"><Bot size={18} /></span>
          <div className="thread-heading">
            <strong>Telegram Bot</strong>
            <span>
              {status.online ? <Wifi size={12} /> : <WifiOff size={12} />}
              {status.online ? "已连接" : stateLabel(status.state)}
              {status.modelId ? ` · ${modelLabel(status.modelId, status.models)}` : ""}
            </span>
          </div>
        </div>
        {bound && (
          <div className="header-actions">
            <button
              className="icon-button"
              title={status.online ? "暂停" : "恢复"}
              aria-label={status.online ? "暂停 Telegram Bot" : "恢复 Telegram Bot"}
              onClick={() => void (status.online ? window.devinAgent.telegram.pause() : window.devinAgent.telegram.start())
                .catch((cause) => setError(messageOf(cause)))}
            >
              {status.online ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <details className="weixin-settings">
              <summary className="icon-button" title="Telegram Bot 设置" aria-label="打开 Telegram Bot 设置">
                <Settings2 size={16} />
              </summary>
              <div className="weixin-settings-panel">
                <div className="weixin-settings-heading">
                  <strong>Telegram Bot 设置</strong>
                  <span>此 Bot 始终使用同一个 Devin 会话</span>
                </div>
                <dl className="weixin-settings-meta">
                  <div><dt>工作目录</dt><dd title={status.workspacePath}>{shortPath(status.workspacePath ?? "")}</dd></div>
                  <div><dt>模型</dt><dd>{modelLabel(status.modelId, status.models)}</dd></div>
                  <div><dt>运行模式</dt><dd>{modeLabel(status.modeId, status.modes)}</dd></div>
                  <div><dt>上下文</dt><dd>{status.contextUsage?.percent == null ? "—" : `${Math.round(status.contextUsage.percent)}%`}</dd></div>
                  <div><dt>媒体占用</dt><dd>{formatBytes(status.mediaBytes)}</dd></div>
                </dl>
                <label className="weixin-settings-toggle">
                  <span><strong>开机启动</strong><small>登录桌面后自动恢复 Telegram 连接</small></span>
                  <input
                    type="checkbox"
                    checked={status.autoLaunch}
                    onChange={(event) => void window.devinAgent.telegram.setAutoLaunch(event.target.checked)}
                  />
                </label>
                <button className="weixin-settings-action" onClick={() => void window.devinAgent.telegram.disconnect().catch((cause) => setError(messageOf(cause)))}>
                  <WifiOff size={14} />断开并移除本机凭据
                </button>
                <div className="weixin-settings-danger">
                  <label htmlFor="telegram-clear-data">更换账号或工作目录</label>
                  <p>清除本机凭据、消息记录和固定会话。</p>
                  <input
                    id="telegram-clear-data"
                    value={clearValue}
                    onChange={(event) => setClearValue(event.target.value)}
                    placeholder="输入：清除 Telegram Bot 数据"
                  />
                  <button
                    disabled={clearValue !== "清除 Telegram Bot 数据"}
                    onClick={() => void window.devinAgent.telegram.clearAllData(clearValue)
                      .then(() => { setClearValue(""); void refresh(); })
                      .catch((cause) => setError(messageOf(cause)))}
                  >
                    <Trash2 size={14} />清除全部 Bot 数据
                  </button>
                </div>
              </div>
            </details>
          </div>
        )}
      </header>

      {!status.workspacePath ? (
        <div className="weixin-onboarding">
          <span className="weixin-hero-icon"><FolderOpen size={28} /></span>
          <h1>选择 Telegram Bot 工作目录</h1>
          <p>每个 Bot 绑定一个固定 Devin 会话与工作目录；实际文件、命令和网络权限由 Devin CLI 当前模式及组织策略决定。</p>
          <button className="primary-button" onClick={() => void chooseWorkspace()}><FolderOpen size={15} />选择工作目录</button>
        </div>
      ) : !bound ? (
        <div className="weixin-onboarding">
          <span className="weixin-hero-icon"><Send size={28} /></span>
          <h1>{status.botId ? "重新配置 Telegram Bot" : "配置 Telegram Bot"}</h1>
          <p className="weixin-bound-path" title={status.workspacePath}>{status.workspacePath}</p>
          <p>在 Telegram 中找 <strong>@BotFather</strong>，发送 <code>/newbot</code> 创建 Bot，复制返回的 Token 粘贴到下方。</p>
          <div className="weixin-verify">
            <input
              value={tokenDraft}
              onChange={(event) => setTokenDraft(event.target.value)}
              placeholder="123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              type="password"
            />
            <button className="primary-button" disabled={busy || !tokenDraft.trim()} onClick={() => void saveToken()}>
              {busy ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}验证并保存
            </button>
          </div>
          {status.botId != null && (
            <button className="secondary-button" onClick={() => void window.devinAgent.telegram.start().catch((cause) => setError(messageOf(cause)))}>
              <RotateCcw size={14} />恢复连接
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="weixin-message-scroll" ref={scrollRef}>
            <div className="weixin-messages">
              {hasMore && <button className="weixin-load-more" onClick={() => void loadOlder()}>加载更早消息</button>}
              {messages.length === 0 && (
                <div className="weixin-chat-empty">
                  <MessageSquareText size={26} />
                  <strong>固定会话已就绪</strong>
                  <span>在 Telegram 中向 Bot 发送 /start，然后发送消息即可。</span>
                </div>
              )}
              {messages.map((message) => <TelegramMessageRow key={message.id} message={message} />)}
              {status.running && <div className="working-line"><LoaderCircle className="spin" size={14} />Telegram Bot 正在处理…</div>}
            </div>
          </div>
          <div className="composer-wrap weixin-composer-wrap">
            <div className="composer-stack">
              <div className={`composer ${status.running ? "composer-running" : ""}`}>
                {attachments.length > 0 && (
                  <div className="weixin-attachment-list">
                    {attachments.map((file) => (
                      <span key={file} title={file}>
                        <File size={12} />
                        <span>{file.split(/[\\/]/).at(-1)}</span>
                        <button onClick={() => setAttachments((items) => items.filter((item) => item !== file))} aria-label="移除附件"><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                )}
                <textarea
                  ref={editorRef}
                  className="inline-mention-editor weixin-prompt-editor"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={status.running ? "发送跟进消息…" : "发消息到 Telegram Bot…"}
                  aria-label="发送消息到 Telegram Bot"
                  rows={1}
                />
                <div className="composer-toolbar">
                  <div className="composer-tools">
                    <button
                      className="composer-tool-button"
                      title="添加工作目录内的文件"
                      aria-label="添加附件"
                      onClick={() => void window.devinAgent.telegram.chooseAttachments()
                        .then((files) => setAttachments((current) => [...new Set([...current, ...files])].slice(0, 10)))
                        .catch((cause) => setError(messageOf(cause)))}
                    >
                      <Paperclip size={16} />
                    </button>
                    <PermissionPicker
                      value={status.modeId ?? ""}
                      modes={status.modes}
                      updating={false}
                      disabled={!bound}
                      onChange={(value) => void window.devinAgent.telegram.setMode(value).catch((cause) => setError(messageOf(cause)))}
                    />
                  </div>
                  <div className="composer-actions">
                    <ModelPicker
                      model={status.modelId ?? ""}
                      models={status.models}
                      pinnedModelIds={[]}
                      onChange={(value) => void window.devinAgent.telegram.setModel(value).catch((cause) => setError(messageOf(cause)))}
                      onPinnedModelIdsChange={() => undefined}
                    />
                    <button
                      className={`send-button ${status.running ? "stop-button" : ""}`}
                      disabled={!status.running && !draft.trim() && attachments.length === 0}
                      onClick={() => status.running && !draft.trim() && attachments.length === 0
                        ? void window.devinAgent.telegram.abortTurn()
                        : void send()}
                      aria-label={status.running && !draft.trim() && attachments.length === 0 ? "停止" : "发送"}
                    >
                      {status.running && !draft.trim() && attachments.length === 0 ? <CircleStop size={17} /> : <ArrowUp size={17} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="composer-caption">Enter 发送 · Shift+Enter 换行</div>
          </div>
        </>
      )}
      {(error || status.lastError) && (
        <div className="weixin-error">
          <CircleAlert size={15} />
          <span>{error ?? status.lastError}</span>
          <button onClick={() => setError(undefined)} aria-label="关闭错误"><X size={13} /></button>
        </div>
      )}
    </section>
  );
}

function TelegramMessageRow({ message }: { message: TelegramMessage }) {
  const user = message.source === "desktop" || message.source === "telegram";
  const assistant = message.role === "assistant";
  return (
    <article className={`weixin-message ${user ? "weixin-user-message" : assistant ? "weixin-agent-message" : "weixin-system-message"}`}>
      <small>
        {sourceLabel(message)} · {new Date(message.createdAt).toLocaleString()}
        {message.status === "failed" ? " · 失败" : message.status === "processing" ? " · 处理中" : message.status === "pending" ? " · 待发送" : ""}
      </small>
      {message.text && (assistant
        ? <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown></div>
        : <p>{message.text}</p>)}
      {message.media.length > 0 && (
        <div className="weixin-media-list">
          {message.media.map((media, index) => (
            <span key={`${media.name}-${index}`}><File size={13} /><strong>{media.name}</strong><em>{formatBytes(media.size)}</em></span>
          ))}
        </div>
      )}
    </article>
  );
}

function sourceLabel(message: TelegramMessage): string {
  if (message.source === "telegram") return "Telegram";
  if (message.source === "desktop") return "桌面";
  if (message.source === "agent") return "Devin Agent";
  return "系统";
}

function stateLabel(value: TelegramBotStatus["state"]): string {
  return ({
    unconfigured: "未配置",
    "workspace-ready": "待配置",
    "token-required": "需 Token",
    connecting: "连接中",
    online: "已连接",
    paused: "已暂停",
    error: "连接异常",
  })[value];
}

function modelLabel(modelId: string | undefined, models: { id: string; name?: string }[]): string {
  if (!modelId) return "自适应";
  const found = models.find((model) => model.id === modelId);
  return found?.name ?? modelId;
}

function modeLabel(modeId: string | undefined, modes: { id: string; name?: string }[]): string {
  if (!modeId) return "自适应";
  const found = modes.find((mode) => mode.id === modeId);
  return found?.name ?? modeId;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shortPath(value: string): string {
  const parts = value.split(/[\\/]/).filter(Boolean);
  return parts.slice(-2).join("/");
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}
