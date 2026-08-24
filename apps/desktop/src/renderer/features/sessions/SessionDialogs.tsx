import { useState } from "react";
import { Eye, FolderOpen, LoaderCircle, Plus, Search, Settings, TerminalSquare, Trash2 } from "lucide-react";
import type { SessionSummary, WorkspaceItem } from "../../../shared/types";
import type { AvailableCommand } from "../../../shared/conversation";
import { useI18n } from "../../lib/i18n";
import { relativeTime } from "../../lib/app-helpers";

export function ProjectRemovalDialog({
  project,
  busy,
  onCancel,
  onConfirm,
}: {
  project: WorkspaceItem;
  busy: boolean;
  onCancel(): void;
  onConfirm(): void;
}) {
  const { t } = useI18n();
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}
    >
      <section
        className="approval-dialog project-removal-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="project-removal-title"
        aria-describedby="project-removal-description"
        onKeyDown={(event) => { if (event.key === "Escape") onCancel(); }}
      >
        <div className="approval-icon project-removal-icon"><Trash2 size={18} /></div>
        <h3 id="project-removal-title">{t("sidebar.removeProjectTitle", { project: project.name })}</h3>
        <p id="project-removal-description">{t("sidebar.removeProjectDescription")}</p>
        <div className="dialog-actions">
          <button type="button" autoFocus disabled={busy} onClick={onCancel}>{t("common.cancel")}</button>
          <button type="button" className="danger-button" disabled={busy} onClick={onConfirm}>
            {busy ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}
            {t(busy ? "sidebar.removingProject" : "sidebar.removeProject")}
          </button>
        </div>
      </section>
    </div>
  );
}


export function CommandPalette({ availableCommands, onRunCommand, onClose, onNew, onOpen, onSettings, onInspector }: { availableCommands: AvailableCommand[]; onRunCommand(command: AvailableCommand): void; onClose(): void; onNew(): void; onOpen(): void; onSettings(): void; onInspector(): void }) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const appCommands = [
    { label: t("command.newThread"), icon: Plus, keys: "⌘N", run: onNew },
    { label: t("command.openWorkspace"), icon: FolderOpen, keys: "⌘O", run: onOpen },
    { label: t("command.showActivity"), icon: Eye, keys: "", run: onInspector },
    { label: t("command.openSettings"), icon: Settings, keys: "⌘,", run: onSettings },
  ].filter((command) => command.label.toLowerCase().includes(query.toLowerCase()));
  const runtimeCommands = availableCommands.filter((command) => `${command.name} ${command.description ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="modal-backdrop command-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="command-palette"><label><Search size={17} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("command.search")} /></label><div>{appCommands.map((command) => <button key={command.label} onClick={() => { command.run(); onClose(); }}><command.icon size={16} /><span>{command.label}</span><kbd>{command.keys}</kbd></button>)}{runtimeCommands.map((command) => <button key={`runtime-${command.name}`} onClick={() => { onRunCommand(command); onClose(); }}><TerminalSquare size={16} /><span>/{command.name.replace(/^\//, "")}{/^\/?handoff$/i.test(command.name) ? " · Cloud" : ""}</span><kbd>Devin</kbd></button>)}</div></div></div>;
}

export function SessionSearchDialog({
  sessions,
  workspaces,
  activeSession,
  query,
  onQuery,
  onClose,
  onOpen,
  onNew,
}: {
  sessions: SessionSummary[];
  workspaces: WorkspaceItem[];
  activeSession?: string;
  query: string;
  onQuery(value: string): void;
  onClose(): void;
  onOpen(session: SessionSummary): void;
  onNew(): void;
}) {
  const { locale, t } = useI18n();
  const projectNames = new Map(workspaces.map((item) => [item.path, item.name]));
  const normalizedQuery = query.trim().toLowerCase();
  const results = sessions.filter((session) => {
    if (session.archived) return false;
    if (!normalizedQuery) return true;
    const projectName = projectNames.get(session.cwd) ?? "";
    return `${session.title} ${session.preview ?? ""} ${projectName} ${session.cwd}`.toLowerCase().includes(normalizedQuery);
  }).slice(0, 14);

  return (
    <div
      className="modal-backdrop session-search-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
      }}
    >
      <section className="session-search-dialog" role="dialog" aria-modal="true" aria-label={t("sidebar.searchThreads")}>
        <label className="session-search-input">
          <Search size={17} aria-hidden="true" />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder={t("sidebar.searchThreads")}
          />
        </label>
        <div className="session-search-results">
          <div className="session-search-section-label">{t("sidebar.threads")}</div>
          {results.length === 0 ? (
            <div className="session-search-empty">{t("search.noResults")}</div>
          ) : results.map((session) => {
            const projectName = projectNames.get(session.cwd)
              ?? session.cwd.split(/[\\/]/).filter(Boolean).at(-1)
              ?? t("status.regularTask");
            return (
              <button
                key={session.path}
                className={`session-search-result ${session.path === activeSession ? "active" : ""}`}
                onClick={() => {
                  onOpen(session);
                  onClose();
                }}
              >
                <span className="session-search-dot" aria-hidden="true" />
                <strong>{session.title}</strong>
                <small>{projectName}</small>
                <time>{relativeTime(session.updatedAt, locale, t("status.now"))}</time>
              </button>
            );
          })}
        </div>
        <div className="session-search-footer">
          <button onClick={() => { onNew(); onClose(); }}><Plus size={16} /><span>{t("sidebar.newThread")}</span><kbd>⌘N</kbd></button>
        </div>
      </section>
    </div>
  );
}
