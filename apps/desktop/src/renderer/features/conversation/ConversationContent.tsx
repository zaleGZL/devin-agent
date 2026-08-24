import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Check, ChevronDown, CircleAlert, Code2, Copy, CornerDownLeft, CornerDownRight, Eye,
  File as FileIcon, FileCode2, Folder, GripVertical, ListTodo, LoaderCircle,
  MessageSquareQuote, MessageSquareText, Pencil, Search, Sparkles, TerminalSquare, Trash2, X,
} from "lucide-react";
import type { MentionRef } from "../../../shared/mentions";
import {
  getAssistantActivity, splitAssistantTurn, type ChatMessage, type ToolActivity, type TurnWorkEntry,
} from "../../lib/conversation";
import { useI18n } from "../../lib/i18n";
import { mentionDisplayText, splitMentionText } from "../../lib/mentions";
import { parseStructuredPlan } from "../../lib/plan";
import { assistantResponseText } from "../../lib/session-export";
import type { FollowUpItem } from "../../lib/follow-up";
import type { PreviewImage, QueuedPrompt } from "../app/types";
import { PlanTodoList } from "../plans/PlanCards";
import {
  formatElapsed, formatToolArgs, imageDataUrl, previewPathFromHref, toolDisplayTitle,
  toolFilePath, workDuration,
} from "../../lib/app-helpers";

export function EmptyState({ workspace, onSuggest }: { workspace?: string; onSuggest(value: string): void }) {
  const { t } = useI18n();
  const suggestions = workspace
    ? [
        { icon: Code2, text: t("suggestion.explainCodebase") },
        { icon: CircleAlert, text: t("suggestion.fixBug") },
        { icon: Sparkles, text: t("suggestion.buildFeature") },
      ]
    : [
        { icon: MessageSquareText, text: t("suggestion.answerQuestion") },
        { icon: FileCode2, text: t("suggestion.draftPlan") },
        { icon: Sparkles, text: t("suggestion.brainstorm") },
      ];
  return (
    <div className="empty-state">
      <div className="empty-brand"><span className="brand-mark large"><span /></span></div>
      <h1>{workspace ? t("empty.title") : t("empty.noWorkspaceTitle")}</h1>
      <p>{workspace ? t("empty.description") : t("empty.noWorkspaceDescription")}</p>
      <div className="suggestion-grid">
        {suggestions.map((suggestion) => <button key={suggestion.text} onClick={() => onSuggest(suggestion.text)}><suggestion.icon size={16} />{suggestion.text}</button>)}
      </div>
    </div>
  );
}

function InlineMentionText({ text, mentions }: { text: string; mentions: readonly MentionRef[] }) {
  return splitMentionText(text, mentions).map((segment, index) => segment.type === "text"
    ? <span key={`text-${index}`}>{segment.text}</span>
    : <MentionTag key={`${segment.mention.id}-${index}`} mention={segment.mention} />);
}

function MentionTag({ mention }: { mention: MentionRef }) {
  return (
    <span className={`message-mention mention-${mention.kind}`}>
      {mention.kind === "file" ? <FileIcon size={12} /> : mention.kind === "directory" ? <Folder size={12} /> : <Sparkles size={12} />}
      <span>{mentionDisplayText(mention)}</span>
    </span>
  );
}

export function UserMessage({ message, onPreview }: { message: ChatMessage; onPreview(image: PreviewImage): void }) {
  const { t } = useI18n();
  return (
    <div className={`user-message${message.images.length > 0 ? " has-images" : ""}`}>
      {message.annotations && message.annotations.length > 0 && (
        <details className="user-annotation-context">
          <summary><MessageSquareQuote size={13} />{t("annotation.count", { count: message.annotations.length })}</summary>
          <div className="user-annotation-list">
            {message.annotations.map((annotation, index) => (
              <div key={annotation.id}>
                <strong>{index + 1}. {t("annotation.selectedText")}</strong>
                <p>{annotation.text}</p>
                {annotation.comment && <small>{t("annotation.comment")}: {annotation.comment}</small>}
              </div>
            ))}
          </div>
        </details>
      )}
      {message.images.length > 0 && (
        <div className={`message-images${message.images.length > 1 ? " multiple" : ""}`}>
          {message.images.map((image, index) => (
            <button
              type="button"
              className="message-image-button"
              key={`${image.mimeType}-${index}`}
              onClick={() => onPreview({ ...image, alt: t("composer.imageNumber", { number: index + 1 }) })}
              aria-label={t("composer.previewImage")}
            >
              <img src={imageDataUrl(image)} alt={t("composer.imageNumber", { number: index + 1 })} />
            </button>
          ))}
        </div>
      )}
      {(message.text || (message.mentions?.length ?? 0) > 0) && (
        <div className="user-message-text">
          <InlineMentionText text={message.text} mentions={message.mentions ?? []} />
        </div>
      )}
      {message.queued && <small>{t("status.queued")}</small>}
    </div>
  );
}

export function FollowUpQueue({
  items,
  onMove,
  onDelete,
  onEdit,
  onSendNow,
}: {
  items: FollowUpItem<QueuedPrompt>[];
  onMove(draggedId: string, targetId: string): void;
  onDelete(itemId: string): void;
  onEdit(itemId: string, text: string): void;
  onSendNow(itemId: string): void;
}) {
  const { t } = useI18n();
  const draggingIdRef = useRef<string | undefined>(undefined);
  const pointerTargetIdRef = useRef<string | undefined>(undefined);
  const [draggingId, setDraggingId] = useState<string>();
  const [editingId, setEditingId] = useState<string>();
  const [editDraft, setEditDraft] = useState("");

  const startEditing = (item: FollowUpItem<QueuedPrompt>) => {
    setEditingId(item.id);
    setEditDraft(item.value.text);
  };
  const finishEditing = (item: FollowUpItem<QueuedPrompt>) => {
    const next = editDraft.trim();
    if (next || item.value.images.length > 0) onEdit(item.id, next);
    setEditingId(undefined);
    setEditDraft("");
  };
  const finishPointerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    draggingIdRef.current = undefined;
    pointerTargetIdRef.current = undefined;
    setDraggingId(undefined);
  };
  const movePointerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const sourceId = draggingIdRef.current;
    if (!sourceId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-follow-up-id]");
    const targetId = target?.dataset.followUpId;
    if (!targetId || targetId === sourceId || targetId === pointerTargetIdRef.current) return;
    pointerTargetIdRef.current = targetId;
    onMove(sourceId, targetId);
  };

  return (
    <section className="follow-up-queue" aria-label={t("queue.title")}>
      <header className="follow-up-queue-header">
        <span>{t("queue.waiting", { count: items.length })}</span>
        <small>{t("queue.shortcut")}</small>
      </header>
      <div className="follow-up-queue-list">
        {items.map((item, index) => {
          const editing = editingId === item.id;
          return (
            <div
              key={item.id}
              data-follow-up-id={item.id}
              className={`follow-up-row${draggingId === item.id ? " dragging" : ""}`}
              draggable={!editing}
              tabIndex={editing ? -1 : 0}
              onDragStart={(event) => {
                draggingIdRef.current = item.id;
                setDraggingId(item.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", item.id);
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                const sourceId = draggingIdRef.current;
                if (sourceId && sourceId !== item.id) onMove(sourceId, item.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const sourceId = draggingIdRef.current || event.dataTransfer.getData("text/plain");
                if (sourceId && sourceId !== item.id) onMove(sourceId, item.id);
                draggingIdRef.current = undefined;
                setDraggingId(undefined);
              }}
              onDragEnd={() => {
                draggingIdRef.current = undefined;
                setDraggingId(undefined);
              }}
              onKeyDown={(event) => {
                if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
                const target = items[index + (event.key === "ArrowUp" ? -1 : 1)];
                if (!target) return;
                event.preventDefault();
                onMove(item.id, target.id);
              }}
              aria-label={t("queue.drag", { message: item.value.text || (item.value.annotations?.length ? t("annotation.defaultRequest") : t("composer.attachedImage")) })}
            >
              <span
                className="follow-up-drag-handle"
                aria-hidden="true"
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  draggingIdRef.current = item.id;
                  pointerTargetIdRef.current = item.id;
                  setDraggingId(item.id);
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={movePointerDrag}
                onPointerUp={finishPointerDrag}
                onPointerCancel={finishPointerDrag}
              ><GripVertical size={13} /></span>
              <span className="follow-up-kind" aria-hidden="true"><CornerDownRight size={14} /></span>
              {editing ? (
                <div className="follow-up-editor">
                  <textarea
                    value={editDraft}
                    onChange={(event) => setEditDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingId(undefined);
                      }
                      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                        event.preventDefault();
                        finishEditing(item);
                      }
                    }}
                    autoFocus
                    rows={2}
                    aria-label={t("queue.edit")}
                  />
                  <div className="follow-up-editor-actions">
                    <button type="button" onClick={() => setEditingId(undefined)}>{t("common.cancel")}</button>
                    <button type="button" className="primary-button" onClick={() => finishEditing(item)}>{t("queue.save")}</button>
                  </div>
                </div>
              ) : (
                <div className="follow-up-copy">
                  <span>
                    {item.value.text || item.value.mentions?.length
                      ? <InlineMentionText text={item.value.text} mentions={item.value.mentions ?? []} />
                      : item.value.annotations?.length ? t("annotation.defaultRequest") : t("composer.attachedImage")}
                  </span>
                  {item.value.annotations && item.value.annotations.length > 0 && <small>{t("annotation.count", { count: item.value.annotations.length })}</small>}
                  {item.value.images.length > 0 && <small>{t("queue.images", { count: item.value.images.length })}</small>}
                </div>
              )}
              {!editing && (
                <div className="follow-up-actions">
                  <button type="button" className="follow-up-send-now" onClick={() => onSendNow(item.id)} title={t("queue.sendNow")}>
                    <CornerDownLeft size={14} /><span>{t("queue.sendNow")}</span>
                  </button>
                  <button type="button" onClick={() => startEditing(item)} title={t("queue.edit")} aria-label={t("queue.edit")}><Pencil size={14} /></button>
                  <button type="button" onClick={() => onDelete(item.id)} title={t("queue.delete")} aria-label={t("queue.delete")}><Trash2 size={14} /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ImageLightbox({ image, onClose }: { image: PreviewImage; onClose(): void }) {
  const { t } = useI18n();
  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={t("composer.imagePreview")}
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <button type="button" className="image-lightbox-close" onClick={onClose} aria-label={t("common.close")}><X size={18} /></button>
      <img src={imageDataUrl(image)} alt={image.alt} />
    </div>
  );
}

export function AssistantTurn({
  messages,
  active,
  showReasoningProcess,
  onPreviewFile,
  onCopyError,
}: {
  messages: ChatMessage[];
  active: boolean;
  showReasoningProcess: boolean;
  onPreviewFile(filePath: string): void;
  onCopyError(): void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const { work, responses } = splitAssistantTurn(messages, active);
  const copyText = assistantResponseText(messages);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1_800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyResponse = async () => {
    try {
      await window.devinAgent.app.copyText(copyText);
      setCopied(true);
    } catch {
      onCopyError();
    }
  };

  return (
    <article className="assistant-message">
      {work.length > 0 && (
        <WorkLog
          messages={messages}
          timeline={work}
          active={active}
          showReasoningProcess={showReasoningProcess}
          onPreviewFile={onPreviewFile}
        />
      )}
      {responses.map((response) => (
        <div className="assistant-response" key={response.key} data-annotation-source={response.key}>
          <MarkdownContent text={response.text} onPreviewFile={onPreviewFile} />
          {response.streaming && <span className="stream-cursor" />}
        </div>
      ))}
      {!active && copyText && (
        <div className="assistant-response-actions">
          <button type="button" className="assistant-copy-action" onClick={() => void copyResponse()} aria-label={copied ? t("message.copied") : t("message.copyResponse")}>
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? t("message.copied") : t("message.copy")}</span>
          </button>
        </div>
      )}
    </article>
  );
}

export function MarkdownContent({ text, className = "markdown-body", onPreviewFile }: { text: string; className?: string; onPreviewFile?(filePath: string): void }) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
        a: ({ children, href }) => {
          const filePath = previewPathFromHref(href);
          return filePath && onPreviewFile
            ? <button type="button" className="markdown-file-link" onClick={() => onPreviewFile(filePath)}>{children}</button>
            : <a href={href} target="_blank" rel="noreferrer">{children}</a>;
        },
        code: ({ children, className: codeClassName }) => <code className={codeClassName}>{children}</code>,
      }}>{text}</ReactMarkdown>
    </div>
  );
}

function WorkLog({
  messages,
  timeline,
  active,
  showReasoningProcess,
  onPreviewFile,
}: {
  messages: ChatMessage[];
  timeline: TurnWorkEntry[];
  active: boolean;
  showReasoningProcess: boolean;
  onPreviewFile(filePath: string): void;
}) {
  const { t } = useI18n();
  const failed = messages.some((message) => message.tools.some((tool) => tool.status === "error"));
  const activity = getAssistantActivity(messages);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const expanded = active || open;

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [active]);

  const duration = workDuration(messages, active ? now : undefined);
  const latestWorkKey = timeline.at(-1)?.key;
  return (
    <section className={`work-log ${expanded ? "open" : ""} ${active ? "active" : "complete"}`}>
      <button
        className="work-log-summary"
        aria-expanded={expanded}
        aria-disabled={active}
        onClick={() => { if (!active) setOpen((value) => !value); }}
      >
        {active && <LoaderCircle className="spin work-log-spinner" size={14} aria-hidden="true" />}
        <span aria-live="polite">
          {active
            ? t(activity === "tool" ? "work.toolStatus" : "work.thinkingStatus")
            : failed
              ? t("work.processedErrors")
              : t("work.processed")}
        </span>
        {duration !== undefined && <time>{formatElapsed(duration)}</time>}
        <ChevronDown className="work-log-chevron" size={15} />
      </button>
      {expanded && (
        <div className="work-log-content">
          <div className="work-timeline">
            {timeline.map(({ message, item, key }) => {
              if (item.type === "thinking") return (
                <ReasoningBlock
                  key={key}
                  text={item.text}
                  active={active && key === latestWorkKey}
                  autoExpand={showReasoningProcess}
                />
              );
              if (item.type === "text") return <MarkdownContent key={key} text={item.text} className="work-text markdown-body" onPreviewFile={onPreviewFile} />;
              const tool = message.tools.find((candidate) => candidate.id === item.toolId);
              return tool ? <ToolRow key={key} tool={tool} onPreviewFile={onPreviewFile} /> : null;
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function ReasoningBlock({ text, active, autoExpand }: { text: string; active: boolean; autoExpand: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(active && autoExpand);
  const previousAutoExpand = useRef(autoExpand);

  useEffect(() => {
    if (active && previousAutoExpand.current !== autoExpand) setOpen(autoExpand);
    previousAutoExpand.current = autoExpand;
  }, [active, autoExpand]);

  return (
    <div className={`reasoning-block ${open ? "open" : ""}`}>
      <button className="reasoning-summary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Sparkles size={13} />
        <span>{t("work.reasoning")}</span>
        <ChevronDown className="reasoning-chevron" size={13} />
      </button>
      {open && <p>{text}</p>}
    </div>
  );
}


function ToolRow({ tool, onPreviewFile }: { tool: ToolActivity; onPreviewFile?(filePath: string): void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const hasDetails = tool.args !== undefined || tool.output !== undefined;
  const filePath = toolFilePath(tool);
  const toolName = tool.name.toLowerCase();
  const plan = toolName === "update_plan" ? parseStructuredPlan(tool.args) : undefined;
  const Icon = toolName.includes("exec") || toolName.includes("bash") || toolName.includes("command")
    ? TerminalSquare
    : toolName.includes("plan")
      ? ListTodo
      : toolName.includes("search")
        ? Search
        : FileCode2;

  return (
    <div className={`tool-entry ${open ? "open" : ""}`}>
      <div className="tool-row-line">
        <button
          className={`tool-row ${hasDetails ? "" : "no-details"}`}
          onClick={() => hasDetails && setOpen((value) => !value)}
          aria-expanded={hasDetails ? open : undefined}
          aria-label={hasDetails ? t(open ? "work.hideDetails" : "work.showDetails", { tool: toolDisplayTitle(tool, t) }) : undefined}
        >
          <span className={`tool-state ${tool.status}`}>{tool.status === "running" ? <LoaderCircle className="spin" size={13} /> : tool.status === "error" ? <CircleAlert size={13} /> : <Check size={13} />}</span>
          <Icon size={14} />
          <span>{toolDisplayTitle(tool, t)}</span>
          {hasDetails && <ChevronDown className="tool-chevron" size={13} />}
        </button>
        {filePath && onPreviewFile && (
          <button type="button" className="tool-preview-action" onClick={() => onPreviewFile(filePath)} title={t("preview.openFile")} aria-label={t("preview.openFile")}>
            <Eye size={13} />
          </button>
        )}
      </div>
      {open && hasDetails && (
        <div className="tool-inline-detail">
          {plan
            ? <PlanTodoList plan={plan} />
            : tool.args !== undefined && <section><div className="detail-label">{t("inspector.input")}</div><pre>{formatToolArgs(tool)}</pre></section>}
          {tool.output !== undefined && (!plan || tool.status === "error") && <section><div className="detail-label">{t("inspector.output")}</div><pre>{tool.output || t("work.emptyOutput")}</pre></section>}
        </div>
      )}
    </div>
  );
}
