import { useMemo } from "react";
import {
  Check, ChevronRight, CircleAlert, ExternalLink, Eye, File as FileIcon, FileCode2,
  FileText, FolderOpen, GitCompareArrows, LoaderCircle, X,
} from "lucide-react";
import type { FilePreview, WorkspaceChange, WorkspaceChanges, WorkspaceDiff } from "../../../shared/types";
import { parseUnifiedDiff } from "../../lib/git-diff";
import { useI18n } from "../../lib/i18n";
import { fileNameFromPath, formatFileSize } from "../../lib/app-helpers";
import { MarkdownContent } from "../conversation/ConversationContent";

export function ChangesPanel(props: {
  width: number;
  snapshot?: WorkspaceChanges;
  selectedChange?: WorkspaceChange;
  diff?: WorkspaceDiff;
  loading: boolean;
  error?: string;
  onRefresh(): void;
  onSelect(change: WorkspaceChange): void;
  onBack(): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const diffLines = useMemo(() => parseUnifiedDiff(props.diff?.content ?? ""), [props.diff?.content]);
  const visibleDiffLines = useMemo(() => diffLines.filter((line) => line.kind !== "header"), [diffLines]);
  const fileName = props.selectedChange ? fileNameFromPath(props.selectedChange.path) : undefined;
  const parentPath = props.selectedChange?.path.includes("/") ? props.selectedChange.path.slice(0, props.selectedChange.path.lastIndexOf("/")) : undefined;
  return (
    <aside className="inspector preview-panel changes-panel" style={{ width: props.width, flexBasis: props.width }}>
      <div className="preview-header">
        <div className="preview-heading">
          {props.selectedChange ? (
            <button className="preview-file-icon changes-back-button" onClick={props.onBack} aria-label={t("changes.back")} title={t("changes.back")}>
              <ChevronRight size={15} />
            </button>
          ) : <span className="preview-file-icon"><GitCompareArrows size={15} /></span>}
          <span>
            <strong>{fileName ?? t("changes.title")}</strong>
            <small title={props.selectedChange?.path}>{parentPath ?? props.snapshot?.branch ?? t("changes.readOnly")}</small>
          </span>
        </div>
        <div className="preview-actions">
          <button className="icon-button" onClick={props.onRefresh} title={t("changes.refresh")} aria-label={t("changes.refresh")}><RefreshCwIcon /></button>
          <button className="icon-button" onClick={props.onClose} aria-label={t("common.close")}><X size={15} /></button>
        </div>
      </div>

      <div className="preview-stage changes-stage">
        {props.loading && <div className="preview-loading"><LoaderCircle className="spin" size={18} /><span>{props.selectedChange ? t("changes.loadingDiff") : t("changes.loading")}</span></div>}
        {!props.loading && props.error && (
          <div className="preview-empty preview-error">
            <CircleAlert size={22} />
            <strong>{t("changes.cannotLoad")}</strong>
            <span>{props.error}</span>
            <button className="preview-secondary-button" onClick={props.onRefresh}>{t("changes.tryAgain")}</button>
          </div>
        )}
        {!props.loading && !props.error && props.selectedChange && props.diff && (
          <div className="diff-preview" role="region" aria-label={t("changes.diffFor", { file: props.selectedChange.path })}>
            {visibleDiffLines.map((line, index) => line.kind === "hunk" ? (
              index === 0 ? null : <div className="diff-hunk-gap" key={`${index}:${line.text}`} aria-label={line.text}><span>•••</span></div>
            ) : (
              <div className={`diff-line ${line.kind}`} key={`${index}:${line.text}`}>
                <span className="diff-line-number">{line.oldLine ?? ""}</span>
                <span className="diff-line-number">{line.newLine ?? ""}</span>
                <span className="diff-line-marker" aria-hidden="true">{line.kind === "addition" ? "+" : line.kind === "deletion" ? "−" : ""}</span>
                <code>
                  {line.segments
                    ? line.segments.map((segment, segmentIndex) => <mark className={segment.changed ? "diff-inline-change" : undefined} key={`${segmentIndex}:${segment.text}`}>{segment.text}</mark>)
                    : line.text.slice(line.kind === "context" || line.kind === "addition" || line.kind === "deletion" ? 1 : 0) || " "}
                </code>
              </div>
            ))}
          </div>
        )}
        {!props.loading && !props.error && !props.selectedChange && props.snapshot && !props.snapshot.isRepository && (
          <div className="preview-empty">
            <span className="preview-empty-icon"><GitCompareArrows size={23} /></span>
            <strong>{t("changes.notRepository")}</strong>
            <span>{t("changes.notRepositoryDescription")}</span>
          </div>
        )}
        {!props.loading && !props.error && !props.selectedChange && props.snapshot?.isRepository && props.snapshot.changes.length === 0 && (
          <div className="preview-empty">
            <span className="preview-empty-icon"><Check size={23} /></span>
            <strong>{t("changes.clean")}</strong>
            <span>{t("changes.cleanDescription")}</span>
          </div>
        )}
        {!props.loading && !props.error && !props.selectedChange && props.snapshot?.isRepository && props.snapshot.changes.length > 0 && (
          <div className="changes-list">
            <div className="changes-list-heading">
              <span>{t("changes.changedFiles")}</span>
              <small>{props.snapshot.changes.length}</small>
            </div>
            {props.snapshot.changes.map((change) => {
              const directory = change.path.includes("/") ? change.path.slice(0, change.path.lastIndexOf("/")) : undefined;
              return (
                <button className="change-row" key={`${change.path}:${change.indexStatus}:${change.workingTreeStatus}`} onClick={() => props.onSelect(change)} title={change.path}>
                  <FileText size={15} />
                  <span className="change-row-copy">
                    <strong>{fileNameFromPath(change.path)}</strong>
                    {directory && <small>{directory}</small>}
                  </span>
                  <span className={`change-status ${change.kind}`}>{changeStatusLabel(change)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="preview-statusbar changes-statusbar">
        <span>{t("changes.readOnly")}</span>
        {props.diff?.truncated && <span>{t("changes.truncated")}</span>}
        {props.snapshot?.branch && !props.selectedChange && <span>{props.snapshot.branch}</span>}
        {props.selectedChange && <span>{props.selectedChange.staged ? t("changes.staged") : t("changes.workingTree")}</span>}
      </div>
    </aside>
  );
}

function changeStatusLabel(change: WorkspaceChange): string {
  if (change.kind === "untracked") return "U";
  if (change.kind === "conflicted") return "!";
  if (change.kind === "renamed") return "R";
  if (change.kind === "copied") return "C";
  if (change.kind === "added") return "A";
  if (change.kind === "deleted") return "D";
  return "M";
}

export function FilePreviewPanel(props: {
  width: number;
  preview?: FilePreview;
  loading: boolean;
  error?: string;
  recentFiles: string[];
  onChoose(): void;
  onPreview(filePath: string): void;
  onRefresh(): void;
  onOpenExternal(): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const { preview } = props;
  return (
    <aside className="inspector preview-panel" style={{ width: props.width, flexBasis: props.width }}>
      <div className="preview-header">
        <div className="preview-heading">
          <span className="preview-file-icon"><FileIcon size={15} /></span>
          <span>
            <strong>{preview?.name ?? t("preview.title")}</strong>
            <small title={preview?.path}>{preview?.path ?? t("preview.noFile")}</small>
          </span>
        </div>
        <div className="preview-actions">
          <button className="icon-button" onClick={props.onChoose} title={t("preview.chooseFile")} aria-label={t("preview.chooseFile")}><FolderOpen size={15} /></button>
          {preview && <button className="icon-button" onClick={props.onRefresh} title={t("preview.refresh")} aria-label={t("preview.refresh")}><RefreshCwIcon /></button>}
          {preview && <button className="icon-button" onClick={props.onOpenExternal} title={t("preview.openExternal")} aria-label={t("preview.openExternal")}><ExternalLink size={14} /></button>}
          <button className="icon-button" onClick={props.onClose} aria-label={t("common.close")}><X size={15} /></button>
        </div>
      </div>

      <div className="preview-stage">
        {props.loading && <div className="preview-loading"><LoaderCircle className="spin" size={18} /><span>{t("preview.loading")}</span></div>}
        {!props.loading && props.error && (
          <div className="preview-empty preview-error">
            <CircleAlert size={22} />
            <strong>{t("preview.cannotOpen")}</strong>
            <span>{props.error}</span>
            <button className="preview-secondary-button" onClick={props.onChoose}>{t("preview.chooseAnother")}</button>
          </div>
        )}
        {!props.loading && !props.error && !preview && (
          <div className="preview-empty">
            <span className="preview-empty-icon"><Eye size={23} /></span>
            <strong>{t("preview.emptyTitle")}</strong>
            <span>{t("preview.emptyDescription")}</span>
            <button className="preview-primary-button" onClick={props.onChoose}><FolderOpen size={14} />{t("preview.chooseFile")}</button>
            {props.recentFiles.length > 0 && (
              <div className="preview-recent">
                <small>{t("preview.recentFiles")}</small>
                {props.recentFiles.map((filePath) => (
                  <button key={filePath} onClick={() => props.onPreview(filePath)} title={filePath}>
                    <FileText size={13} />
                    <span>{fileNameFromPath(filePath)}</span>
                    <Eye size={12} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {!props.loading && !props.error && preview && <FilePreviewBody preview={preview} onOpenExternal={props.onOpenExternal} />}
      </div>

      {preview && !props.loading && !props.error && (
        <div className="preview-statusbar">
          <span>{preview.extension ? preview.extension.toUpperCase() : t("preview.file")}</span>
          <span>{formatFileSize(preview.size)}</span>
          <span>{new Date(preview.modifiedAt).toLocaleString()}</span>
        </div>
      )}
    </aside>
  );
}

function FilePreviewBody({ preview, onOpenExternal }: { preview: FilePreview; onOpenExternal(): void }) {
  const { t } = useI18n();
  if (preview.kind === "html") {
    return <iframe className="preview-frame" src={preview.url} title={preview.name} sandbox="allow-same-origin allow-scripts allow-forms allow-modals allow-popups" referrerPolicy="no-referrer" />;
  }
  if (preview.kind === "image") {
    return <div className="preview-image"><img src={preview.url} alt={preview.name} /></div>;
  }
  if (preview.kind === "pdf") {
    return <iframe className="preview-frame preview-pdf" src={preview.url} title={preview.name} />;
  }
  if (preview.kind === "video") {
    return <div className="preview-media"><video src={preview.url} controls /></div>;
  }
  if (preview.kind === "audio") {
    return <div className="preview-media preview-audio"><FileIcon size={30} /><strong>{preview.name}</strong><audio src={preview.url} controls /></div>;
  }
  if (preview.tooLarge) {
    return (
      <div className="preview-empty">
        <FileCode2 size={24} />
        <strong>{t("preview.tooLarge")}</strong>
        <span>{t("preview.tooLargeDescription")}</span>
        <button className="preview-secondary-button" onClick={onOpenExternal}>{t("preview.openExternal")}</button>
      </div>
    );
  }
  if (preview.kind === "markdown") {
    return <div className="preview-document"><MarkdownContent text={preview.content ?? ""} /></div>;
  }
  if (preview.kind === "code" || preview.kind === "text") {
    return <pre className={`preview-source ${preview.kind}`}><code>{preview.content ?? ""}</code></pre>;
  }
  return (
    <div className="preview-empty">
      <FileIcon size={25} />
      <strong>{t("preview.unsupported")}</strong>
      <span>{t("preview.unsupportedDescription")}</span>
      <button className="preview-secondary-button" onClick={onOpenExternal}>{t("preview.openExternal")}</button>
    </div>
  );
}

function RefreshCwIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5" /></svg>;
}
