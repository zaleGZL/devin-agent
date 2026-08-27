import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Bot,
  CircleAlert,
  CircleStop,
  ChevronDown,
  File,
  FolderOpen,
  LoaderCircle,
  MessageSquareText,
  Paperclip,
  Pause,
  Play,
  QrCode,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import type { WeixinBotStatus, WeixinLoginSession, WeixinMessage } from "../shared/types";

export function WeixinBotView({ sidebarOpen, onShowSidebar }: { sidebarOpen: boolean; onShowSidebar(): void }) {
  const [status, setStatus] = useState<WeixinBotStatus>();
  const [messages, setMessages] = useState<WeixinMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [before, setBefore] = useState<number>();
  const [login, setLogin] = useState<WeixinLoginSession>();
  const [loginState, setLoginState] = useState<string>();
  const [verifyCode, setVerifyCode] = useState("");
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [clearValue, setClearValue] = useState("");
  const [thinking, setThinking] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const followLatestRef = useRef(true);

  const refresh = useCallback(async () => {
    const [nextStatus, history] = await Promise.all([
      window.devinAgent.weixin.getStatus(),
      window.devinAgent.weixin.getHistory({ limit: 100 }),
    ]);
    setStatus(nextStatus);
    setMessages(history.messages);
    setHasMore(history.hasMore);
    setBefore(history.before);
    followLatestRef.current = true;
  }, []);

  useEffect(() => {
    void refresh().catch((cause) => setError(messageOf(cause)));
    return window.devinAgent.weixin.onEvent((event) => {
      if (event.type === "status") {
        setStatus(event.status);
        if (!event.status.running) setThinking("");
      }
      if (event.type === "history-reset") {
        setMessages([]);
        setLogin(undefined);
        setThinking("");
      }
      if (event.type === "thought") {
        setThinking((current) => event.phase === "start" ? event.text : current + event.text);
      }
      if (event.type === "message") {
        setThinking("");
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

  useEffect(() => {
    if (!login) return;
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const result = await window.devinAgent.weixin.waitLogin(login.sessionId);
          if (cancelled) return;
          setLoginState(result.message);
          if (result.state === "connected") {
            setLogin(undefined);
            await refresh();
            return;
          }
          if (["expired", "error", "verify-required"].includes(result.state)) return;
        } catch (cause) {
          if (!cancelled) setError(messageOf(cause));
          return;
        }
      }
    };
    void poll();
    return () => { cancelled = true; };
  }, [login, refresh]);

  const chooseWorkspace = async () => {
    setError(undefined);
    const selected = await window.devinAgent.weixin.chooseWorkspace();
    if (!selected) return;
    const accepted = window.confirm(
      `将以下目录设为微信 Bot 的固定工作目录？\n\n${selected}\n\nBot 会按 Devin CLI 当前模式与组织策略在此目录处理消息；目录一旦绑定，只能在清除 Bot 数据后更换。`,
    );
    if (!accepted) return;
    await window.devinAgent.weixin.configureWorkspace(selected);
    await refresh();
  };

  const beginLogin = async () => {
    setBusy(true);
    setError(undefined);
    setLoginState("正在生成二维码…");
    try {
      const session = await window.devinAgent.weixin.startLogin();
      setLogin(session);
      setLoginState("请使用微信扫码");
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  };

  const submitVerify = async () => {
    if (!login || !verifyCode.trim()) return;
    await window.devinAgent.weixin.submitVerifyCode(login.sessionId, verifyCode.trim());
    setVerifyCode("");
    setLoginState("验证码已提交，正在确认…");
    const current = login;
    setLogin(undefined);
    queueMicrotask(() => setLogin(current));
  };

  const send = async () => {
    const text = draft.trim();
    if (!text && attachments.length === 0) return;
    setDraft("");
    setAttachments([]);
    setError(undefined);
    try {
      await window.devinAgent.weixin.send({ text, attachmentPaths: attachments });
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
    const page = await window.devinAgent.weixin.getHistory({ before, limit: 100 });
    setMessages((current) => [...page.messages, ...current]);
    setHasMore(page.hasMore);
    setBefore(page.before);
  };

  if (!status) {
    return <div className="weixin-view"><div className="loading-state"><LoaderCircle className="spin" />正在加载微信 Bot…</div></div>;
  }

  const bound = Boolean(status.accountId) && status.state !== "login-required";
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
            <strong>微信 Bot</strong>
            <span>
              {status.online ? <Wifi size={12} /> : <WifiOff size={12} />}
              {status.online ? "已连接" : stateLabel(status.state)}
              {status.modelId ? ` · ${status.modelId}` : ""}
            </span>
          </div>
        </div>
        {bound && (
          <div className="header-actions">
            <button
              className="icon-button"
              title={status.online ? "暂停" : "恢复"}
              aria-label={status.online ? "暂停微信 Bot" : "恢复微信 Bot"}
              onClick={() => void (status.online ? window.devinAgent.weixin.pause() : window.devinAgent.weixin.start())
                .catch((cause) => setError(messageOf(cause)))}
            >
              {status.online ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <details className="weixin-settings">
              <summary className="icon-button" title="微信 Bot 设置" aria-label="打开微信 Bot 设置">
                <Settings2 size={16} />
              </summary>
              <div className="weixin-settings-panel">
                <div className="weixin-settings-heading">
                  <strong>微信 Bot 设置</strong>
                  <span>此 Bot 始终使用同一个 Devin 会话</span>
                </div>
                <dl className="weixin-settings-meta">
                  <div><dt>工作目录</dt><dd title={status.workspacePath}>{shortPath(status.workspacePath ?? "")}</dd></div>
                  <div><dt>运行模式</dt><dd>{status.modeId ?? "自适应"}</dd></div>
                  <div><dt>上下文</dt><dd>{status.contextUsage?.percent == null ? "—" : `${Math.round(status.contextUsage.percent)}%`}</dd></div>
                  <div><dt>媒体占用</dt><dd>{formatBytes(status.mediaBytes)}</dd></div>
                </dl>
                <label className="weixin-settings-toggle">
                  <span><strong>开机启动</strong><small>登录桌面后自动恢复微信连接</small></span>
                  <input
                    type="checkbox"
                    checked={status.autoLaunch}
                    onChange={(event) => void window.devinAgent.weixin.setAutoLaunch(event.target.checked)}
                  />
                </label>
                <button className="weixin-settings-action" onClick={() => void window.devinAgent.weixin.disconnect().catch((cause) => setError(messageOf(cause)))}>
                  <WifiOff size={14} />断开并移除本机凭据
                </button>
                <div className="weixin-settings-danger">
                  <label htmlFor="weixin-clear-data">更换账号或工作目录</label>
                  <p>清除本机凭据、消息记录和固定会话。</p>
                  <input
                    id="weixin-clear-data"
                    value={clearValue}
                    onChange={(event) => setClearValue(event.target.value)}
                    placeholder="输入：清除微信 Bot 数据"
                  />
                  <button
                    disabled={clearValue !== "清除微信 Bot 数据"}
                    onClick={() => void window.devinAgent.weixin.clearAllData(clearValue)
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
          <h1>选择微信 Bot 工作目录</h1>
          <p>每个 Bot 绑定一个固定 Devin 会话与工作目录；实际文件、命令和网络权限由 Devin CLI 当前模式及组织策略决定。</p>
          <button className="primary-button" onClick={() => void chooseWorkspace()}><FolderOpen size={15} />选择工作目录</button>
        </div>
      ) : !bound ? (
        <div className="weixin-onboarding">
          <span className="weixin-hero-icon"><QrCode size={28} /></span>
          <h1>{status.accountId ? "重新绑定微信 Bot" : "绑定微信 Bot"}</h1>
          <p className="weixin-bound-path" title={status.workspacePath}>{status.workspacePath}</p>
          {login ? (
            <>
              <img className="weixin-qr" src={login.qrImageDataUrl} alt="微信 Bot 登录二维码" />
              <p>{loginState}</p>
              {loginState?.includes("验证码") && (
                <div className="weixin-verify">
                  <input value={verifyCode} onChange={(event) => setVerifyCode(event.target.value)} placeholder="微信中显示的数字" />
                  <button className="primary-button" onClick={() => void submitVerify()}>提交</button>
                </div>
              )}
              <button className="secondary-button" onClick={() => { setLogin(undefined); void beginLogin(); }}>
                <RotateCcw size={14} />重新生成
              </button>
            </>
          ) : (
            <button className="primary-button" disabled={busy} onClick={() => void beginLogin()}>
              {busy ? <LoaderCircle className="spin" size={15} /> : <QrCode size={15} />}生成二维码
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
                  <span>从微信或这里发送第一条消息。</span>
                </div>
              )}
              {messages.map((message) => <WeixinMessageRow key={message.id} message={message} />)}
              {status.running && <BotThinkingBlock text={thinking} />}
              {status.running && !thinking && <div className="working-line"><LoaderCircle className="spin" size={14} />微信 Bot 正在处理…</div>}
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
                  placeholder={status.running ? "发送跟进消息…" : "发消息到微信 Bot…"}
                  aria-label="发送消息到微信 Bot"
                  rows={1}
                />
                <div className="composer-toolbar">
                  <div className="composer-tools">
                    <button
                      className="composer-tool-button"
                      title="添加工作目录内的文件"
                      aria-label="添加附件"
                      onClick={() => void window.devinAgent.weixin.chooseAttachments()
                        .then((files) => setAttachments((current) => [...new Set([...current, ...files])].slice(0, 10)))
                        .catch((cause) => setError(messageOf(cause)))}
                    >
                      <Paperclip size={16} />
                    </button>
                  </div>
                  <div className="composer-actions">
                    <button
                      className={`send-button ${status.running ? "stop-button" : ""}`}
                      disabled={!status.running && !draft.trim() && attachments.length === 0}
                      onClick={() => status.running && !draft.trim() && attachments.length === 0
                        ? void window.devinAgent.weixin.abortTurn()
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

function BotThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(true);
  if (!text) return null;
  return (
    <div className={`reasoning-block ${open ? "open" : ""}`}>
      <button className="reasoning-summary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Sparkles size={13} />
        <span>思考过程</span>
        <ChevronDown className="reasoning-chevron" size={13} />
      </button>
      {open && <p>{text}</p>}
    </div>
  );
}

function WeixinMessageRow({ message }: { message: WeixinMessage }) {
  const user = message.source === "desktop" || message.source === "weixin";
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

function sourceLabel(message: WeixinMessage): string {
  if (message.source === "weixin") return "微信";
  if (message.source === "desktop") return "桌面";
  if (message.source === "agent") return "Devin Agent";
  return "系统";
}

function stateLabel(value: WeixinBotStatus["state"]): string {
  return ({
    unconfigured: "未配置",
    "workspace-ready": "待绑定",
    "login-required": "需重新绑定",
    connecting: "连接中",
    online: "已连接",
    paused: "已暂停",
    error: "连接异常",
  })[value];
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
