import type {
  Dispatch, DragEvent as ReactDragEvent, KeyboardEvent, MouseEvent as ReactMouseEvent,
  RefObject, SetStateAction,
} from "react";
import {
  Bot, ChevronRight, Ellipsis, Folder, FolderOpen, LoaderCircle,
  PanelLeft, Plus, Search, Send, SquarePen,
} from "lucide-react";
import type { SessionSummary, TelegramBotStatus, UserProfile, WeixinBotStatus, WorkspaceItem } from "../../../shared/types";
import type { SidebarSessionGroupKey } from "../../lib/sidebar-order";
import { useI18n } from "../../lib/i18n";
import { ProfileAvatar } from "../settings/SettingsDialog";
import type { SidebarDragState } from "../app/types";

const PROJECT_TASK_PREVIEW_COUNT = 4;

export interface AppSidebarProps {
  sidebarOpen: boolean;
  sessionQuery: string;
  activeView: "thread" | "weixin" | "telegram";
  weixinStatus?: WeixinBotStatus;
  telegramStatus?: TelegramBotStatus;
  pinnedSessions: SessionSummary[];
  recentTasks: SessionSummary[];
  selectedThreadPath?: string;
  runningSessionIds: Set<string>;
  unreadSessionIds: Set<string>;
  sidebarDrag?: SidebarDragState;
  renamingSessionId?: string;
  sessionRenameDraft: string;
  sessionRenameInputRef: RefObject<HTMLInputElement | null>;
  projectsSectionOpen: boolean;
  filteredWorkspaces: WorkspaceItem[];
  projectSessions: Map<string, SessionSummary[]>;
  expandedProjects: Set<string>;
  fullyExpandedProjects: Set<string>;
  workspace?: string;
  activeSession?: string;
  renamingProjectPath?: string;
  projectRenameDraft: string;
  projectRenameInputRef: RefObject<HTMLInputElement | null>;
  recentSectionOpen: boolean;
  profile: UserProfile;
  setSessionQuery: Dispatch<SetStateAction<string>>;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setActiveView: Dispatch<SetStateAction<"thread" | "weixin" | "telegram">>;
  setProjectsSectionOpen: Dispatch<SetStateAction<boolean>>;
  setRecentSectionOpen: Dispatch<SetStateAction<boolean>>;
  setFullyExpandedProjects: Dispatch<SetStateAction<Set<string>>>;
  setSessionRenameDraft: Dispatch<SetStateAction<string>>;
  setProjectRenameDraft: Dispatch<SetStateAction<string>>;
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  createNewThread(): Promise<void>;
  createThreadInProject(projectPath?: string): Promise<void>;
  openSession(session: SessionSummary): Promise<void>;
  openSessionMenu(event: ReactMouseEvent<HTMLElement>, session: SessionSummary): void;
  openProjectMenu(event: ReactMouseEvent<HTMLElement>, project: WorkspaceItem): void;
  dragSessionOver(event: ReactDragEvent<HTMLElement>, targetId: string, groupKey: SidebarSessionGroupKey): void;
  dragProjectOver(event: ReactDragEvent<HTMLElement>, targetPath: string): void;
  finishSidebarDrag(event: ReactDragEvent<HTMLElement>): Promise<void>;
  startSessionDrag(event: ReactDragEvent<HTMLElement>, session: SessionSummary, groupKey: SidebarSessionGroupKey): void;
  startProjectDrag(event: ReactDragEvent<HTMLElement>, item: WorkspaceItem): void;
  cancelSidebarDrag(): void;
  moveSessionByKeyboard(event: KeyboardEvent<HTMLButtonElement>, session: SessionSummary, groupKey: SidebarSessionGroupKey): Promise<void>;
  moveProjectByKeyboard(event: KeyboardEvent<HTMLButtonElement>, item: WorkspaceItem): Promise<void>;
  commitSessionRename(session: SessionSummary): Promise<void>;
  cancelSessionRename(): void;
  commitProjectRename(project: WorkspaceItem): Promise<void>;
  cancelProjectRename(): void;
  toggleWorkspace(item: WorkspaceItem): void;
}

export function AppSidebar(props: AppSidebarProps) {
  const { t } = useI18n();
  const {
    sidebarOpen, sessionQuery, activeView, weixinStatus, telegramStatus, pinnedSessions, recentTasks,
    selectedThreadPath, runningSessionIds, unreadSessionIds, sidebarDrag, renamingSessionId,
    sessionRenameDraft, sessionRenameInputRef, projectsSectionOpen, filteredWorkspaces,
    projectSessions, expandedProjects, fullyExpandedProjects, workspace, activeSession,
    renamingProjectPath, projectRenameDraft, projectRenameInputRef, recentSectionOpen, profile,
    setSessionQuery, setSearchOpen, setSidebarOpen, setActiveView, setProjectsSectionOpen,
    setRecentSectionOpen, setFullyExpandedProjects, setSessionRenameDraft, setProjectRenameDraft,
    setSettingsOpen, createNewThread, createThreadInProject, openSession, openSessionMenu,
    openProjectMenu, dragSessionOver, dragProjectOver, finishSidebarDrag, startSessionDrag,
    startProjectDrag, cancelSidebarDrag, moveSessionByKeyboard, moveProjectByKeyboard,
    commitSessionRename, cancelSessionRename, commitProjectRename, cancelProjectRename, toggleWorkspace,
  } = props;
  return (
      <aside className={`sidebar ${sidebarOpen ? "" : "sidebar-collapsed"}`} inert={!sidebarOpen}>
        <div className="sidebar-titlebar">
          <div className="sidebar-product-title">
            <span className="brand-mark sidebar-brand-mark" aria-hidden="true" />
            <strong>Devin Agent</strong>
          </div>
          <button
            className="icon-button sidebar-search-trigger"
            onClick={() => {
              setSessionQuery("");
              setSearchOpen(true);
            }}
            aria-label={t("sidebar.searchThreads")}
          >
            <Search size={14} />
          </button>
          <button className="icon-button sidebar-toggle" onClick={() => setSidebarOpen(false)} aria-label={t("sidebar.hide")}>
            <PanelLeft size={16} />
          </button>
        </div>

        <div className="sidebar-primary">
          <button className="new-thread-button" onClick={() => void createNewThread()}><Plus size={16} /> {t("sidebar.newThread")} <kbd>⌘N</kbd></button>
          <button className={`new-thread-button weixin-sidebar-button${activeView === "weixin" ? " active" : ""}`} onClick={() => setActiveView("weixin")}>
            <Bot size={16} /> 微信 Bot
            <span className={`weixin-sidebar-dot${weixinStatus?.online ? " online" : weixinStatus?.lastError ? " error" : ""}`} />
          </button>
          <button className={`new-thread-button weixin-sidebar-button${activeView === "telegram" ? " active" : ""}`} onClick={() => setActiveView("telegram")}>
            <Send size={16} /> Telegram Bot
            <span className={`weixin-sidebar-dot${telegramStatus?.online ? " online" : telegramStatus?.lastError ? " error" : ""}`} />
          </button>
        </div>

        <div className="thread-list">
          {pinnedSessions.length > 0 && (
            <>
              <div className="section-label pinned-label">{t("sidebar.pinned")}</div>
              <div className="pinned-task-list">
                {pinnedSessions.map((session) => (
                  <div
                    key={session.path}
                    className={`recent-task-item pinned-task-item${session.path === selectedThreadPath ? " active" : ""}${runningSessionIds.has(session.path) || unreadSessionIds.has(session.path) ? " has-session-indicator" : ""}${sidebarDrag?.kind === "session" && sidebarDrag.id === session.id ? " dragging" : ""}`}
                    draggable={!sessionQuery.trim() && renamingSessionId !== session.id}
                    onContextMenu={(event) => openSessionMenu(event, session)}
                    onDragStart={(event) => startSessionDrag(event, session, "pinned")}
                    onDragEnd={cancelSidebarDrag}
                    onDragOver={(event) => dragSessionOver(event, session.id, "pinned")}
                    onDrop={(event) => void finishSidebarDrag(event)}
                  >
                    {renamingSessionId === session.id ? (
                      <input
                        ref={sessionRenameInputRef}
                        className="session-rename-input pinned-session-rename"
                        value={sessionRenameDraft}
                        maxLength={120}
                        aria-label={t("session.rename")}
                        onChange={(event) => setSessionRenameDraft(event.target.value)}
                        onBlur={() => void commitSessionRename(session)}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          if (event.key === "Enter") { event.preventDefault(); void commitSessionRename(session); }
                          if (event.key === "Escape") { event.preventDefault(); cancelSessionRename(); }
                        }}
                      />
                    ) : (
                      <button
                        className="thread-row pinned-task-row"
                        onClick={() => void openSession(session)}
                        onKeyDown={(event) => void moveSessionByKeyboard(event, session, "pinned")}
                        title={session.title}
                        aria-current={session.path === selectedThreadPath ? "page" : undefined}
                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                      >
                        <span className="thread-copy"><strong>{session.title}</strong></span>
                      </button>
                    )}
                    {runningSessionIds.has(session.path) && (
                      <LoaderCircle className="spin session-row-status" size={12} aria-label={t("status.running")} />
                    )}
                    {!runningSessionIds.has(session.path) && unreadSessionIds.has(session.path) && (
                      <span className="session-row-unread" role="img" aria-label={t("status.newActivity")} title={t("status.newActivity")} />
                    )}
                    <button
                      className="session-more-action"
                      onClick={(event) => openSessionMenu(event, session)}
                      aria-label={t("session.actions", { title: session.title })}
                      aria-haspopup="menu"
                      title={t("session.actions", { title: session.title })}
                    >
                      <Ellipsis size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <button type="button" className="section-label section-toggle" onClick={() => setProjectsSectionOpen((open) => !open)} aria-expanded={projectsSectionOpen}>
            <span>{t("sidebar.projects")}</span>
            <ChevronRight size={12} />
          </button>
          {projectsSectionOpen && <>
            {filteredWorkspaces.length === 0 && <div className="sidebar-empty">{t("sidebar.noProjects")}</div>}
            {filteredWorkspaces.map((item) => {
              const tasks = projectSessions.get(item.path) ?? [];
              const query = sessionQuery.trim().toLowerCase();
              const matchingTasks = query
                ? tasks.filter((session) => session.title.toLowerCase().includes(query))
                : tasks;
              const taskSource = query && matchingTasks.length > 0 ? matchingTasks : tasks;
              const isExpanded = expandedProjects.has(item.path) || Boolean(query);
              const showAll = fullyExpandedProjects.has(item.path) || Boolean(query);
              const visibleTasks = showAll ? taskSource : taskSource.slice(0, PROJECT_TASK_PREVIEW_COUNT);
              const projectIsActive = workspace === item.path && !activeSession;
              return (
                <div className="project-group" key={item.path}>
                  <div
                    className={`project-row-shell${projectIsActive ? " active" : ""}${sidebarDrag?.kind === "project" && sidebarDrag.id === item.path ? " dragging" : ""}`}
                    draggable={!sessionQuery.trim() && renamingProjectPath !== item.path}
                    onContextMenu={(event) => openProjectMenu(event, item)}
                    onDragStart={(event) => startProjectDrag(event, item)}
                    onDragEnd={cancelSidebarDrag}
                    onDragOver={(event) => dragProjectOver(event, item.path)}
                    onDrop={(event) => void finishSidebarDrag(event)}
                  >
                    {renamingProjectPath === item.path ? (
                      <input
                        ref={projectRenameInputRef}
                        className="session-rename-input project-rename-input"
                        value={projectRenameDraft}
                        maxLength={120}
                        aria-label={t("sidebar.renameProject")}
                        onChange={(event) => setProjectRenameDraft(event.target.value)}
                        onBlur={() => void commitProjectRename(item)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") { event.preventDefault(); void commitProjectRename(item); }
                          else if (event.key === "Escape") { event.preventDefault(); cancelProjectRename(); }
                        }}
                        onClick={(event) => event.stopPropagation()}
                      />
                    ) : (
                      <button
                        className="project-row"
                        onClick={() => toggleWorkspace(item)}
                        onKeyDown={(event) => void moveProjectByKeyboard(event, item)}
                        title={item.path}
                        aria-expanded={isExpanded}
                        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                      >
                        {isExpanded ? <FolderOpen size={15} /> : <Folder size={15} />}
                        <strong>{item.name}</strong>
                      </button>
                    )}
                    <button
                      className="project-new-thread"
                      onClick={() => void createThreadInProject(item.path)}
                      aria-label={t("sidebar.newProjectThread", { project: item.name })}
                      title={t("sidebar.newProjectThread", { project: item.name })}
                      disabled={renamingProjectPath === item.path}
                    >
                      <SquarePen size={15} />
                    </button>
                    <button
                      className="project-more-action"
                      onClick={(event) => openProjectMenu(event, item)}
                      aria-label={t("sidebar.projectActions", { project: item.name })}
                      aria-haspopup="menu"
                      title={t("sidebar.projectActions", { project: item.name })}
                      disabled={renamingProjectPath === item.path}
                    >
                      <Ellipsis size={15} />
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="project-task-list" role="group" aria-label={item.name}>
                      {visibleTasks.length === 0 && <div className="project-task-empty">{t("sidebar.noProjectTasks")}</div>}
                      {visibleTasks.map((session) => (
                        <div
                          key={session.path}
                          className={`project-task-item${session.path === selectedThreadPath ? " active" : ""}${runningSessionIds.has(session.path) || unreadSessionIds.has(session.path) ? " has-session-indicator" : ""}${sidebarDrag?.kind === "session" && sidebarDrag.id === session.id ? " dragging" : ""}`}
                          draggable={!sessionQuery.trim() && renamingSessionId !== session.id}
                          onContextMenu={(event) => openSessionMenu(event, session)}
                          onDragStart={(event) => startSessionDrag(event, session, `project:${item.path}`)}
                          onDragEnd={cancelSidebarDrag}
                          onDragOver={(event) => dragSessionOver(event, session.id, `project:${item.path}`)}
                          onDrop={(event) => void finishSidebarDrag(event)}
                        >
                          {renamingSessionId === session.id ? (
                            <input
                              ref={sessionRenameInputRef}
                              className="session-rename-input project-session-rename"
                              value={sessionRenameDraft}
                              maxLength={120}
                              aria-label={t("session.rename")}
                              onChange={(event) => setSessionRenameDraft(event.target.value)}
                              onBlur={() => void commitSessionRename(session)}
                              onKeyDown={(event) => {
                                event.stopPropagation();
                                if (event.key === "Enter") { event.preventDefault(); void commitSessionRename(session); }
                                if (event.key === "Escape") { event.preventDefault(); cancelSessionRename(); }
                              }}
                            />
                          ) : (
                            <button
                              className="project-task-row"
                              onClick={() => void openSession(session)}
                              onKeyDown={(event) => void moveSessionByKeyboard(event, session, `project:${item.path}`)}
                              title={session.title}
                              aria-current={session.path === selectedThreadPath ? "page" : undefined}
                              aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                            >
                              <span>{session.title}</span>
                            </button>
                          )}
                          {runningSessionIds.has(session.path) && (
                            <LoaderCircle className="spin session-row-status" size={12} aria-label={t("status.running")} />
                          )}
                          {!runningSessionIds.has(session.path) && unreadSessionIds.has(session.path) && (
                            <span className="session-row-unread" role="img" aria-label={t("status.newActivity")} title={t("status.newActivity")} />
                          )}
                          <button
                            className="session-more-action"
                            onClick={(event) => openSessionMenu(event, session)}
                            aria-label={t("session.actions", { title: session.title })}
                            aria-haspopup="menu"
                            title={t("session.actions", { title: session.title })}
                          >
                            <Ellipsis size={14} />
                          </button>
                        </div>
                      ))}
                      {!query && taskSource.length > PROJECT_TASK_PREVIEW_COUNT && (
                        <button
                          className="project-task-more"
                          onClick={() => setFullyExpandedProjects((current) => {
                            const next = new Set(current);
                            if (next.has(item.path)) next.delete(item.path);
                            else next.add(item.path);
                            return next;
                          })}
                        >
                          {showAll ? t("sidebar.showLess") : t("sidebar.showMore")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>}

          <button type="button" className="section-label section-toggle recent-label" onClick={() => setRecentSectionOpen((open) => !open)} aria-expanded={recentSectionOpen}>
            <span>{t("sidebar.recent")}</span>
            <ChevronRight size={12} />
          </button>
          {recentSectionOpen && <>
            {recentTasks.length === 0 && <div className="sidebar-empty">{t("sidebar.noRecentTasks")}</div>}
            {recentTasks.map((session) => (
              <div
                key={session.path}
                className={`recent-task-item${session.path === selectedThreadPath ? " active" : ""}${runningSessionIds.has(session.path) || unreadSessionIds.has(session.path) ? " has-session-indicator" : ""}${sidebarDrag?.kind === "session" && sidebarDrag.id === session.id ? " dragging" : ""}`}
                draggable={!sessionQuery.trim() && renamingSessionId !== session.id}
                onContextMenu={(event) => openSessionMenu(event, session)}
                onDragStart={(event) => startSessionDrag(event, session, "recent")}
                onDragEnd={cancelSidebarDrag}
                onDragOver={(event) => dragSessionOver(event, session.id, "recent")}
                onDrop={(event) => void finishSidebarDrag(event)}
              >
                {renamingSessionId === session.id ? (
                  <input
                    ref={sessionRenameInputRef}
                    className="session-rename-input recent-session-rename"
                    value={sessionRenameDraft}
                    maxLength={120}
                    aria-label={t("session.rename")}
                    onChange={(event) => setSessionRenameDraft(event.target.value)}
                    onBlur={() => void commitSessionRename(session)}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      if (event.key === "Enter") { event.preventDefault(); void commitSessionRename(session); }
                      if (event.key === "Escape") { event.preventDefault(); cancelSessionRename(); }
                    }}
                  />
                ) : (
                  <button
                    className="thread-row recent-task-row"
                    onClick={() => void openSession(session)}
                    onKeyDown={(event) => void moveSessionByKeyboard(event, session, "recent")}
                    title={session.title}
                    aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
                  >
                    <span className="thread-copy"><strong>{session.title}</strong></span>
                  </button>
                )}
                {runningSessionIds.has(session.path) && (
                  <LoaderCircle className="spin session-row-status" size={12} aria-label={t("status.running")} />
                )}
                {!runningSessionIds.has(session.path) && unreadSessionIds.has(session.path) && (
                  <span className="session-row-unread" role="img" aria-label={t("status.newActivity")} title={t("status.newActivity")} />
                )}
                <button
                  className="session-more-action"
                  onClick={(event) => openSessionMenu(event, session)}
                  aria-label={t("session.actions", { title: session.title })}
                  aria-haspopup="menu"
                  title={t("session.actions", { title: session.title })}
                >
                  <Ellipsis size={14} />
                </button>
              </div>
            ))}
          </>}
        </div>

        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-account-button"
            onClick={() => setSettingsOpen(true)}
            aria-label={`${profile.nickname} · ${t("sidebar.settings")}`}
            title={t("sidebar.settings")}
          >
            <ProfileAvatar profile={profile} className="sidebar-account-avatar" />
            <strong>{profile.nickname}</strong>
          </button>
        </div>
      </aside>
  );
}
