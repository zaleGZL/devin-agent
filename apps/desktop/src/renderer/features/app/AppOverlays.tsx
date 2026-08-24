import type { Dispatch, RefObject, SetStateAction } from "react";
import { Archive, Check, CircleAlert, ExternalLink, Pencil, Pin, PinOff, Trash2, Undo2, X } from "lucide-react";
import type {
  AgentSnapshot, AuthUiEvent, ColorSchemePreference, PermissionMode, ProviderId,
  ProviderStatus, SandboxMode, SessionSummary, UserProfile, WorkspaceItem,
} from "../../../shared/types";
import type { AvailableCommand } from "../../../shared/conversation";
import type { PreviewImage } from "./types";
import { useI18n } from "../../lib/i18n";
import { cleanError } from "../../lib/app-helpers";
import { ImageLightbox } from "../conversation/ConversationContent";
import { AuthNotice, AuthPromptDialog } from "../plans/PlanCards";
import { CommandPalette, ProjectRemovalDialog, SessionSearchDialog } from "../sessions/SessionDialogs";
import { SettingsDialog } from "../settings/SettingsDialog";

interface AnnotationSelection { text: string; clipboardText: string; range: Range; left: number; top: number }
interface AnnotationCommentEditor { id: string; left: number; top: number }
interface AnnotationMarker { id: string; left: number; top: number }

export interface AppOverlaysProps {
  annotationSelection?: AnnotationSelection;
  copyAnnotationSelection(): Promise<void>;
  addSelectionAnnotation(withComment: boolean): void;
  annotationCommentEditor?: AnnotationCommentEditor;
  annotationCommentInputRef: RefObject<HTMLInputElement | null>;
  annotationCommentDraft: string;
  setAnnotationCommentDraft: Dispatch<SetStateAction<string>>;
  setAnnotationCommentEditor: Dispatch<SetStateAction<AnnotationCommentEditor | undefined>>;
  saveAnnotationComment(): void;
  annotationMarkers: AnnotationMarker[];
  sessionMenu?: { sessionId: string; left: number; top: number };
  sessionMenuItem?: SessionSummary;
  setSessionMenu: Dispatch<SetStateAction<{ sessionId: string; left: number; top: number } | undefined>>;
  beginSessionRename(session: SessionSummary): void;
  toggleSessionPinned(session: SessionSummary): Promise<void>;
  runningSessionIds: Set<string>;
  archiveSession(session: SessionSummary): Promise<void>;
  projectMenu?: { path: string; left: number; top: number };
  projectMenuItem?: WorkspaceItem;
  setProjectMenu: Dispatch<SetStateAction<{ path: string; left: number; top: number } | undefined>>;
  beginProjectRename(project: WorkspaceItem): void;
  requestProjectRemoval(project: WorkspaceItem): void;
  archiveNotice?: SessionSummary;
  setArchiveNotice: Dispatch<SetStateAction<SessionSummary | undefined>>;
  restoreSession(session: SessionSummary): Promise<void>;
  projectPendingRemoval?: WorkspaceItem;
  projectRemovalBusy: boolean;
  setProjectPendingRemoval: Dispatch<SetStateAction<WorkspaceItem | undefined>>;
  removeProject(): Promise<void>;
  settingsOpen: boolean;
  providers: ProviderStatus[];
  model: string;
  availableModels: AgentSnapshot["models"];
  pinnedModelIds: string[];
  permission: PermissionMode;
  availableModes: NonNullable<AgentSnapshot["modes"]>;
  colorScheme: ColorSchemePreference;
  profile: UserProfile;
  showReasoningProcess: boolean;
  sessions: SessionSummary[];
  setSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setProviders: Dispatch<SetStateAction<ProviderStatus[]>>;
  setProvider: Dispatch<SetStateAction<ProviderId>>;
  setModel: Dispatch<SetStateAction<string>>;
  activeSession?: string;
  workspace?: string;
  activeCwd?: string;
  startAgent(
    cwd?: string,
    sessionId?: string,
    override?: { provider?: ProviderId; model?: string; effort?: string; permission?: PermissionMode; sandbox?: SandboxMode },
    workspacePath?: string,
    options?: { background?: boolean; providerStatuses?: ProviderStatus[]; replaySession?: boolean },
  ): Promise<string | undefined>;
  changePermission(value: PermissionMode): Promise<void>;
  changePinnedModelIds(value: string[]): Promise<void>;
  changeColorScheme(value: ColorSchemePreference): Promise<void>;
  setProfile: Dispatch<SetStateAction<UserProfile>>;
  setShowReasoningProcess: Dispatch<SetStateAction<boolean>>;
  authCancellationRef: RefObject<boolean>;
  setToast: Dispatch<SetStateAction<{ message: string; type: "info" | "error" } | undefined>>;
  openSession(session: SessionSummary): Promise<void>;
  commandOpen: boolean;
  availableCommands: AvailableCommand[];
  runAvailableCommand(command: AvailableCommand): Promise<void>;
  createNewThread(): Promise<void>;
  chooseWorkspace(): Promise<string | undefined>;
  showPreviewPanel(): void;
  setCommandOpen: Dispatch<SetStateAction<boolean>>;
  searchOpen: boolean;
  workspaces: WorkspaceItem[];
  sessionQuery: string;
  setSessionQuery: Dispatch<SetStateAction<string>>;
  setSearchOpen: Dispatch<SetStateAction<boolean>>;
  authEvent?: AuthUiEvent;
  setAuthEvent: Dispatch<SetStateAction<AuthUiEvent | undefined>>;
  previewImage?: PreviewImage;
  setPreviewImage: Dispatch<SetStateAction<PreviewImage | undefined>>;
  toast?: { message: string; type: "info" | "error" };
}

export function AppOverlays(props: AppOverlaysProps) {
  const { t } = useI18n();
  const {
    annotationSelection, copyAnnotationSelection, addSelectionAnnotation, annotationCommentEditor,
    annotationCommentInputRef, annotationCommentDraft, setAnnotationCommentDraft,
    setAnnotationCommentEditor, saveAnnotationComment, annotationMarkers, sessionMenu,
    sessionMenuItem, setSessionMenu, beginSessionRename, toggleSessionPinned, runningSessionIds,
    archiveSession, projectMenu, projectMenuItem, setProjectMenu, beginProjectRename,
    requestProjectRemoval, archiveNotice, setArchiveNotice, restoreSession, projectPendingRemoval,
    projectRemovalBusy, setProjectPendingRemoval, removeProject, settingsOpen, providers, model,
    availableModels, pinnedModelIds, permission, availableModes, colorScheme, profile,
    showReasoningProcess, sessions, setSettingsOpen, setProviders, setProvider, setModel,
    activeSession, workspace, activeCwd, startAgent, changePermission, changePinnedModelIds,
    changeColorScheme, setProfile, setShowReasoningProcess, authCancellationRef, setToast,
    openSession, commandOpen, availableCommands, runAvailableCommand, createNewThread,
    chooseWorkspace, showPreviewPanel, setCommandOpen, searchOpen, workspaces, sessionQuery,
    setSessionQuery, setSearchOpen, authEvent, setAuthEvent, previewImage, setPreviewImage, toast,
  } = props;
  return (
    <>
      {annotationSelection && (
        <div
          className="annotation-selection-toolbar"
          role="toolbar"
          aria-label={t("annotation.actions")}
          style={{ left: annotationSelection.left, top: annotationSelection.top }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button type="button" onClick={() => void copyAnnotationSelection()}>{t("annotation.copy")}</button>
          <button type="button" onClick={() => addSelectionAnnotation(false)}>{t("annotation.addToChat")}</button>
          <button type="button" onClick={() => addSelectionAnnotation(true)}>{t("annotation.moreDetails")}</button>
        </div>
      )}

      {annotationCommentEditor && (
        <div
          className="annotation-comment-editor"
          style={{
            left: Math.max(10, Math.min(window.innerWidth - 380, annotationCommentEditor.left)),
            top: annotationCommentEditor.top,
          }}
        >
          <input
            ref={annotationCommentInputRef}
            value={annotationCommentDraft}
            onChange={(event) => setAnnotationCommentDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                saveAnnotationComment();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setAnnotationCommentEditor(undefined);
                setAnnotationCommentDraft("");
              }
            }}
            placeholder={t("annotation.optionalComment")}
            aria-label={t("annotation.optionalComment")}
          />
          <button type="button" onClick={saveAnnotationComment}>{t("annotation.done")}</button>
        </div>
      )}

      {annotationMarkers.map((marker, index) => (
        <span
          className="annotation-marker"
          key={marker.id}
          style={{ left: marker.left, top: marker.top }}
          aria-hidden="true"
        >{index + 1}</span>
      ))}

      {sessionMenu && sessionMenuItem && (
        <>
          <div className="session-menu-backdrop" onPointerDown={() => setSessionMenu(undefined)} aria-hidden="true" />
          <div
            className="session-action-menu"
            role="menu"
            aria-label={t("session.actions", { title: sessionMenuItem.title })}
            style={{ left: sessionMenu.left, top: sessionMenu.top }}
          >
            <button type="button" role="menuitem" onClick={() => beginSessionRename(sessionMenuItem)}>
              <Pencil size={14} />
              <span>{t("session.rename")}</span>
            </button>
            <button type="button" role="menuitem" onClick={() => void toggleSessionPinned(sessionMenuItem)}>
              {sessionMenuItem.pinned ? <PinOff size={14} /> : <Pin size={14} />}
              <span>{t(sessionMenuItem.pinned ? "session.unpin" : "session.pin")}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setSessionMenu(undefined);
                void window.devinAgent.sessions.openInNewWindow?.(sessionMenuItem.id).catch((error) => {
                  setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
                });
              }}
            >
              <ExternalLink size={14} />
              <span>{t("session.openInNewWindow")}</span>
            </button>
            <div className="session-action-separator" />
            <button
              type="button"
              role="menuitem"
              disabled={runningSessionIds.has(sessionMenuItem.path)}
              onClick={() => {
                setSessionMenu(undefined);
                void archiveSession(sessionMenuItem);
              }}
            >
              <Archive size={14} />
              <span>{t("session.archive")}</span>
            </button>
          </div>
        </>
      )}

      {projectMenu && projectMenuItem && (
        <>
          <div className="session-menu-backdrop" onPointerDown={() => setProjectMenu(undefined)} aria-hidden="true" />
          <div
            className="session-action-menu project-action-menu"
            role="menu"
            aria-label={t("sidebar.projectActions", { project: projectMenuItem.name })}
            style={{ left: projectMenu.left, top: projectMenu.top }}
          >
            <button type="button" role="menuitem" onClick={() => beginProjectRename(projectMenuItem)}>
              <Pencil size={14} />
              <span>{t("sidebar.renameProject")}</span>
            </button>
            <div className="session-action-separator" />
            <button className="danger-menu-item" type="button" role="menuitem" onClick={() => requestProjectRemoval(projectMenuItem)}>
              <Trash2 size={14} />
              <span>{t("sidebar.removeProject")}</span>
            </button>
          </div>
        </>
      )}

      {archiveNotice && (
        <div className="archive-hint" role="status" aria-live="polite">
          <Archive size={14} />
          <span>{t("archive.hint", { title: archiveNotice.title })}</span>
          <button type="button" onClick={() => void restoreSession(archiveNotice)}><Undo2 size={13} />{t("archive.undo")}</button>
          <button type="button" className="archive-hint-close" onClick={() => setArchiveNotice(undefined)} aria-label={t("common.close")}><X size={13} /></button>
        </div>
      )}

      {projectPendingRemoval && (
        <ProjectRemovalDialog
          project={projectPendingRemoval}
          busy={projectRemovalBusy}
          onCancel={() => { if (!projectRemovalBusy) setProjectPendingRemoval(undefined); }}
          onConfirm={() => void removeProject()}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          providers={providers}
          model={model}
          models={availableModels}
          pinnedModelIds={pinnedModelIds}
          permission={permission}
          modes={availableModes}
          colorScheme={colorScheme}
          profile={profile}
          showReasoningProcess={showReasoningProcess}
          sessions={sessions}
          runningSessionIds={runningSessionIds}
          onClose={() => setSettingsOpen(false)}
          onRefresh={async () => setProviders(await window.devinAgent.auth.status())}
          onConnected={async (value) => {
            const nextProviders = await window.devinAgent.auth.status();
            const connected = nextProviders.find((item) => item.id === value);
            const nextModel = connected?.defaultModel ?? model;
            setProviders(nextProviders);
            setProvider(value);
            setModel(nextModel);
            if (!activeSession) return;
            await startAgent(
              activeCwd,
              activeSession,
              { provider: value, model: nextModel },
              workspace,
              { providerStatuses: nextProviders },
            );
          }}
          onPermission={(value) => void changePermission(value)}
          onPinnedModelIdsChange={(value) => void changePinnedModelIds(value)}
          onColorScheme={(preference) => void changeColorScheme(preference)}
          onProfile={async (nextProfile) => {
            await window.devinAgent.settings.setProfile(nextProfile);
            setProfile(nextProfile);
          }}
          onShowReasoningProcess={async (value) => {
            const previous = showReasoningProcess;
            setShowReasoningProcess(value);
            try {
              await window.devinAgent.settings.setShowReasoningProcess(value);
            } catch (error) {
              setShowReasoningProcess(previous);
              throw error;
            }
          }}
          onRestoreSession={restoreSession}
          onOpenSession={async (session) => {
            setSettingsOpen(false);
            await openSession(session);
          }}
          onAuthStart={() => { authCancellationRef.current = false; }}
          consumeAuthCancellation={() => {
            const cancelled = authCancellationRef.current;
            authCancellationRef.current = false;
            return cancelled;
          }}
          onToast={(message, type = "info") => setToast({ message, type })}
        />
      )}
      {commandOpen && <CommandPalette availableCommands={availableCommands} onRunCommand={(command) => void runAvailableCommand(command)} onClose={() => setCommandOpen(false)} onNew={() => void createNewThread()} onOpen={() => void chooseWorkspace()} onSettings={() => setSettingsOpen(true)} onInspector={showPreviewPanel} />}
      {searchOpen && (
        <SessionSearchDialog
          sessions={sessions}
          workspaces={workspaces}
          activeSession={activeSession}
          query={sessionQuery}
          onQuery={setSessionQuery}
          onClose={() => {
            setSearchOpen(false);
            setSessionQuery("");
          }}
          onOpen={(session) => void openSession(session)}
          onNew={() => void createNewThread()}
        />
      )}
      {authEvent?.kind === "prompt" && <AuthPromptDialog event={authEvent} onDone={() => setAuthEvent(undefined)} onCancel={() => { authCancellationRef.current = true; setAuthEvent(undefined); }} />}
      {authEvent?.kind === "notice" && <AuthNotice event={authEvent} onClose={() => setAuthEvent(undefined)} />}
      {previewImage && <ImageLightbox image={previewImage} onClose={() => setPreviewImage(undefined)} />}
      {toast && <div className={`toast ${toast.type}`}><span>{toast.type === "error" ? <CircleAlert size={16} /> : <Check size={16} />}{toast.message}</span><button onClick={() => setToast(undefined)}><X size={14} /></button></div>}
    </>
  );
}
