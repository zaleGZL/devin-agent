import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import type { MentionKind, MentionSearchResult, SkillMentionRef } from "../shared/mentions";
import type {
  AgentSnapshot,
  AgentSessionStats,
  AuthUiEvent,
  ColorSchemePreference,
  DesktopInteractionRequest,
  ExtensionUiRequest,
  PermissionMode,
  ProviderId,
  ProviderStatus,
  FilePreview,
  SandboxMode,
  SessionSummary,
  UserProfile,
  WorkspaceItem,
  WorkspaceChange,
  WorkspaceChanges,
  WorkspaceDiff,
  WeixinBotStatus,
} from "../shared/types";
import {
  applyAgentEvent,
  groupConversation,
  normalizeMessages,
  optimisticUserMessage,
  settleAssistantMessages,
  splitAssistantTurn,
  type ChatAnnotation,
  type ChatMessage,
} from "./lib/conversation";
import {
  formatPromptWithAnnotations,
  prepareAnnotationSelection,
  writeSelectionToClipboardEvent,
} from "./lib/annotations";
import { sameWorkspaceChanges } from "./lib/git-changes";
import { applyColorScheme } from "./lib/color-scheme";
import { useI18n } from "./lib/i18n";
import { isAgentSessionClosedError } from "./lib/errors";
import { isPreviewPathInWorkspace, previewPathsFromText } from "./lib/file-preview";
import { isImeCompositionKey } from "./lib/ime";
import {
  formatMarkdownPlanRevisionPrompt,
  formatPlanRevisionPrompt,
  planForNextTurn,
  type StructuredPlan,
} from "./lib/plan";
import { updateConversationTailFollowing } from "./lib/conversation-scroll";
import { normalizeAcpUpdate } from "./lib/acp-normalizer";
import { supportsImagePrompt } from "./lib/capabilities";
import { markdownExportFileName } from "../shared/markdown-export";
import { formatSessionMarkdown } from "./lib/session-export";
import {
  beginChainConversation,
  chainConversationKey,
  reduceChainConversation,
  settleChainConversation,
  type ChainConversationStore,
} from "./lib/chains";
import { resolveNewSessionModelId } from "./lib/model-picker";
import { resolvePreferredModeId } from "./lib/mode-selection";
import {
  findAtTrigger,
  insertMentionAtTrigger,
  mergeRootMentionOptions,
  rankSkillMentions,
  removePositionedMention,
  replaceDraftRange,
  type PositionedMention,
} from "./lib/mentions";
import type { InlineMentionEditorHandle } from "./lib/inline-mention-editor";
import { resolveNewTaskCwd } from "./lib/workspace-context";
import { partitionSidebarSessions } from "./lib/sidebar-sessions";
import { clearSessionUnread, markBackgroundSessionUnread } from "./lib/session-attention";
import { confirmSessionRename, optimisticSessionRename, rollbackSessionRename } from "./lib/session-rename";
import {
  enqueueFollowUp,
  restoreFollowUp,
  takeFollowUp,
  type FollowUpItem,
} from "./lib/follow-up";
import {
  compareSidebarSessions,
  moveByKey,
  orderedSessionIdsForGroup,
  reorderSessionsWithinGroup,
  type SidebarSessionGroupKey,
} from "./lib/sidebar-order";
import { getFeatureGate, type DevinCapabilities } from "../shared/capabilities";
import type { AvailableCommand, PlanState } from "../shared/conversation";
import { AppMainPane } from "./features/app/AppMainPane";
import { AppOverlays } from "./features/app/AppOverlays";
import type {
  Attachment,
  MentionMenuOption,
  PreviewImage,
  QueuedPrompt,
  SidebarDragSnapshot,
  SidebarDragState,
} from "./features/app/types";
import { AppSidebar } from "./features/sessions/AppSidebar";
import {
  cleanError,
  crop,
  fileToAttachment,
  isDesktopInteractionRequest,
  isSessionSummary,
  sortSidebarSessions,
  toolFilePath,
} from "./lib/app-helpers";

function nextMentionOptionIndex(options: readonly MentionMenuOption[], current: number, direction: 1 | -1): number {
  if (options.length === 0) return 0;
  for (let offset = 1; offset <= options.length; offset += 1) {
    const index = (current + direction * offset + options.length) % options.length;
    if (!options[index]?.disabled) return index;
  }
  return current;
}

interface AnnotationSelection {
  text: string;
  clipboardText: string;
  range: Range;
  left: number;
  top: number;
}

interface AnnotationCommentEditor {
  id: string;
  left: number;
  top: number;
}

interface AnnotationMarker {
  id: string;
  left: number;
  top: number;
}

const SESSION_MENU_WIDTH = 176;
const SESSION_MENU_HEIGHT = 160;
const PROJECT_MENU_WIDTH = 176;
const PROJECT_MENU_HEIGHT = 88;
const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
// ACP does not currently provide enough verified usage/cost data to make the
// Conversation context card accurate. Keep the implementation dormant until
// the runtime advertises a complete, stable data source.
const ENABLE_CONVERSATION_CONTEXT = false;
const DEFAULT_INSPECTOR_WIDTH = 460;
const MIN_INSPECTOR_WIDTH = 320;
const MAX_INSPECTOR_WIDTH = 880;
const MIN_CONVERSATION_WIDTH = 440;
const INSPECTOR_RESIZER_WIDTH = 7;
const WORKSPACE_CHANGES_POLL_INTERVAL_MS = 2_000;
const ANNOTATION_HIGHLIGHT_NAME = "devin-agent-response-annotations";

function replaceAnnotationHighlights(ranges: Range[]) {
  const css = CSS as typeof CSS & { highlights?: { delete(name: string): void; set(name: string, value: unknown): void } };
  const HighlightConstructor = (globalThis as typeof globalThis & { Highlight?: new (...values: Range[]) => unknown }).Highlight;
  css.highlights?.delete(ANNOTATION_HIGHLIGHT_NAME);
  if (ranges.length > 0 && HighlightConstructor) {
    css.highlights?.set(ANNOTATION_HIGHLIGHT_NAME, new HighlightConstructor(...ranges));
  }
}

function inspectorBoundsForLayout(layoutWidth: number) {
  const availableWidth = layoutWidth - MIN_CONVERSATION_WIDTH - INSPECTOR_RESIZER_WIDTH;
  return {
    min: MIN_INSPECTOR_WIDTH,
    max: Math.max(MIN_INSPECTOR_WIDTH, Math.min(MAX_INSPECTOR_WIDTH, availableWidth)),
  };
}

export default function App() {
  const { locale, t } = useI18n();
  const [workspace, setWorkspace] = useState<string>();
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(() => new Set());
  const [fullyExpandedProjects, setFullyExpandedProjects] = useState<Set<string>>(() => new Set());
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [activeSession, setActiveSessionState] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [provider, setProvider] = useState<ProviderId>("devin");
  const [colorScheme, setColorScheme] = useState<ColorSchemePreference>("system");
  const [profile, setProfile] = useState<UserProfile>({ nickname: "User" });
  const [showReasoningProcess, setShowReasoningProcess] = useState(false);
  const [model, setModel] = useState("");
  const [permission, setPermission] = useState<PermissionMode>("");
  const [sandbox] = useState<SandboxMode>("cli-managed");
  const [availableModels, setAvailableModels] = useState<AgentSnapshot["models"]>([]);
  const [pinnedModelIds, setPinnedModelIds] = useState<string[]>([]);
  const [availableModes, setAvailableModes] = useState<NonNullable<AgentSnapshot["modes"]>>([]);
  const [availableCommands, setAvailableCommands] = useState<AvailableCommand[]>([]);
  const [capabilities, setCapabilities] = useState<DevinCapabilities>();
  const [agentPlan, setAgentPlan] = useState<PlanState>();
  const [sessionLocked, setSessionLocked] = useState(false);
  const [sessionStats, setSessionStats] = useState<AgentSessionStats>();
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [draftAnnotations, setDraftAnnotations] = useState<ChatAnnotation[]>([]);
  const [draftMentions, setDraftMentions] = useState<PositionedMention[]>([]);
  const [mentionMenu, setMentionMenu] = useState<{ category?: MentionKind; activeIndex: number }>();
  const [mentionResults, setMentionResults] = useState<MentionSearchResult[]>([]);
  const [availableSkills, setAvailableSkills] = useState<SkillMentionRef[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionError, setMentionError] = useState<string>();
  const [annotationSelection, setAnnotationSelection] = useState<AnnotationSelection>();
  const [annotationCommentEditor, setAnnotationCommentEditor] = useState<AnnotationCommentEditor>();
  const [annotationCommentDraft, setAnnotationCommentDraft] = useState("");
  const [annotationMarkers, setAnnotationMarkers] = useState<AnnotationMarker[]>([]);
  const [previewImage, setPreviewImage] = useState<PreviewImage>();
  const [runningSessionIds, setRunningSessionIds] = useState<Set<string>>(() => new Set());
  const [followUpQueues, setFollowUpQueues] = useState<Map<string, FollowUpItem<QueuedPrompt>[]>>(() => new Map());
  const [unreadSessionIds, setUnreadSessionIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [permissionUpdating, setPermissionUpdating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [projectsSectionOpen, setProjectsSectionOpen] = useState(true);
  const [recentSectionOpen, setRecentSectionOpen] = useState(true);
  const [contextCardOpen, setContextCardOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorMode, setInspectorMode] = useState<"preview" | "changes">("preview");
  const [inspectorWidth, setInspectorWidth] = useState(DEFAULT_INSPECTOR_WIDTH);
  const [filePreview, setFilePreview] = useState<FilePreview>();
  const [recentPreviewFiles, setRecentPreviewFiles] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string>();
  const [workspaceChanges, setWorkspaceChanges] = useState<WorkspaceChanges>();
  const [selectedChange, setSelectedChange] = useState<WorkspaceChange>();
  const [workspaceDiff, setWorkspaceDiff] = useState<WorkspaceDiff>();
  const [changesLoading, setChangesLoading] = useState(false);
  const [changesError, setChangesError] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sessionQuery, setSessionQuery] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "info" | "error" }>();
  const [archiveNotice, setArchiveNotice] = useState<SessionSummary>();
  const [sessionMenu, setSessionMenu] = useState<{ sessionId: string; left: number; top: number }>();
  const [projectMenu, setProjectMenu] = useState<{ path: string; left: number; top: number }>();
  const [projectPendingRemoval, setProjectPendingRemoval] = useState<WorkspaceItem>();
  const [projectRemovalBusy, setProjectRemovalBusy] = useState(false);
  const [renamingProjectPath, setRenamingProjectPath] = useState<string>();
  const [projectRenameDraft, setProjectRenameDraft] = useState("");
  const [renamingSessionId, setRenamingSessionId] = useState<string>();
  const [sessionRenameDraft, setSessionRenameDraft] = useState("");
  const [sidebarDrag, setSidebarDrag] = useState<SidebarDragState>();
  const [uiRequest, setUiRequest] = useState<ExtensionUiRequest>();
  const [interactionRequests, setInteractionRequests] = useState<DesktopInteractionRequest[]>([]);
  const [chainConversations, setChainConversations] = useState<ChainConversationStore>({});
  const [sideChatOpen, setSideChatOpen] = useState(false);
  const [authEvent, setAuthEvent] = useState<AuthUiEvent>();
  const [activeView, setActiveView] = useState<"thread" | "weixin">("thread");
  const [weixinStatus, setWeixinStatus] = useState<WeixinBotStatus>();
  const authCancellationRef = useRef(false);
  const textareaRef = useRef<InlineMentionEditorHandle>(null);
  const composingRef = useRef(false);
  const mentionRequestRef = useRef(0);
  const skillRequestRef = useRef(0);
  const mentionBlurTimerRef = useRef<number | undefined>(undefined);
  const annotationCommentInputRef = useRef<HTMLInputElement>(null);
  const annotationRangesRef = useRef(new Map<string, Range>());
  const sessionRenameInputRef = useRef<HTMLInputElement>(null);
  const projectRenameInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followingConversationTailRef = useRef(true);
  const previousConversationScrollTopRef = useRef(0);
  const threadLayoutRef = useRef<HTMLDivElement>(null);
  const activeCwdRef = useRef<string | undefined>(undefined);
  const homeDirectoryRef = useRef<string | undefined>(undefined);
  const workspaceRef = useRef<string | undefined>(undefined);
  const previewRequestRef = useRef(0);
  const changesSnapshotRequestRef = useRef(0);
  const changesSnapshotInFlightRef = useRef(false);
  const changesDiffRequestRef = useRef(0);
  const inspectorResizeCleanupRef = useRef<() => void>(() => undefined);
  const activeSessionRef = useRef<string | undefined>(undefined);
  const launchSessionIdRef = useRef(new URLSearchParams(window.location.search).get("session") ?? undefined);
  const modelRef = useRef("");
  const availableModelsRef = useRef<AgentSnapshot["models"]>([]);
  const newSessionModelIdRef = useRef<string | null>(null);
  const preferredModeIdRef = useRef<PermissionMode | null>(null);
  const sessionMessagesRef = useRef(new Map<string, ChatMessage[]>());
  const sessionCommandsRef = useRef(new Map<string, AvailableCommand[]>());
  const runningSessionIdsRef = useRef(new Set<string>());
  const followUpQueuesRef = useRef(new Map<string, FollowUpItem<QueuedPrompt>[]>());
  const interruptingSessionIdsRef = useRef(new Set<string>());
  const drainingFollowUpSessionIdsRef = useRef(new Set<string>());
  const drainFollowUpQueueRef = useRef<(sessionId: string) => void>(() => undefined);
  const unreadSessionIdsRef = useRef(new Set<string>());
  const chainGenerationRef = useRef(1);
  const workspacesRef = useRef<WorkspaceItem[]>([]);
  const sessionsRef = useRef<SessionSummary[]>([]);
  const sidebarDragRef = useRef<SidebarDragSnapshot | undefined>(undefined);
  const running = activeSession ? runningSessionIds.has(activeSession) : false;
  const activeFollowUps = activeSession ? followUpQueues.get(activeSession) ?? [] : [];
  const sideChatCommand = availableCommands.find((command) => command.name.replace(/^\//, "").toLowerCase() === "btw");
  const sideChatEnabled = Boolean(capabilities && getFeatureGate({ ...capabilities, commands: availableCommands }, "chain-sidechat").enabled);
  const sideChatState = activeSession ? chainConversations[chainConversationKey(activeSession, "side")] : undefined;
  const mentionTrigger = findAtTrigger(draft, textareaRef.current?.getCaret() ?? draft.length, draftMentions);
  const mentionQuery = mentionTrigger?.query ?? "";
  const mentionOptions = useMemo<MentionMenuOption[]>(() => {
    const query = mentionQuery.toLocaleLowerCase();
    const skillOptions = rankSkillMentions(availableSkills, mentionQuery).map((mention) => ({
      id: mention.id,
      label: mention.label,
      detail: [
        mention.description,
        mention.source,
        mention.conflictingSources?.length
          ? t("mentions.skillConflict", { paths: mention.conflictingSources.join(", ") })
          : undefined,
      ].filter(Boolean).join(" · "),
      mention,
      disabled: Boolean(mention.conflictingSources?.length),
    } satisfies MentionMenuOption));
    const workspaceOptions = mentionResults.map((result) => ({
      id: `${result.kind}:${result.path}`,
      label: result.label,
      detail: result.detail,
      mention: {
        id: `${result.kind}:${result.path}`,
        kind: result.kind,
        path: result.path,
        label: result.label,
        ...(result.kind === "file" && result.size !== undefined ? { size: result.size } : {}),
        ...(result.kind === "file" && result.sensitive ? { sensitive: true } : {}),
      },
    } satisfies MentionMenuOption));
    if (!mentionMenu?.category && !query) {
      const workspaceDetail = workspace ? undefined : t("mentions.selectProjectFirst");
      return [
        { id: "category:file", label: t("mentions.files"), detail: workspaceDetail ?? t("mentions.filesDescription"), category: "file", disabled: !workspace },
        { id: "category:directory", label: t("mentions.directories"), detail: workspaceDetail ?? t("mentions.directoriesDescription"), category: "directory", disabled: !workspace },
        { id: "category:skill", label: t("mentions.skills"), detail: t("mentions.skillsDescription"), category: "skill" },
      ] satisfies MentionMenuOption[];
    }
    if (mentionMenu?.category === "skill") return skillOptions;
    if (!mentionMenu?.category) return mergeRootMentionOptions(skillOptions, workspaceOptions, 100);
    return workspaceOptions;
  }, [availableSkills, mentionMenu?.category, mentionQuery, mentionResults, t, workspace]);

  const clearDraftAnnotations = useCallback(() => {
    annotationRangesRef.current.clear();
    replaceAnnotationHighlights([]);
    setDraftAnnotations([]);
    setAnnotationSelection(undefined);
    setAnnotationCommentEditor(undefined);
    setAnnotationCommentDraft("");
    setAnnotationMarkers([]);
  }, []);

  useEffect(() => {
    if (!annotationCommentEditor) return;
    annotationCommentInputRef.current?.focus();
  }, [annotationCommentEditor]);

  useEffect(() => {
    const ranges = draftAnnotations.flatMap((annotation) => {
      const range = annotationRangesRef.current.get(annotation.id);
      return range ? [range] : [];
    });
    replaceAnnotationHighlights(ranges);
    return () => replaceAnnotationHighlights([]);
  }, [draftAnnotations]);

  useEffect(() => {
    const updateMarkers = () => {
      const markers = draftAnnotations.flatMap<AnnotationMarker>((annotation) => {
        const range = annotationRangesRef.current.get(annotation.id);
        const rects = range ? Array.from(range.getClientRects()) : [];
        const rect = rects.at(-1);
        if (!rect || rect.width === 0 || rect.height === 0) return [];
        return [{
          id: annotation.id,
          left: Math.min(window.innerWidth - 24, rect.right + 6),
          top: Math.max(8, rect.top + rect.height / 2 - 10),
        }];
      });
      setAnnotationMarkers(markers);
    };
    updateMarkers();
    const scroller = scrollRef.current;
    scroller?.addEventListener("scroll", updateMarkers, { passive: true });
    window.addEventListener("resize", updateMarkers);
    return () => {
      scroller?.removeEventListener("scroll", updateMarkers);
      window.removeEventListener("resize", updateMarkers);
    };
  }, [draftAnnotations]);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  useEffect(() => {
    availableModelsRef.current = availableModels;
  }, [availableModels]);

  useEffect(() => {
    const rootQuery = !mentionMenu?.category && Boolean(mentionTrigger?.query);
    if (!mentionMenu || mentionMenu.category === "skill" || (!mentionMenu.category && !rootQuery) || !workspace || !mentionTrigger) {
      setMentionLoading(false);
      setMentionResults([]);
      setMentionError(undefined);
      return;
    }
    const requestId = ++mentionRequestRef.current;
    setMentionLoading(true);
    setMentionError(undefined);
    const timer = window.setTimeout(() => {
      const kind = mentionMenu.category === "file" || mentionMenu.category === "directory"
        ? mentionMenu.category
        : "all";
      void window.devinAgent.mentions.search({
        workspacePath: workspace,
        kind,
        query: mentionTrigger.query,
        limit: 100,
      }).then((results) => {
        if (requestId !== mentionRequestRef.current) return;
        setMentionResults(results);
      }).catch((error) => {
        if (requestId !== mentionRequestRef.current) return;
        setMentionResults([]);
        setMentionError(cleanError(error instanceof Error ? error.message : String(error)));
      }).finally(() => {
        if (requestId === mentionRequestRef.current) setMentionLoading(false);
      });
    }, 120);
    return () => {
      window.clearTimeout(timer);
      mentionRequestRef.current += 1;
    };
  }, [mentionMenu?.category, mentionTrigger?.query, workspace]);

  useEffect(() => {
    setMentionMenu(undefined);
    mentionRequestRef.current += 1;
    const requestId = ++skillRequestRef.current;
    void window.devinAgent.mentions.setWorkspace(workspace)
      .then(() => window.devinAgent.mentions.skills({
        ...(workspace ? { workspacePath: workspace } : {}),
        ...(activeSession ? { sessionId: activeSession } : {}),
      }))
      .then((skills) => {
        if (requestId === skillRequestRef.current) setAvailableSkills(skills);
      })
      .catch((error) => {
        if (requestId !== skillRequestRef.current) return;
        setAvailableSkills([]);
        setMentionError(cleanError(error instanceof Error ? error.message : String(error)));
      });
  }, [activeSession, workspace]);

  useEffect(() => {
    if (!mentionMenu) return;
    const active = mentionOptions[mentionMenu.activeIndex];
    if (active && !active.disabled) return;
    const nextIndex = mentionOptions.findIndex((option) => !option.disabled);
    const normalizedIndex = Math.max(0, nextIndex);
    if (mentionMenu.activeIndex === normalizedIndex) return;
    setMentionMenu((current) => current ? { ...current, activeIndex: normalizedIndex } : current);
  }, [mentionMenu?.activeIndex, mentionMenu?.category, mentionOptions]);

  useEffect(() => {
    workspacesRef.current = workspaces;
  }, [workspaces]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    if (!renamingSessionId) return;
    sessionRenameInputRef.current?.focus();
    sessionRenameInputRef.current?.select();
  }, [renamingSessionId]);

  useEffect(() => {
    if (!renamingProjectPath) return;
    projectRenameInputRef.current?.focus();
    projectRenameInputRef.current?.select();
  }, [renamingProjectPath]);

  const setSessionUnread = useCallback((sessionId: string | undefined, unread: boolean) => {
    const current = unreadSessionIdsRef.current;
    const next = unread
      ? markBackgroundSessionUnread(current, sessionId, activeSessionRef.current)
      : clearSessionUnread(current, sessionId);
    if (next === current) return;
    unreadSessionIdsRef.current = next;
    setUnreadSessionIds(next);
  }, []);

  const selectActiveSession = useCallback((sessionId?: string) => {
    if (sessionId !== activeSessionRef.current) {
      followingConversationTailRef.current = true;
      previousConversationScrollTopRef.current = 0;
    }
    setSessionUnread(sessionId, false);
    activeSessionRef.current = sessionId;
    setActiveSessionState(sessionId);
    setAvailableCommands(sessionId ? sessionCommandsRef.current.get(sessionId) ?? [] : []);
    setMentionMenu(undefined);
  }, [setSessionUnread]);

  const markSessionRunning = useCallback((sessionId: string | undefined, value: boolean) => {
    if (!sessionId) return;
    const next = new Set(runningSessionIdsRef.current);
    if (value) next.add(sessionId);
    else next.delete(sessionId);
    runningSessionIdsRef.current = next;
    setRunningSessionIds(next);
  }, []);

  const setFollowUpQueue = useCallback((sessionId: string, update: (queue: FollowUpItem<QueuedPrompt>[]) => FollowUpItem<QueuedPrompt>[]) => {
    const nextQueue = update(followUpQueuesRef.current.get(sessionId) ?? []);
    const nextQueues = new Map(followUpQueuesRef.current);
    if (nextQueue.length > 0) nextQueues.set(sessionId, nextQueue);
    else nextQueues.delete(sessionId);
    followUpQueuesRef.current = nextQueues;
    setFollowUpQueues(nextQueues);
  }, []);

  const updateSessionMessages = useCallback((sessionId: string, update: (messages: ChatMessage[]) => ChatMessage[]) => {
    if (sessionId === activeSessionRef.current) {
      setMessages((current) => {
        const next = update(current);
        sessionMessagesRef.current.set(sessionId, next);
        return next;
      });
      return;
    }
    const current = sessionMessagesRef.current.get(sessionId) ?? [];
    sessionMessagesRef.current.set(sessionId, update(current));
  }, []);

  const hydrateSnapshot = useCallback((snapshot: AgentSnapshot) => {
    if (snapshot.messages.length > 0) {
      const normalized = normalizeMessages(snapshot.messages);
      if (snapshot.sessionId) sessionMessagesRef.current.set(snapshot.sessionId, normalized);
      if (!snapshot.sessionId || snapshot.sessionId === activeSessionRef.current) setMessages(normalized);
    }
    setAvailableModels(snapshot.models);
    setAvailableModes(snapshot.modes ?? []);
    setCapabilities(snapshot.capabilities);
    setSessionLocked(snapshot.locked === true);
    if (ENABLE_CONVERSATION_CONTEXT) setSessionStats(snapshot.stats);
    const stateModel = snapshot.state.model as { provider?: string; id?: string } | undefined;
    if (stateModel?.provider) setProvider(stateModel.provider as ProviderId);
    if (stateModel?.id) setModel(stateModel.id);
    if (typeof snapshot.state.modeId === "string") setPermission(snapshot.state.modeId);
  }, []);

  const applyPreferredModeToSnapshot = useCallback(async (
    snapshot: AgentSnapshot,
    preferredModeId: PermissionMode | null = preferredModeIdRef.current,
  ): Promise<AgentSnapshot> => {
    const modes = snapshot.modes ?? [];
    const currentModeId = typeof snapshot.state.modeId === "string" ? snapshot.state.modeId : undefined;
    const resolvedModeId = resolvePreferredModeId(preferredModeId, modes, currentModeId);
    if (
      snapshot.locked === true
      || !snapshot.sessionId
      || !resolvedModeId
      || resolvedModeId === currentModeId
      || !modes.some((mode) => mode.id === resolvedModeId)
    ) return snapshot;
    try {
      await window.devinAgent.agent.command("set_mode", { sessionId: snapshot.sessionId, modeId: resolvedModeId });
      return { ...snapshot, state: { ...snapshot.state, modeId: resolvedModeId } };
    } catch (error) {
      if (!isAgentSessionClosedError(error)) {
        setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
      }
      return snapshot;
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    const items = await window.devinAgent.sessions.list();
    setSessions(items);
    setActiveSessionState((current) => {
      const firstVisible = items.find((session) => !session.archived);
      if (current || !firstVisible) return current;
      activeCwdRef.current = firstVisible.cwd;
      activeSessionRef.current = firstVisible.path;
      return firstVisible.path;
    });
  }, []);

  const refreshSessionStats = useCallback(async () => {
    if (!ENABLE_CONVERSATION_CONTEXT) return;
    try {
      setSessionStats(await window.devinAgent.agent.command<AgentSessionStats>("get_session_stats"));
    } catch (error) {
      if (!isAgentSessionClosedError(error)) console.warn("Unable to refresh session statistics", error);
    }
  }, []);

  const openFilePreview = useCallback(async (filePath: string) => {
    const requestId = ++previewRequestRef.current;
    setContextCardOpen(false);
    setInspectorMode("preview");
    setInspectorOpen(true);
    setPreviewLoading(true);
    setPreviewError(undefined);
    try {
      const filesApi = window.devinAgent.files;
      if (!filesApi) throw new Error(t("preview.restartRequired"));
      const nextPreview = await filesApi.preview(filePath);
      if (requestId === previewRequestRef.current) setFilePreview(nextPreview);
    } catch (error) {
      if (requestId === previewRequestRef.current) {
        const message = cleanError(error instanceof Error ? error.message : String(error));
        setPreviewError(/\bENOENT\b|no such file or directory/i.test(message)
          ? t("preview.fileMissing", { path: filePath })
          : message);
      }
    } finally {
      if (requestId === previewRequestRef.current) setPreviewLoading(false);
    }
  }, [t]);

  const choosePreviewFile = useCallback(async () => {
    const requestId = ++previewRequestRef.current;
    setContextCardOpen(false);
    setInspectorMode("preview");
    setInspectorOpen(true);
    setPreviewLoading(true);
    setPreviewError(undefined);
    try {
      const filesApi = window.devinAgent.files;
      if (!filesApi) throw new Error(t("preview.restartRequired"));
      const nextPreview = await filesApi.choosePreview();
      if (requestId === previewRequestRef.current && nextPreview) setFilePreview(nextPreview);
    } catch (error) {
      if (requestId === previewRequestRef.current) {
        setPreviewError(cleanError(error instanceof Error ? error.message : String(error)));
      }
    } finally {
      if (requestId === previewRequestRef.current) setPreviewLoading(false);
    }
  }, [t]);

  const refreshWorkspaceChanges = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background === true;
    const projectPath = workspaceRef.current;
    if (!projectPath) {
      setWorkspaceChanges(undefined);
      setSelectedChange(undefined);
      setWorkspaceDiff(undefined);
      return;
    }
    if (background && changesSnapshotInFlightRef.current) return;
    const requestId = ++changesSnapshotRequestRef.current;
    changesSnapshotInFlightRef.current = true;
    if (!background) {
      setChangesLoading(true);
      setChangesError(undefined);
    }
    try {
      const snapshot = await window.devinAgent.workspace.changes(projectPath);
      if (requestId !== changesSnapshotRequestRef.current) return;
      setWorkspaceChanges((current) => sameWorkspaceChanges(current, snapshot) ? current : snapshot);
      setChangesError(undefined);
      setSelectedChange((current) => {
        if (!current || snapshot.changes.some((change) => change.path === current.path)) return current;
        changesDiffRequestRef.current += 1;
        setWorkspaceDiff(undefined);
        return undefined;
      });
    } catch (error) {
      if (!background && requestId === changesSnapshotRequestRef.current) {
        setChangesError(cleanError(error instanceof Error ? error.message : String(error)));
      }
    } finally {
      if (requestId === changesSnapshotRequestRef.current) {
        changesSnapshotInFlightRef.current = false;
        if (!background) setChangesLoading(false);
      }
    }
  }, []);

  const openWorkspaceDiff = useCallback(async (change: WorkspaceChange) => {
    const projectPath = workspaceRef.current;
    if (!projectPath) return;
    const requestId = ++changesDiffRequestRef.current;
    setSelectedChange(change);
    setWorkspaceDiff(undefined);
    setChangesLoading(true);
    setChangesError(undefined);
    try {
      const diff = await window.devinAgent.workspace.diff(projectPath, change.path);
      if (requestId === changesDiffRequestRef.current) setWorkspaceDiff(diff);
    } catch (error) {
      if (requestId === changesDiffRequestRef.current) {
        setChangesError(cleanError(error instanceof Error ? error.message : String(error)));
      }
    } finally {
      if (requestId === changesDiffRequestRef.current) setChangesLoading(false);
    }
  }, []);

  useEffect(() => {
    changesSnapshotRequestRef.current += 1;
    changesSnapshotInFlightRef.current = false;
    changesDiffRequestRef.current += 1;
    setWorkspaceChanges(undefined);
    setSelectedChange(undefined);
    setWorkspaceDiff(undefined);
    setChangesError(undefined);
    setChangesLoading(false);
  }, [workspace]);

  useEffect(() => {
    if (!workspace) return;
    // Keep the toolbar branch and badge current even while the Changes inspector is closed.
    // Identical snapshots are discarded by sameWorkspaceChanges, so polling does
    // not repaint the inspector or interrupt an in-flight diff request.
    const refreshInBackground = () => void refreshWorkspaceChanges({ background: true });
    refreshInBackground();
    const timer = window.setInterval(
      refreshInBackground,
      WORKSPACE_CHANGES_POLL_INTERVAL_MS,
    );
    window.addEventListener("focus", refreshInBackground);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshInBackground);
    };
  }, [refreshWorkspaceChanges, workspace]);

  const startAgent = useCallback(async (
    cwd?: string,
    sessionPath?: string,
    overrides?: { provider?: ProviderId; model?: string; effort?: string; permission?: PermissionMode; sandbox?: SandboxMode },
    projectPath?: string,
    behavior?: { background?: boolean; providerStatuses?: ProviderStatus[]; replaySession?: boolean },
  ) => {
    const background = behavior?.background === true;
    const nextProvider = overrides?.provider ?? provider;
    const requestedNewSessionModel = sessionPath ? undefined : overrides?.model;
    const providerStatuses = behavior?.providerStatuses ?? providers;
    const status = providerStatuses.find((candidate) => candidate.id === nextProvider);
    selectActiveSession(sessionPath);
    activeCwdRef.current = cwd;
    workspaceRef.current = projectPath;
    setWorkspace(projectPath);
    if (!background) {
      followingConversationTailRef.current = true;
      previousConversationScrollTopRef.current = 0;
      previewRequestRef.current += 1;
      setFilePreview(undefined);
      setPreviewError(undefined);
      setPreviewLoading(false);
    }
    if (providerStatuses.length && !status?.configured) {
      setSettingsOpen(true);
      setToast({ message: t("status.connectProvider", { provider: status?.name ?? nextProvider }), type: "error" });
      return undefined;
    }
    if (!background) setLoading(true);
    if (!background) setSessionStats(undefined);
    try {
      const snapshot = await window.devinAgent.agent.start({
        ...(cwd ? { cwd } : {}),
        project: Boolean(projectPath),
        provider: nextProvider,
        ...(requestedNewSessionModel ? { model: requestedNewSessionModel } : {}),
        permission: overrides?.permission ?? permission,
        sandbox: overrides?.sandbox ?? sandbox,
        ...(sessionPath ? { sessionPath } : {}),
        ...(sessionPath && behavior?.replaySession ? { replaySession: true } : {}),
      });
      const resolvedSnapshot = await applyPreferredModeToSnapshot(
        snapshot,
        overrides?.permission ?? preferredModeIdRef.current,
      );
      const nextSessionId = resolvedSnapshot.sessionId ?? sessionPath;
      selectActiveSession(nextSessionId);
      hydrateSnapshot(resolvedSnapshot);
      markSessionRunning(nextSessionId, Boolean(resolvedSnapshot.state.isStreaming));
      await refreshSessions();
      return nextSessionId;
    } catch (error) {
      if (isAgentSessionClosedError(error)) return undefined;
      const message = error instanceof Error ? error.message : String(error);
      if (!background) setMessages([]);
      setToast({ message: cleanError(message), type: "error" });
      if (/not configured|credential|login|api key/i.test(message)) setSettingsOpen(true);
      return undefined;
    } finally {
      if (!background) setLoading(false);
    }
  }, [applyPreferredModeToSnapshot, hydrateSnapshot, markSessionRunning, permission, provider, providers, refreshSessions, sandbox, selectActiveSession, t]);

  const discoverNewTaskCapabilities = useCallback((
    cwd: string,
    projectPath: string | undefined,
    providerId: ProviderId,
    preferredModelId?: string,
  ) => window.devinAgent.agent.start({
    cwd,
    project: Boolean(projectPath),
    provider: providerId,
    ...(preferredModelId ? { model: preferredModelId } : {}),
    permission: "runtime",
    sandbox: "cli-managed",
    capabilitiesOnly: true,
  }), []);

  const hydrateNewTaskCapabilities = useCallback((snapshot: AgentSnapshot, preferredModelId?: string) => {
    hydrateSnapshot(snapshot);
    const stateModel = snapshot.state.model as { id?: string } | undefined;
    setModel(resolveNewSessionModelId(preferredModelId, snapshot.models, stateModel?.id));
    const stateModeId = typeof snapshot.state.modeId === "string" ? snapshot.state.modeId : undefined;
    setPermission(resolvePreferredModeId(preferredModeIdRef.current, snapshot.modes ?? [], stateModeId));
  }, [hydrateSnapshot]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [recentItems, allSessions, providerItems, storedColorScheme, storedProfile, storedShowReasoningProcess, storedPinnedModelIds, storedNewSessionModelId, storedPreferredModeId, homeDirectory] = await Promise.all([
        window.devinAgent.workspace.recent(),
        window.devinAgent.sessions.list(),
        window.devinAgent.auth.status(),
        window.devinAgent.settings.getColorScheme(),
        window.devinAgent.settings.getProfile(),
        window.devinAgent.settings.getShowReasoningProcess(),
        window.devinAgent.settings.getPinnedModelIds(),
        window.devinAgent.settings.getNewSessionModelId(),
        window.devinAgent.settings.getPreferredModeId(),
        window.devinAgent.app.homeDirectory(),
      ]);
      if (cancelled) return;
      setWorkspaces(recentItems);
      setSessions(allSessions);
      setProviders(providerItems);
      setColorScheme(storedColorScheme);
      setProfile(storedProfile);
      setShowReasoningProcess(storedShowReasoningProcess);
      setPinnedModelIds(storedPinnedModelIds);
      newSessionModelIdRef.current = storedNewSessionModelId;
      preferredModeIdRef.current = storedPreferredModeId;
      applyColorScheme(storedColorScheme);
      const configured = providerItems.find((item) => item.id === "devin" && item.configured)
        ?? providerItems.find((item) => item.configured);
      const initialModelId = storedNewSessionModelId ?? configured?.defaultModel;
      if (configured) {
        setProvider(configured.id);
        if (initialModelId) setModel(initialModelId);
      }
      const launchSessionId = launchSessionIdRef.current;
      // Only auto-open a specific session when launched via a deep link
      // (e.g. ?session=<id>). On normal startup, default to the new-task
      // page instead of reopening the most recent session.
      const selectedSession = launchSessionId
        ? allSessions.find((session) => session.id === launchSessionId)
        : undefined;
      const selectedProject = selectedSession
        ? recentItems.find((item) => item.path === selectedSession.cwd)
        : recentItems[0];
      homeDirectoryRef.current = homeDirectory;
      activeCwdRef.current = selectedSession?.cwd ?? selectedProject?.path ?? homeDirectory;
      workspaceRef.current = selectedProject?.path;
      setWorkspace(selectedProject?.path);
      if (selectedProject) setExpandedProjects(new Set([selectedProject.path]));
      selectActiveSession(selectedSession?.path);
      setSessionLocked(selectedSession?.locked === true);
      if (configured && selectedSession) {
        try {
          const snapshot = await window.devinAgent.agent.start({
            cwd: selectedSession.cwd,
            sessionPath: selectedSession.path,
            replaySession: true,
            project: Boolean(selectedProject),
            provider: configured.id,
            ...(configured.defaultModel ? { model: configured.defaultModel } : {}),
            permission: "runtime",
            sandbox: "cli-managed",
          });
          const resolvedSnapshot = await applyPreferredModeToSnapshot(snapshot, storedPreferredModeId);
          if (!cancelled) hydrateSnapshot(resolvedSnapshot);
        } catch (error) {
          if (!cancelled && !isAgentSessionClosedError(error)) {
            setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
          }
        }
      } else if (configured) {
        try {
          const snapshot = await discoverNewTaskCapabilities(
            activeCwdRef.current,
            selectedProject?.path,
            configured.id,
            initialModelId,
          );
          if (!cancelled) hydrateNewTaskCapabilities(snapshot, initialModelId);
        } catch (error) {
          if (!cancelled && !isAgentSessionClosedError(error)) {
            setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
          }
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyPreferredModeToSnapshot, discoverNewTaskCapabilities, hydrateNewTaskCapabilities, hydrateSnapshot, selectActiveSession]);

  useEffect(() => {
    const offEvent = window.devinAgent.agent.onEvent((event) => {
      const eventSessionId = typeof event.sessionId === "string" ? event.sessionId : undefined;
      if (event.type === "agent_start") {
        markSessionRunning(eventSessionId, true);
        // The main process persists the first prompt title before emitting this
        // event. Refresh immediately so a project task and its running marker
        // appear while the turn is active, not only after it settles.
        void refreshSessions();
      }
      if (event.type === "agent_settled") {
        markSessionRunning(eventSessionId, false);
        setSessionUnread(eventSessionId, true);
        if (eventSessionId) updateSessionMessages(eventSessionId, settleAssistantMessages);
        if (!eventSessionId || eventSessionId === activeSessionRef.current) setUiRequest(undefined);
        void refreshSessions();
        if (!eventSessionId || eventSessionId === activeSessionRef.current) void refreshSessionStats();
        if (
          eventSessionId
          && !interruptingSessionIdsRef.current.has(eventSessionId)
          && !drainingFollowUpSessionIdsRef.current.has(eventSessionId)
        ) {
          queueMicrotask(() => drainFollowUpQueueRef.current(eventSessionId));
        }
        return;
      }
      if (event.type === "extension_ui_request") {
        const request = event as ExtensionUiRequest;
        if (request.method === "notify") {
          setToast({ message: request.message ?? t("app.notification"), type: request.notifyType === "error" ? "error" : "info" });
        } else if (["select", "confirm", "input", "editor"].includes(request.method)) {
          setUiRequest(request);
        }
      }
      if (event.type === "interaction_request" && isDesktopInteractionRequest(event.request)) {
        const interaction = event.request;
        setInteractionRequests((current) => {
          const existing = current.findIndex((request) => request.id === interaction.id);
          return existing < 0
            ? [...current, interaction]
            : current.map((request, index) => index === existing ? interaction : request);
        });
        return;
      }
      if (event.type === "interaction_closed" && typeof event.id === "string") {
        setInteractionRequests((current) => current.filter((request) => request.id !== event.id));
        return;
      }
      if (event.type === "session_renamed" && isSessionSummary(event.session)) {
        const renamed = event.session;
        setSessions((current) => current.map((session) => session.id === renamed.id ? renamed : session));
        return;
      }
      if (event.type === "permission_request" && typeof event.id === "string") {
        const permissionOptions = Array.isArray(event.options)
          ? event.options.flatMap((option) => {
            if (!option || typeof option !== "object") return [];
            const value = option as Record<string, unknown>;
            const id = typeof value.id === "string" ? value.id : "";
            return id ? [{ id, label: typeof value.label === "string" ? value.label : id, description: typeof value.description === "string" ? value.description : undefined }] : [];
          })
          : [];
        setUiRequest({
          type: "extension_ui_request",
          id: event.id,
          method: "select",
          title: typeof event.title === "string" ? event.title : "Devin permission",
          message: typeof event.message === "string" ? event.message : "Choose an action",
          options: permissionOptions.map((option) => option.id),
          optionLabels: Object.fromEntries(permissionOptions.map((option) => [option.id, option.label])),
          optionDescriptions: Object.fromEntries(permissionOptions.flatMap((option) => option.description ? [[option.id, option.description]] : [])),
          request: event.request,
        });
        return;
      }
      if (event.type === "agent_start") return;
      if (event.type === "connection_generation") {
        chainGenerationRef.current += 1;
        setChainConversations({});
        setInteractionRequests([]);
        return;
      }
      if (event.type === "agent_state") {
        if (event.state === "error" || event.state === "auth-required" || event.state === "stopping" || event.state === "closed") {
          chainGenerationRef.current += 1;
          setChainConversations({});
          setInteractionRequests([]);
        }
        if (event.state === "error" || event.state === "auth-required") {
          runningSessionIdsRef.current = new Set();
          setRunningSessionIds(new Set());
          setToast({
            message: typeof event.error === "string"
              ? cleanError(event.error)
              : event.state === "auth-required"
                ? "Devin authentication is required. Open Settings to continue."
                : "The Devin ACP process stopped. Reconnect from Settings.",
            type: "error",
          });
        }
        return;
      }
      if (event.type === "agent_diagnostic") {
        console.warn("Devin ACP diagnostic", event.diagnostic);
        return;
      }
      if (event.type !== "acp_update") return;
      const normalized = normalizeAcpUpdate(event, typeof event.sessionId === "string" ? event.sessionId : "unknown-session");
      const normalizedSessionId = normalized.sessionId || eventSessionId;
      const isActiveUpdate = !normalizedSessionId || normalizedSessionId === activeSessionRef.current;
      if (normalized.chainId) {
        setChainConversations((current) => reduceChainConversation(current, normalized, chainGenerationRef.current));
        return;
      }
      if (normalized.type === "commands") {
        if (normalizedSessionId) sessionCommandsRef.current.set(normalizedSessionId, normalized.commands);
        if (isActiveUpdate) setAvailableCommands(normalized.commands);
      }
      if (normalized.type === "mode" && isActiveUpdate) setPermission(normalized.modeId);
      if ((normalized.type === "config" || normalized.type === "config_options") && isActiveUpdate) {
        const updatedOptions = normalized.type === "config_options" ? normalized.options : [normalized.option];
        const modelOption = updatedOptions.find((option) => option.id === "model" || option.category === "model");
        const modeOption = updatedOptions.find((option) => option.id === "mode" || option.category === "mode");
        setCapabilities((current) => current ? {
          ...current,
          configOptions: normalized.type === "config_options"
            ? updatedOptions
            : [...current.configOptions.filter((option) => option.id !== updatedOptions[0]?.id), ...updatedOptions],
          ...(modelOption?.options
            ? { models: modelOption.options.map((option) => ({ id: option.value, name: option.name, description: option.description, supportsImages: option.supportsImages, supportsAudio: option.supportsAudio, contextWindow: option.contextWindow, raw: option.raw })) }
            : {}),
        } : current);
        if (modelOption?.options) {
          setAvailableModels(modelOption.options.map((option) => ({ provider: "devin", id: option.value, name: option.name, description: option.description, supportsImages: option.supportsImages === true, contextWindow: option.contextWindow, reasoning: true })));
          if (typeof modelOption.currentValue === "string") setModel(modelOption.currentValue);
        }
        if (modeOption?.options) {
          setAvailableModes(modeOption.options.map((option) => ({ id: option.value, name: option.name, description: option.description })));
        }
        if (modeOption && typeof modeOption.currentValue === "string") setPermission(modeOption.currentValue);
      }
      if (normalized.type === "plan" && isActiveUpdate) setAgentPlan(normalized.plan);
      if (normalized.type === "session_info") {
        if (isActiveUpdate && typeof normalized.locked === "boolean") setSessionLocked(normalized.locked);
        setSessions((current) => current.map((session) => session.id === normalized.sessionId ? {
          ...session,
          ...(normalized.title && !session.customTitle ? { title: normalized.title } : {}),
          ...(normalized.cwd ? { cwd: normalized.cwd } : {}),
          ...(typeof normalized.locked === "boolean" ? { locked: normalized.locked } : {}),
          ...(normalized.updatedAt ? { updatedAt: new Date(normalized.updatedAt).toISOString() } : {}),
        } : session));
      }
      if (normalized.type === "unknown") console.warn("Unknown Devin ACP update", normalized.kind, normalized.diagnostic);
      if (normalizedSessionId && ["message_chunk", "thought_chunk", "tool_start", "tool_update", "tool_end"].includes(normalized.type)) {
        updateSessionMessages(normalizedSessionId, (current) => applyAgentEvent(current, normalized));
      }
    });
    const offError = window.devinAgent.agent.onError((message) => {
      if (isAgentSessionClosedError(message)) return;
      runningSessionIdsRef.current = new Set();
      setRunningSessionIds(new Set());
      setUiRequest(undefined);
      setInteractionRequests([]);
      setToast({ message: cleanError(message), type: "error" });
    });
    const offAuth = window.devinAgent.auth.onEvent((event) => {
      setAuthEvent(event);
      if (event.kind === "complete") {
        void window.devinAgent.auth.status().then(setProviders);
        setProvider(event.providerId);
        if (event.modelId) setModel(event.modelId);
        setToast({ message: t("auth.accountConnected"), type: "info" });
      }
    });
    const offCommand = window.devinAgent.onAppCommand?.((command) => {
      if (command === "new-thread") void createNewThread();
      if (command === "open-folder") void chooseWorkspace();
    });
    return () => {
      offEvent();
      offError();
      offAuth();
      offCommand?.();
    };
  }, [markSessionRunning, refreshSessionStats, refreshSessions, setSessionUnread, t, updateSessionMessages]);

  useEffect(() => {
    void window.devinAgent.weixin.getStatus().then(setWeixinStatus).catch(() => undefined);
    return window.devinAgent.weixin.onEvent((event) => {
      if (event.type === "status") setWeixinStatus(event.status);
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && sessionMenu) {
        event.preventDefault();
        setSessionMenu(undefined);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
      }
      if (event.key === "Escape" && !searchOpen && running) void stopAgent();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [running, searchOpen, sessionMenu]);

  useEffect(() => {
    if (!activeSession || loading) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    followingConversationTailRef.current = true;
    previousConversationScrollTopRef.current = 0;
    const frame = window.requestAnimationFrame(() => {
      scroller.scrollTop = scroller.scrollHeight;
      previousConversationScrollTopRef.current = scroller.scrollTop;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeSession, loading]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !followingConversationTailRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (!followingConversationTailRef.current) return;
      scroller.scrollTop = scroller.scrollHeight;
      previousConversationScrollTopRef.current = scroller.scrollTop;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [interactionRequests, messages, running, uiRequest]);

  useEffect(() => {
    const scroller = scrollRef.current;
    const content = scroller?.querySelector(".messages");
    if (!scroller || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!followingConversationTailRef.current) return;
      window.requestAnimationFrame(() => {
        if (!followingConversationTailRef.current) return;
        scroller.scrollTop = scroller.scrollHeight;
        previousConversationScrollTopRef.current = scroller.scrollTop;
      });
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [activeSession, loading]);

  const handleConversationScroll = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const scrollTop = scroller.scrollTop;
    followingConversationTailRef.current = updateConversationTailFollowing(
      followingConversationTailRef.current,
      previousConversationScrollTopRef.current,
      {
        scrollTop,
        scrollHeight: scroller.scrollHeight,
        clientHeight: scroller.clientHeight,
      },
    );
    previousConversationScrollTopRef.current = scrollTop;
  }, []);

  const handleConversationWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (event.deltaY < 0) followingConversationTailRef.current = false;
  }, []);

  const captureAnnotationSelection = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      setAnnotationSelection(undefined);
      return;
    }
    const range = selection.getRangeAt(0);
    const elementForNode = (node: Node) => node.nodeType === Node.ELEMENT_NODE
      ? node as Element
      : node.parentElement;
    const startSource = elementForNode(range.startContainer)?.closest<HTMLElement>("[data-annotation-source]");
    const endSource = elementForNode(range.endContainer)?.closest<HTMLElement>("[data-annotation-source]");
    const preparedSelection = prepareAnnotationSelection(selection.toString());
    if (!startSource || startSource !== endSource || !preparedSelection.annotationText) {
      setAnnotationSelection(undefined);
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const toolbarWidth = 300;
    setAnnotationSelection({
      text: preparedSelection.annotationText,
      clipboardText: preparedSelection.clipboardText,
      range: range.cloneRange(),
      left: Math.max(10, Math.min(window.innerWidth - toolbarWidth - 10, rect.left + rect.width / 2 - toolbarWidth / 2)),
      top: rect.top > 58 ? rect.top - 48 : rect.bottom + 10,
    });
  }, []);

  useEffect(() => {
    if (!annotationSelection) return;
    const copySelection = (event: globalThis.ClipboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches("input, textarea") || target.isContentEditable)) return;
      writeSelectionToClipboardEvent(event, annotationSelection.clipboardText);
    };
    document.addEventListener("copy", copySelection);
    return () => document.removeEventListener("copy", copySelection);
  }, [annotationSelection]);

  const copyAnnotationSelection = useCallback(async () => {
    if (!annotationSelection) return;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(annotationSelection.clipboardText);
        copied = true;
      }
    } catch {
      // Fall back to Chromium's native copy command below.
    }
    if (!copied) {
      try {
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(annotationSelection.range.cloneRange());
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      }
    }
    setToast({
      message: t(copied ? "annotation.copied" : "annotation.copyFailed"),
      type: copied ? "info" : "error",
    });
    if (copied) {
      setAnnotationSelection(undefined);
      window.getSelection()?.removeAllRanges();
    }
  }, [annotationSelection, t]);

  const addSelectionAnnotation = useCallback((withComment: boolean) => {
    if (!annotationSelection) return;
    const id = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `annotation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    annotationRangesRef.current.set(id, annotationSelection.range);
    setDraftAnnotations((current) => [...current, { id, text: annotationSelection.text }]);
    if (withComment) {
      setAnnotationCommentDraft("");
      setAnnotationCommentEditor({
        id,
        left: annotationSelection.left,
        top: annotationSelection.top,
      });
    }
    setAnnotationSelection(undefined);
    window.getSelection()?.removeAllRanges();
    textareaRef.current?.focus();
  }, [annotationSelection]);

  const saveAnnotationComment = useCallback(() => {
    if (!annotationCommentEditor) return;
    const comment = annotationCommentDraft.trim();
    if (comment) {
      setDraftAnnotations((current) => current.map((annotation) => annotation.id === annotationCommentEditor.id
        ? { ...annotation, comment }
        : annotation));
    }
    setAnnotationCommentEditor(undefined);
    setAnnotationCommentDraft("");
    textareaRef.current?.focus();
  }, [annotationCommentDraft, annotationCommentEditor]);

  const removeDraftAnnotation = useCallback((annotationId?: string) => {
    if (!annotationId) {
      clearDraftAnnotations();
      return;
    }
    annotationRangesRef.current.delete(annotationId);
    setDraftAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId));
    setAnnotationCommentEditor((current) => current?.id === annotationId ? undefined : current);
  }, [clearDraftAnnotations]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 5200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!archiveNotice) return;
    const timer = window.setTimeout(() => setArchiveNotice(undefined), 5200);
    return () => window.clearTimeout(timer);
  }, [archiveNotice]);

  useEffect(() => () => inspectorResizeCleanupRef.current(), []);

  useEffect(() => {
    if (!inspectorOpen) return;
    const fitInspectorToLayout = () => {
      if (window.matchMedia("(max-width: 1120px)").matches) return;
      const layoutWidth = threadLayoutRef.current?.getBoundingClientRect().width ?? window.innerWidth;
      const bounds = inspectorBoundsForLayout(layoutWidth);
      setInspectorWidth((current) => Math.min(bounds.max, Math.max(bounds.min, current)));
    };
    fitInspectorToLayout();
    window.addEventListener("resize", fitInspectorToLayout);
    return () => window.removeEventListener("resize", fitInspectorToLayout);
  }, [inspectorOpen]);

  const chooseWorkspace = async () => {
    setActiveView("thread");
    const selected = await window.devinAgent.workspace.choose();
    if (!selected) return undefined;
    setWorkspaces(await window.devinAgent.workspace.recent());
    await createThreadInProject(selected);
    return selected;
  };

  const createNewThread = async () => {
    setActiveView("thread");
    const projectPath = workspaceRef.current;
    await createThreadInProject(projectPath);
  };

  const createThreadInProject = async (projectPath?: string) => {
    setActiveView("thread");
    const homeDirectory = homeDirectoryRef.current ?? await window.devinAgent.app.homeDirectory();
    setLoading(true);
    homeDirectoryRef.current = homeDirectory;
    const cwd = resolveNewTaskCwd(projectPath, homeDirectory);
    activeCwdRef.current = cwd;
    workspaceRef.current = projectPath;
    const skillRequestId = ++skillRequestRef.current;
    try {
      await window.devinAgent.mentions.setWorkspace(projectPath);
      const skills = await window.devinAgent.mentions.skills({
        ...(projectPath ? { workspacePath: projectPath } : {}),
        refresh: true,
      });
      if (skillRequestId === skillRequestRef.current) setAvailableSkills(skills);
    } catch (error) {
      if (skillRequestId === skillRequestRef.current) {
        setAvailableSkills([]);
        setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
      }
    }
    setWorkspace(projectPath);
    setMessages([]);
    selectActiveSession(undefined);
    setModel(resolveNewSessionModelId(
      newSessionModelIdRef.current,
      availableModelsRef.current,
      modelRef.current,
    ));
    setAgentPlan(undefined);
    setSessionLocked(false);
    setSessionStats(undefined);
    setUiRequest(undefined);
    setAttachments([]);
    clearDraftAnnotations();
    if (projectPath) setExpandedProjects((current) => new Set(current).add(projectPath));
    try {
      const preferredModelId = newSessionModelIdRef.current ?? modelRef.current;
      const snapshot = await discoverNewTaskCapabilities(cwd, projectPath, provider, preferredModelId);
      hydrateNewTaskCapabilities(snapshot, preferredModelId);
    } catch (error) {
      if (!isAgentSessionClosedError(error)) {
        setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
      }
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const clearWorkspace = async () => {
    if (!workspace || loading || running) return;
    await createThreadInProject(undefined);
  };

  const openWorkspaceInDevin = async () => {
    if (!workspace) return;
    try {
      await window.devinAgent.workspace.openInDevin(workspace);
    } catch (error) {
      setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
    }
  };

  const toggleWorkspace = (item: WorkspaceItem) => {
    setExpandedProjects((current) => {
      const next = new Set(current);
      if (next.has(item.path)) next.delete(item.path);
      else next.add(item.path);
      return next;
    });
  };

  const openSession = async (session: SessionSummary) => {
    setActiveView("thread");
    if (session.path === activeSession || loading) return;
    const projectPath = workspaces.some((item) => item.path === session.cwd) ? session.cwd : undefined;
    const cachedMessages = sessionMessagesRef.current.get(session.path);
    selectActiveSession(session.path);
    setMessages(cachedMessages ?? []);
    setAgentPlan(undefined);
    clearDraftAnnotations();
    setSessionLocked(session.locked === true);
    await startAgent(session.cwd, session.path, undefined, projectPath, { replaySession: cachedMessages === undefined });
  };

  const openSessionMenu = (event: ReactMouseEvent<HTMLElement>, session: SessionSummary) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - SESSION_MENU_WIDTH - 8, rect.right - SESSION_MENU_WIDTH));
    const below = rect.bottom + 4;
    const top = below + SESSION_MENU_HEIGHT <= window.innerHeight - 8
      ? below
      : Math.max(8, rect.top - SESSION_MENU_HEIGHT - 4);
    setProjectMenu(undefined);
    setSessionMenu({ sessionId: session.id, left, top });
  };

  const openProjectMenu = (event: ReactMouseEvent<HTMLElement>, project: WorkspaceItem) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - PROJECT_MENU_WIDTH - 8, rect.right - PROJECT_MENU_WIDTH));
    const below = rect.bottom + 4;
    const top = below + PROJECT_MENU_HEIGHT <= window.innerHeight - 8
      ? below
      : Math.max(8, rect.top - PROJECT_MENU_HEIGHT - 4);
    setSessionMenu(undefined);
    setProjectMenu({ path: project.path, left, top });
  };

  const requestProjectRemoval = (project: WorkspaceItem) => {
    setProjectMenu(undefined);
    setProjectPendingRemoval(project);
  };

  const beginProjectRename = (project: WorkspaceItem) => {
    setProjectMenu(undefined);
    setProjectRenameDraft(project.name);
    setRenamingProjectPath(project.path);
  };

  const cancelProjectRename = () => {
    setRenamingProjectPath(undefined);
    setProjectRenameDraft("");
  };

  const commitProjectRename = async (project: WorkspaceItem) => {
    const name = projectRenameDraft.trim();
    if (!name || name === project.name) {
      cancelProjectRename();
      return;
    }
    const previous = project;
    setRenamingProjectPath(undefined);
    setProjectRenameDraft("");
    setWorkspaces((current) => current.map((item) => item.path === project.path ? { ...item, name } : item));
    try {
      const renamed = await window.devinAgent.workspace.rename?.(project.path, name);
      if (!renamed) throw new Error(t("sidebar.renameProjectFailed"));
      setWorkspaces(renamed);
    } catch (error) {
      setWorkspaces((current) => current.map((item) => item.path === project.path ? { ...item, name: previous.name } : item));
      setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
    }
  };

  const removeProject = async () => {
    const project = projectPendingRemoval;
    if (!project || projectRemovalBusy) return;
    setProjectRemovalBusy(true);
    try {
      const nextWorkspaces = await window.devinAgent.workspace.forget(project.path);
      setWorkspaces(nextWorkspaces);
      setExpandedProjects((current) => {
        const next = new Set(current);
        next.delete(project.path);
        return next;
      });
      setFullyExpandedProjects((current) => {
        const next = new Set(current);
        next.delete(project.path);
        return next;
      });
      if (!activeSessionRef.current && workspaceRef.current === project.path) {
        await createThreadInProject(undefined);
      }
      setProjectPendingRemoval(undefined);
      setToast({ message: t("sidebar.projectRemoved", { project: project.name }), type: "info" });
    } catch (error) {
      setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
    } finally {
      setProjectRemovalBusy(false);
    }
  };

  const beginSessionRename = (session: SessionSummary) => {
    setSessionMenu(undefined);
    setSessionRenameDraft(session.title);
    setRenamingSessionId(session.id);
  };

  const cancelSessionRename = () => {
    setRenamingSessionId(undefined);
    setSessionRenameDraft("");
  };

  const commitSessionRename = async (session: SessionSummary) => {
    const title = sessionRenameDraft.trim();
    if (!title || title === session.title) {
      cancelSessionRename();
      return;
    }
    const previous = session;
    setRenamingSessionId(undefined);
    setSessionRenameDraft("");
    setSessions((current) => current.map((item) => item.id === session.id ? optimisticSessionRename(item, title) : item));
    try {
      const renamed = await window.devinAgent.sessions.rename?.(session.id, title);
      if (!renamed) throw new Error(t("session.renameFailed"));
      setSessions((current) => current.map((item) => item.id === session.id ? confirmSessionRename(item, renamed) : item));
    } catch (error) {
      setSessions((current) => current.map((item) => item.id === session.id ? rollbackSessionRename(item, previous) : item));
      setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
    }
  };

  const toggleSessionPinned = async (session: SessionSummary) => {
    const nextPinned = !session.pinned;
    setSessionMenu(undefined);
    setSessions((current) => sortSidebarSessions(current.map((item) => item.id === session.id ? { ...item, pinned: nextPinned } : item)));
    try {
      const updated = await window.devinAgent.sessions.pin?.(session.id, nextPinned);
      if (!updated) throw new Error(t("session.pinFailed"));
    } catch (error) {
      setSessions((current) => sortSidebarSessions(current.map((item) => item.id === session.id ? { ...item, pinned: session.pinned } : item)));
      setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
    }
  };

  const archiveSession = async (session: SessionSummary) => {
    try {
      const archived = await window.devinAgent.sessions.archive?.(session.id);
      if (!archived) throw new Error(t("archive.failed"));
      setSessions((current) => current.map((item) => item.id === session.id ? { ...item, ...archived, archived: true } : item));
      setSessionUnread(session.path, false);
      setArchiveNotice({ ...session, ...archived, archived: true });
    } catch (error) {
      setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
    }
  };

  const restoreSession = async (session: SessionSummary) => {
    try {
      const restored = await window.devinAgent.sessions.unarchive?.(session.id);
      if (!restored) throw new Error(t("archive.restoreFailed"));
      setSessions((current) => current.map((item) => item.id === session.id ? { ...item, ...restored, archived: false } : item));
      setArchiveNotice((current) => current?.id === session.id ? undefined : current);
    } catch (error) {
      setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
    }
  };

  const dispatchPrompt = useCallback(async (
    targetSessionId: string,
    prompt: QueuedPrompt,
    command: "prompt" | "follow_up" = "prompt",
  ) => {
    const annotations = prompt.annotations ?? [];
    const displayText = prompt.text
      || (prompt.mentions?.length ? prompt.mentions.map((mention) => `@${mention.label}`).join(" ") : "")
      || (annotations.length > 0 ? t("annotation.defaultRequest") : t("composer.attachedImage"));
    followingConversationTailRef.current = targetSessionId === activeSessionRef.current;
    if (targetSessionId === activeSessionRef.current) setAgentPlan(planForNextTurn);
    updateSessionMessages(targetSessionId, (current) => [
      ...current,
      optimisticUserMessage(displayText, false, prompt.images, annotations, prompt.mentions ?? []),
    ]);
    const sentAt = new Date().toISOString();
    setSessions((current) => {
      const title = crop(displayText, 80);
      const existing = current.find((session) => session.path === targetSessionId);
      if (existing) {
        return current.map((session) => session.path === targetSessionId ? {
          ...session,
          title: session.messageCount ? session.title : title,
          updatedAt: sentAt,
          messageCount: (session.messageCount ?? 0) + 1,
        } : session);
      }
      const cwd = activeCwdRef.current;
      return cwd ? [{
        id: targetSessionId,
        path: targetSessionId,
        cwd,
        title,
        createdAt: sentAt,
        updatedAt: sentAt,
        provider: "devin",
        messageCount: 1,
      }, ...current] : current;
    });
    markSessionRunning(targetSessionId, true);
    try {
      await window.devinAgent.agent.command(command, {
        sessionId: targetSessionId,
        message: annotations.length > 0
          ? formatPromptWithAnnotations(prompt.text || t("annotation.defaultRequest"), annotations)
          : prompt.text || t("composer.describeImage"),
        ...(prompt.images.length ? { images: prompt.images.map((image) => ({ type: "image", ...image })) } : {}),
        ...(prompt.mentions?.length ? { mentions: prompt.mentions } : {}),
      });
    } catch (error) {
      markSessionRunning(targetSessionId, false);
      throw error;
    }
  }, [markSessionRunning, t, updateSessionMessages]);

  const drainFollowUpQueue = useCallback((sessionId: string) => {
    if (
      runningSessionIdsRef.current.has(sessionId)
      || interruptingSessionIdsRef.current.has(sessionId)
      || drainingFollowUpSessionIdsRef.current.has(sessionId)
    ) return;
    const taken = takeFollowUp(followUpQueuesRef.current.get(sessionId) ?? []);
    if (!taken.item) return;
    setFollowUpQueue(sessionId, () => taken.queue);
    drainingFollowUpSessionIdsRef.current.add(sessionId);
    void (async () => {
      let succeeded = false;
      try {
        await dispatchPrompt(sessionId, taken.item!.value);
        succeeded = true;
      } catch (error) {
        setFollowUpQueue(sessionId, (queue) => restoreFollowUp(queue, taken.item!, taken.index));
        if (!isAgentSessionClosedError(error)) {
          setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
        }
      } finally {
        drainingFollowUpSessionIdsRef.current.delete(sessionId);
      }
      if (succeeded) drainFollowUpQueueRef.current(sessionId);
    })();
  }, [dispatchPrompt, setFollowUpQueue]);

  useEffect(() => {
    drainFollowUpQueueRef.current = drainFollowUpQueue;
    return () => { drainFollowUpQueueRef.current = () => undefined; };
  }, [drainFollowUpQueue]);

  const interruptAndDispatch = useCallback(async (sessionId: string, prompt: QueuedPrompt) => {
    interruptingSessionIdsRef.current.add(sessionId);
    try {
      await dispatchPrompt(sessionId, prompt, "follow_up");
    } finally {
      interruptingSessionIdsRef.current.delete(sessionId);
      if (!runningSessionIdsRef.current.has(sessionId)) drainFollowUpQueueRef.current(sessionId);
    }
  }, [dispatchPrompt]);

  const applyEditedPlan = useCallback((nextPlan: StructuredPlan): boolean => {
    const sessionId = activeSessionRef.current;
    if (!sessionId) {
      setToast({ message: t("plan.sessionRequired"), type: "error" });
      return false;
    }
    const previousPlan = agentPlan;
    const editedPlan: PlanState = { ...nextPlan, updatedAt: Date.now() };
    setAgentPlan(editedPlan);
    setToast({ message: t("plan.sent"), type: "info" });
    const prompt = { text: formatPlanRevisionPrompt(nextPlan, locale), images: [] } satisfies QueuedPrompt;
    const request = runningSessionIdsRef.current.has(sessionId) || interruptingSessionIdsRef.current.has(sessionId)
      ? interruptAndDispatch(sessionId, prompt)
      : dispatchPrompt(sessionId, prompt);
    void request.catch((error) => {
      setAgentPlan((current) => current === editedPlan ? previousPlan : current);
      if (!isAgentSessionClosedError(error)) {
        setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
      }
    });
    return true;
  }, [agentPlan, dispatchPrompt, interruptAndDispatch, locale, t]);

  const applyEditedMarkdownPlan = useCallback(async (plan: string) => {
    const sessionId = activeSessionRef.current;
    if (!sessionId) throw new Error(t("plan.sessionRequired"));
    const prompt = {
      text: formatMarkdownPlanRevisionPrompt(plan, locale),
      images: [],
    } satisfies QueuedPrompt;
    if (runningSessionIdsRef.current.has(sessionId) || interruptingSessionIdsRef.current.has(sessionId)) {
      await interruptAndDispatch(sessionId, prompt);
    } else {
      await dispatchPrompt(sessionId, prompt);
    }
    setToast({ message: t("plan.sent"), type: "info" });
  }, [dispatchPrompt, interruptAndDispatch, locale, t]);

  const sendSideChat = async (question: string) => {
    const sessionId = activeSessionRef.current;
    const normalized = question.trim().replace(/^\/btw\s*/i, "");
    if (!sessionId || !normalized || !sideChatEnabled) {
      setToast({ message: t("sideChat.unavailable"), type: "error" });
      return;
    }
    const generation = chainGenerationRef.current;
    setSideChatOpen(true);
    setChainConversations((current) => beginChainConversation(current, sessionId, "side", normalized, generation));
    try {
      await window.devinAgent.agent.command("side_chat", { sessionId, message: normalized });
      setChainConversations((current) => settleChainConversation(current, sessionId, "side", generation));
    } catch (error) {
      const message = cleanError(error instanceof Error ? error.message : String(error));
      setChainConversations((current) => settleChainConversation(current, sessionId, "side", generation, message));
      setToast({ message, type: "error" });
    }
  };

  const sendMessage = async ({ interrupt = false }: { interrupt?: boolean } = {}) => {
    if (sessionLocked) return;
    const text = draft.trim();
    if (!text && attachments.length === 0 && draftAnnotations.length === 0 && draftMentions.length === 0) return;
    if (/^\/btw(?:\s|$)/i.test(text) && attachments.length === 0 && draftAnnotations.length === 0 && draftMentions.length === 0) {
      setDraft("");
      await sendSideChat(text);
      return;
    }
    if (attachments.length > 0 && !imagePromptEnabled) {
      setToast({ message: t("composer.imagesUnavailable"), type: "error" });
      return;
    }
    const pendingAttachments = attachments;
    const pendingAnnotations = draftAnnotations;
    const pendingMentions = draftMentions;
    const pendingAnnotationRanges = new Map(pendingAnnotations.flatMap((annotation) => {
      const range = annotationRangesRef.current.get(annotation.id);
      return range ? [[annotation.id, range] as const] : [];
    }));
    let targetSessionId = activeSessionRef.current;
    if (!targetSessionId) {
      const cwd = activeCwdRef.current ?? homeDirectoryRef.current ?? await window.devinAgent.app.homeDirectory();
      const projectPath = workspaceRef.current;
      const desiredModel = model;
      const desiredPermission = permission;
      targetSessionId = await startAgent(
        cwd,
        undefined,
        { provider, model: desiredModel, permission: desiredPermission, sandbox },
        projectPath,
      );
      if (!targetSessionId) return;
      try {
        if (desiredModel) {
          await window.devinAgent.agent.command("set_model", { provider: "devin", modelId: desiredModel });
          setModel(desiredModel);
          const previousNewSessionModelId = newSessionModelIdRef.current;
          newSessionModelIdRef.current = desiredModel;
          try {
            await window.devinAgent.settings.setNewSessionModelId(desiredModel);
          } catch (error) {
            newSessionModelIdRef.current = previousNewSessionModelId;
            setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
          }
        }
        if (desiredPermission && availableModes.some((mode) => mode.id === desiredPermission)) {
          await window.devinAgent.agent.command("set_mode", { modeId: desiredPermission });
          setPermission(desiredPermission);
        }
      } catch (error) {
        setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
        return;
      }
    }
    const prompt: QueuedPrompt = {
      text,
      images: pendingAttachments.map(({ data, mimeType }) => ({ data, mimeType })),
      ...(pendingAnnotations.length > 0 ? { annotations: pendingAnnotations } : {}),
      ...(pendingMentions.length > 0 ? { mentions: pendingMentions } : {}),
    };
    const alreadyRunning = runningSessionIdsRef.current.has(targetSessionId)
      || interruptingSessionIdsRef.current.has(targetSessionId);
    followingConversationTailRef.current = true;
    setDraft("");
    setAttachments([]);
    setDraftMentions([]);
    setMentionMenu(undefined);
    clearDraftAnnotations();
    if (alreadyRunning && !interrupt) {
      setFollowUpQueue(targetSessionId, (queue) => enqueueFollowUp(queue, prompt));
      return;
    }
    try {
      if (alreadyRunning) await interruptAndDispatch(targetSessionId, prompt);
      else await dispatchPrompt(targetSessionId, prompt);
    } catch (error) {
      setDraft((current) => current || text);
      setAttachments((current) => current.length > 0 ? current : pendingAttachments);
      setDraftMentions((current) => current.length > 0 ? current : pendingMentions);
      setDraftAnnotations((current) => {
        if (current.length > 0) return current;
        annotationRangesRef.current = new Map(pendingAnnotationRanges);
        return pendingAnnotations;
      });
      if (!isAgentSessionClosedError(error)) {
        setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
      }
    }
  };

  const sendQueuedPromptNow = async (itemId: string) => {
    const sessionId = activeSessionRef.current;
    if (!sessionId) return;
    const taken = takeFollowUp(followUpQueuesRef.current.get(sessionId) ?? [], itemId);
    if (!taken.item) return;
    setFollowUpQueue(sessionId, () => taken.queue);
    try {
      if (runningSessionIdsRef.current.has(sessionId) || interruptingSessionIdsRef.current.has(sessionId)) {
        await interruptAndDispatch(sessionId, taken.item.value);
      }
      else await dispatchPrompt(sessionId, taken.item.value);
    } catch (error) {
      setFollowUpQueue(sessionId, (queue) => restoreFollowUp(queue, taken.item!, taken.index));
      if (!isAgentSessionClosedError(error)) {
        setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
      }
    }
  };

  const stopAgent = async () => {
    const sessionId = activeSessionRef.current;
    if (!sessionId) return;
    await window.devinAgent.agent.command("abort", { sessionId }).catch(() => undefined);
    markSessionRunning(sessionId, false);
  };

  const runAvailableCommand = async (command: AvailableCommand) => {
    const name = command.name.startsWith("/") ? command.name : `/${command.name}`;
    if (/^\/btw$/i.test(name)) {
      setSideChatOpen(true);
      return;
    }
    if (/^\/handoff\b/i.test(name) && !window.confirm("Handoff moves this task to a cloud Devin session. Continue?")) return;
    const targetSessionId = activeSessionRef.current;
    if (!targetSessionId) return;
    const prompt = { text: name, images: [] } satisfies QueuedPrompt;
    if (runningSessionIdsRef.current.has(targetSessionId)) {
      setFollowUpQueue(targetSessionId, (queue) => enqueueFollowUp(queue, prompt));
      return;
    }
    try {
      await dispatchPrompt(targetSessionId, prompt);
    } catch (error) {
      setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
    }
  };

  const selectMentionOption = (option: MentionMenuOption | undefined) => {
    if (!option || option.disabled || !mentionTrigger) return;
    if (mentionBlurTimerRef.current !== undefined) {
      window.clearTimeout(mentionBlurTimerRef.current);
      mentionBlurTimerRef.current = undefined;
    }
    const caret = textareaRef.current?.getCaret() ?? draft.length;
    if (option.category) {
      const next = replaceDraftRange(draft, draftMentions, mentionTrigger.start, caret, "@");
      setDraft(next.value);
      setDraftMentions(next.mentions);
      setMentionMenu({ category: option.category, activeIndex: 0 });
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setCaret(next.caret);
      });
      return;
    }
    if (!option.mention) return;
    if (option.mention.kind === "file" && option.mention.sensitive && !window.confirm(t("mentions.sensitiveConfirm", { path: option.mention.path }))) return;
    const next = insertMentionAtTrigger(draft, draftMentions, option.mention, mentionTrigger, caret);
    setDraft(next.value);
    setDraftMentions(next.mentions);
    setMentionMenu(undefined);
    setMentionResults([]);
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setCaret(next.caret);
    });
  };

  const handleDraftChange = (value: string, mentions: PositionedMention[], caret: number) => {
    setDraft(value);
    setDraftMentions(mentions);
    if (composingRef.current) return;
    const trigger = findAtTrigger(value, caret, mentions);
    if (!trigger) {
      setMentionMenu(undefined);
      return;
    }
    setMentionMenu((current) => current ? { ...current, activeIndex: 0 } : { activeIndex: 0 });
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isImeCompositionKey(event.nativeEvent, composingRef.current)) return;
    if (mentionMenu) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        setMentionMenu((current) => current ? {
          ...current,
          activeIndex: nextMentionOptionIndex(mentionOptions, current.activeIndex, direction),
        } : current);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        selectMentionOption(mentionOptions[mentionMenu.activeIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMentionMenu(undefined);
        return;
      }
      if (event.key === "Backspace" && mentionMenu.category && mentionTrigger?.query === "") {
        event.preventDefault();
        setMentionMenu({ activeIndex: 0 });
        return;
      }
    }
    const caret = textareaRef.current?.getCaret() ?? draft.length;
    const adjacentMention = event.key === "Backspace"
      ? draftMentions.find((mention) => mention.end === caret)
      : event.key === "Delete"
        ? draftMentions.find((mention) => mention.start === caret)
        : undefined;
    if (!mentionMenu && adjacentMention) {
      event.preventDefault();
      const next = removePositionedMention(draft, draftMentions, adjacentMention.id);
      setDraft(next.value);
      setDraftMentions(next.mentions);
      window.requestAnimationFrame(() => textareaRef.current?.setCaret(next.caret));
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage({ interrupt: event.metaKey || event.ctrlKey });
      return;
    }
    if (event.key === "Enter" && event.shiftKey) {
      event.preventDefault();
      textareaRef.current?.insertText("\n");
    }
  };

  const addImageAttachments = async (files: File[]) => {
    if (!imagePromptEnabled) {
      setToast({ message: "The current Devin session or model does not advertise image input.", type: "error" });
      return;
    }
    const images = files.filter((file) => SUPPORTED_IMAGE_TYPES.has(file.type));
    if (images.length === 0) return;
    try {
      const next = await Promise.all(images.map(fileToAttachment));
      setAttachments((current) => [...current, ...next].slice(0, 5));
    } catch (error) {
      setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
    }
  };

  const handleAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    await addImageAttachments(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handleComposerPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const images = Array.from(event.clipboardData.files).filter((file) => SUPPORTED_IMAGE_TYPES.has(file.type));
    if (images.length === 0) return;
    if (!imagePromptEnabled) {
      setToast({ message: "The current Devin session or model does not advertise image input.", type: "error" });
      return;
    }
    if (!event.clipboardData.getData("text/plain")) event.preventDefault();
    void addImageAttachments(images);
  };

  const changeModel = async (value: string) => {
    const selected = availableModels.find((candidate) => candidate.id === value);
    if (!selected) return;
    if (!activeSessionRef.current) {
      setProvider("devin");
      setModel(selected.id);
      if (!selected.supportsImages) setAttachments([]);
      return;
    }
    try {
      await window.devinAgent.agent.command("set_model", { provider: "devin", modelId: selected.id });
      setProvider("devin");
      setModel(selected.id);
      if (!selected.supportsImages) setAttachments([]);
      void refreshSessionStats();
    } catch (error) {
      if (isAgentSessionClosedError(error)) return;
      setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
    }
  };

  const changePinnedModelIds = async (next: string[]) => {
    const previous = pinnedModelIds;
    setPinnedModelIds(next);
    try {
      await window.devinAgent.settings.setPinnedModelIds(next);
    } catch (error) {
      setPinnedModelIds(previous);
      setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
    }
  };

  const changePermission = async (next: PermissionMode) => {
    if ((next === permission && next === preferredModeIdRef.current) || permissionUpdating) return;
    const previous = permission;
    const previousPreferredModeId = preferredModeIdRef.current;
    const shouldUpdateRuntime = Boolean(activeSessionRef.current && next !== previous);
    let runtimeChanged = false;
    setPermission(next);
    setPermissionUpdating(true);
    try {
      if (shouldUpdateRuntime) {
        await window.devinAgent.agent.command("set_mode", { modeId: next });
        runtimeChanged = true;
      }
      await window.devinAgent.settings.setPreferredModeId(next);
      preferredModeIdRef.current = next;
    } catch (error) {
      let restoredRuntime = !runtimeChanged;
      if (runtimeChanged && previous && availableModes.some((mode) => mode.id === previous)) {
        try {
          await window.devinAgent.agent.command("set_mode", { modeId: previous });
          restoredRuntime = true;
        } catch {
          restoredRuntime = false;
        }
      }
      preferredModeIdRef.current = previousPreferredModeId;
      setPermission(restoredRuntime ? previous : next);
      setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
    } finally {
      setPermissionUpdating(false);
    }
  };

  const changeColorScheme = async (next: ColorSchemePreference) => {
    const previous = colorScheme;
    setColorScheme(next);
    applyColorScheme(next);
    try {
      await window.devinAgent.settings.setColorScheme(next);
    } catch (error) {
      setColorScheme(previous);
      applyColorScheme(previous);
      setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
    }
  };

  const allTools = useMemo(() => messages.flatMap((message) => message.tools), [messages]);
  const previewFileCandidates = useMemo(() => {
    const seen = new Set<string>();
    const files: string[] = [];
    const addFile = (filePath: string | undefined) => {
      if (
        !filePath
        || seen.has(filePath)
        || files.length === 6
        || !isPreviewPathInWorkspace(filePath, activeCwdRef.current)
      ) return;
      seen.add(filePath);
      files.push(filePath);
    };
    for (const message of [...messages].reverse()) {
      for (const filePath of previewPathsFromText(message.text)) addFile(filePath);
      for (const tool of [...message.tools].reverse()) {
        addFile(toolFilePath(tool));
        for (const filePath of previewPathsFromText(tool.output ?? "")) addFile(filePath);
      }
      if (files.length === 6) break;
    }
    for (const tool of [...allTools].reverse()) {
      addFile(toolFilePath(tool));
      if (files.length === 6) break;
    }
    return files;
  }, [activeSession, allTools, messages, workspace]);

  useEffect(() => {
    let cancelled = false;
    const filesApi = window.devinAgent.files;
    if (!filesApi?.validPreviewPaths || previewFileCandidates.length === 0) {
      setRecentPreviewFiles([]);
      return () => { cancelled = true; };
    }
    void filesApi.validPreviewPaths(previewFileCandidates)
      .then((files) => {
        if (!cancelled) setRecentPreviewFiles(files.slice(0, 6));
      })
      .catch(() => {
        if (!cancelled) setRecentPreviewFiles([]);
      });
    return () => { cancelled = true; };
  }, [previewFileCandidates]);
  const conversationGroups = useMemo(() => groupConversation(messages), [messages]);
  const latestAssistantGroup = [...conversationGroups].reverse().find((group) => group.type === "assistant");
  const activeAssistantGroupId = running ? latestAssistantGroup?.id : undefined;
  const activeAssistantHasWork = latestAssistantGroup?.type === "assistant"
    && splitAssistantTurn(latestAssistantGroup.messages, running).work.length > 0;
  const projectPaths = useMemo(() => new Set(workspaces.map((item) => item.path)), [workspaces]);
  const sidebarSessionGroups = useMemo(() => partitionSidebarSessions(sessions, projectPaths), [projectPaths, sessions]);

  const showPreviewPanel = () => {
    setContextCardOpen(false);
    setInspectorMode("preview");
    setPreviewError(undefined);
    setInspectorOpen(true);
  };

  const showChangesPanel = () => {
    setContextCardOpen(false);
    setInspectorMode("changes");
    setSelectedChange(undefined);
    setWorkspaceDiff(undefined);
    setInspectorOpen(true);
    void refreshWorkspaceChanges();
  };

  const closePreviewPanel = () => {
    previewRequestRef.current += 1;
    changesDiffRequestRef.current += 1;
    setPreviewLoading(false);
    setChangesLoading(false);
    setPreviewError(undefined);
    setChangesError(undefined);
    setInspectorOpen(false);
  };

  const inspectorWidthBounds = () => {
    const layoutWidth = threadLayoutRef.current?.getBoundingClientRect().width ?? window.innerWidth;
    return inspectorBoundsForLayout(layoutWidth);
  };

  const resizeInspectorByKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home") return;
    event.preventDefault();
    const bounds = inspectorWidthBounds();
    if (event.key === "Home") {
      setInspectorWidth(Math.min(DEFAULT_INSPECTOR_WIDTH, bounds.max));
      return;
    }
    const delta = event.key === "ArrowLeft" ? 24 : -24;
    setInspectorWidth((current) => Math.min(bounds.max, Math.max(bounds.min, current + delta)));
  };

  const startInspectorResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    inspectorResizeCleanupRef.current();
    const startX = event.clientX;
    const startWidth = inspectorWidth;
    const bounds = inspectorWidthBounds();
    document.body.classList.add("inspector-resizing");

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      const nextWidth = startWidth + startX - moveEvent.clientX;
      setInspectorWidth(Math.min(bounds.max, Math.max(bounds.min, nextWidth)));
    };
    const stopResizing = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stopResizing);
      window.removeEventListener("pointercancel", stopResizing);
      document.body.classList.remove("inspector-resizing");
      inspectorResizeCleanupRef.current = () => undefined;
    };
    inspectorResizeCleanupRef.current = stopResizing;
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopResizing);
    window.addEventListener("pointercancel", stopResizing);
  };

  const startProjectDrag = (event: ReactDragEvent<HTMLElement>, item: WorkspaceItem) => {
    if (sessionQuery.trim()) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.path);
    sidebarDragRef.current = { kind: "project", id: item.path, original: workspacesRef.current };
    setSidebarDrag({ kind: "project", id: item.path });
  };

  const dragProjectOver = (event: ReactDragEvent<HTMLElement>, targetPath: string) => {
    const drag = sidebarDragRef.current;
    if (!drag || drag.kind !== "project") return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setWorkspaces((current) => {
      const next = moveByKey(current, drag.id, targetPath, (item) => item.path);
      workspacesRef.current = next;
      return next;
    });
  };

  const startSessionDrag = (
    event: ReactDragEvent<HTMLElement>,
    session: SessionSummary,
    groupKey: SidebarSessionGroupKey,
  ) => {
    if (sessionQuery.trim() || renamingSessionId === session.id) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", session.id);
    sidebarDragRef.current = { kind: "session", id: session.id, groupKey, original: sessionsRef.current };
    setSidebarDrag({ kind: "session", id: session.id, groupKey });
  };

  const dragSessionOver = (
    event: ReactDragEvent<HTMLElement>,
    targetId: string,
    groupKey: SidebarSessionGroupKey,
  ) => {
    const drag = sidebarDragRef.current;
    if (!drag || drag.kind !== "session" || drag.groupKey !== groupKey) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setSessions((current) => {
      const next = reorderSessionsWithinGroup(current, groupKey, drag.id, targetId, projectPaths);
      sessionsRef.current = next;
      return next;
    });
  };

  const finishSidebarDrag = async (event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const drag = sidebarDragRef.current;
    if (!drag) return;
    sidebarDragRef.current = undefined;
    setSidebarDrag(undefined);
    try {
      if (drag.kind === "project") {
        const persisted = await window.devinAgent.workspace.reorder(workspacesRef.current.map((item) => item.path));
        workspacesRef.current = persisted;
        setWorkspaces(persisted);
        return;
      }
      if (!window.devinAgent.sessions.reorder) throw new Error(t("sidebar.reorderRestartRequired"));
      const currentProjectPaths = new Set(workspacesRef.current.map((item) => item.path));
      const ids = orderedSessionIdsForGroup(sessionsRef.current, drag.groupKey, currentProjectPaths);
      await window.devinAgent.sessions.reorder(ids);
    } catch (error) {
      if (drag.kind === "project") {
        workspacesRef.current = drag.original;
        setWorkspaces(drag.original);
      } else {
        sessionsRef.current = drag.original;
        setSessions(drag.original);
      }
      setToast({ message: t("sidebar.reorderFailed", { error: cleanError(error instanceof Error ? error.message : String(error)) }), type: "error" });
    }
  };

  const cancelSidebarDrag = () => {
    const drag = sidebarDragRef.current;
    if (!drag) return;
    sidebarDragRef.current = undefined;
    setSidebarDrag(undefined);
    if (drag.kind === "project") {
      workspacesRef.current = drag.original;
      setWorkspaces(drag.original);
    } else {
      sessionsRef.current = drag.original;
      setSessions(drag.original);
    }
  };

  const moveProjectByKeyboard = async (event: KeyboardEvent<HTMLButtonElement>, item: WorkspaceItem) => {
    if (sessionQuery.trim()) return;
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    event.stopPropagation();
    const original = workspacesRef.current;
    const currentIndex = original.findIndex((candidate) => candidate.path === item.path);
    const targetIndex = currentIndex + (event.key === "ArrowUp" ? -1 : 1);
    const target = original[targetIndex];
    if (currentIndex < 0 || !target) return;
    const next = moveByKey(original, item.path, target.path, (candidate) => candidate.path);
    workspacesRef.current = next;
    setWorkspaces(next);
    try {
      const persisted = await window.devinAgent.workspace.reorder(next.map((candidate) => candidate.path));
      workspacesRef.current = persisted;
      setWorkspaces(persisted);
    } catch (error) {
      workspacesRef.current = original;
      setWorkspaces(original);
      setToast({ message: t("sidebar.reorderFailed", { error: cleanError(error instanceof Error ? error.message : String(error)) }), type: "error" });
    }
  };

  const moveSessionByKeyboard = async (
    event: KeyboardEvent<HTMLButtonElement>,
    session: SessionSummary,
    groupKey: SidebarSessionGroupKey,
  ) => {
    if (sessionQuery.trim() || renamingSessionId === session.id) return;
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    event.stopPropagation();
    const original = sessionsRef.current;
    const currentProjectPaths = new Set(workspacesRef.current.map((item) => item.path));
    const orderedIds = orderedSessionIdsForGroup(original, groupKey, currentProjectPaths);
    const currentIndex = orderedIds.indexOf(session.id);
    const targetIndex = currentIndex + (event.key === "ArrowUp" ? -1 : 1);
    const targetId = orderedIds[targetIndex];
    if (currentIndex < 0 || !targetId) return;
    const next = reorderSessionsWithinGroup(original, groupKey, session.id, targetId, currentProjectPaths);
    sessionsRef.current = next;
    setSessions(next);
    try {
      if (!window.devinAgent.sessions.reorder) throw new Error(t("sidebar.reorderRestartRequired"));
      await window.devinAgent.sessions.reorder(orderedSessionIdsForGroup(next, groupKey, currentProjectPaths));
    } catch (error) {
      sessionsRef.current = original;
      setSessions(original);
      setToast({ message: t("sidebar.reorderFailed", { error: cleanError(error instanceof Error ? error.message : String(error)) }), type: "error" });
    }
  };

  const projectSessions = useMemo(() => {
    const grouped = new Map<string, SessionSummary[]>();
    for (const item of workspaces) grouped.set(item.path, []);
    for (const session of sidebarSessionGroups.project) grouped.get(session.cwd)?.push(session);
    for (const projectItems of grouped.values()) projectItems.sort(compareSidebarSessions);
    return grouped;
  }, [sidebarSessionGroups.project, workspaces]);
  const pinnedSessions = useMemo(() => {
    const query = sessionQuery.trim().toLowerCase();
    const items = [...sidebarSessionGroups.pinned].sort(compareSidebarSessions);
    return query ? items.filter((session) => session.title.toLowerCase().includes(query)) : items;
  }, [sessionQuery, sidebarSessionGroups.pinned]);
  const filteredWorkspaces = useMemo(() => {
    const query = sessionQuery.trim().toLowerCase();
    if (!query) return workspaces;
    return workspaces.filter((item) => (
      `${item.name} ${item.path}`.toLowerCase().includes(query)
      || projectSessions.get(item.path)?.some((session) => session.title.toLowerCase().includes(query))
    ));
  }, [projectSessions, sessionQuery, workspaces]);
  const recentTasks = useMemo(() => {
    const query = sessionQuery.trim().toLowerCase();
    const tasks = [...sidebarSessionGroups.recent].sort(compareSidebarSessions);
    return query ? tasks.filter((session) => session.title.toLowerCase().includes(query)) : tasks;
  }, [sessionQuery, sidebarSessionGroups.recent]);
  const activeTitle = sessions.find((session) => session.path === activeSession)?.title ?? (messages[0]?.text || t("status.newThread"));
  const selectedThreadPath = activeView === "thread" ? activeSession : undefined;
  const workspaceName = workspace ? workspace.split(/[\\/]/).filter(Boolean).at(-1) : undefined;
  const selectedModel = availableModels.find((candidate) => candidate.provider === provider && candidate.id === model);
  const selectedCapabilityModel = capabilities?.models.find((candidate) => candidate.id === model);
  const imagePromptEnabled = Boolean(capabilities && supportsImagePrompt(capabilities, selectedCapabilityModel));
  const sessionMenuItem = sessionMenu ? sessions.find((session) => session.id === sessionMenu.sessionId) : undefined;
  const projectMenuItem = projectMenu ? workspaces.find((item) => item.path === projectMenu.path) : undefined;

  const downloadSessionMarkdown = async () => {
    try {
      const result = await window.devinAgent.app.saveMarkdown({
        defaultName: markdownExportFileName(activeTitle),
        content: formatSessionMarkdown(activeTitle, messages),
      });
      if (result.saved) setToast({ message: t("session.downloadedMarkdown"), type: "info" });
    } catch (error) {
      setToast({ message: t("session.downloadFailed", { error: cleanError(error instanceof Error ? error.message : String(error)) }), type: "error" });
    }
  };

  return (
    <div className={`app-shell${sidebarOpen ? "" : " sidebar-is-collapsed"}${window.devinAgent.platform === "darwin" ? " platform-macos" : ""}${sidebarDrag ? " sidebar-is-dragging" : ""}`}>
      <AppSidebar {...{
        sidebarOpen, sessionQuery, activeView, weixinStatus, pinnedSessions, recentTasks, selectedThreadPath, runningSessionIds, unreadSessionIds, sidebarDrag, renamingSessionId, sessionRenameDraft, sessionRenameInputRef, projectsSectionOpen, filteredWorkspaces, projectSessions, expandedProjects, fullyExpandedProjects, workspace, activeSession, renamingProjectPath, projectRenameDraft, projectRenameInputRef, recentSectionOpen, profile,
        setSessionQuery, setSearchOpen, setSidebarOpen, setActiveView, setProjectsSectionOpen, setRecentSectionOpen, setFullyExpandedProjects, setSessionRenameDraft, setProjectRenameDraft, setSettingsOpen, createNewThread, createThreadInProject, openSession, openSessionMenu, openProjectMenu, dragSessionOver, dragProjectOver, finishSidebarDrag, startSessionDrag, startProjectDrag, cancelSidebarDrag, moveSessionByKeyboard, moveProjectByKeyboard, commitSessionRename, cancelSessionRename, commitProjectRename, cancelProjectRename, toggleWorkspace,
      }} />
      <AppMainPane {...{
        activeView, sidebarOpen, setSidebarOpen, threadLayoutRef, activeTitle, sessionLocked, workspace, workspaceName, loading, running, messages, inspectorOpen, inspectorMode, workspaceChanges, contextCardOpen, setContextCardOpen, setInspectorOpen, conversationContextEnabled: ENABLE_CONVERSATION_CONTEXT, activeFollowUps, scrollRef, handleConversationScroll, handleConversationWheel, captureAnnotationSelection, uiRequest, interactionRequests, agentPlan, conversationGroups, activeAssistantGroupId, showReasoningProcess, setDraft, textareaRef, setPreviewImage, openFilePreview, setToast, applyEditedPlan, activeAssistantHasWork, applyEditedMarkdownPlan, setUiRequest, sideChatOpen, sideChatCommand, sideChatState, sideChatEnabled, sendSideChat, setSideChatOpen, activeSession, setFollowUpQueue, sendQueuedPromptNow, chooseWorkspace, clearWorkspace, draftAnnotations, removeDraftAnnotation, attachments, setAttachments, draft, draftMentions, handleDraftChange, handleComposerKeyDown, handleComposerPaste, composingRef, mentionMenu, setMentionMenu, mentionBlurTimerRef, mentionTrigger, mentionLoading, mentionError, mentionOptions, selectMentionOption, imagePromptEnabled, handleAttachment, permission, availableModes, permissionUpdating, changePermission, model, availableModels, pinnedModelIds, changeModel, changePinnedModelIds, stopAgent, sendMessage, sessionStats, selectedModel, provider, inspectorWidth, inspectorMinWidth: MIN_INSPECTOR_WIDTH, inspectorMaxWidth: MAX_INSPECTOR_WIDTH, inspectorDefaultWidth: DEFAULT_INSPECTOR_WIDTH, startInspectorResize, resizeInspectorByKeyboard, setInspectorWidth, selectedChange, workspaceDiff, changesLoading, changesError, openWorkspaceDiff, refreshWorkspaceChanges, changesDiffRequestRef, setSelectedChange, setWorkspaceDiff, setChangesError, setChangesLoading, filePreview, previewLoading, previewError, recentPreviewFiles, choosePreviewFile, closePreviewPanel, showChangesPanel, showPreviewPanel, openWorkspaceInDevin, downloadSessionMarkdown, capabilities,
      }} />
      <AppOverlays {...{
        annotationSelection, copyAnnotationSelection, addSelectionAnnotation, annotationCommentEditor, annotationCommentInputRef, annotationCommentDraft, setAnnotationCommentDraft, setAnnotationCommentEditor, saveAnnotationComment, annotationMarkers, sessionMenu, sessionMenuItem, setSessionMenu, beginSessionRename, toggleSessionPinned, runningSessionIds, archiveSession, projectMenu, projectMenuItem, setProjectMenu, beginProjectRename, requestProjectRemoval, archiveNotice, setArchiveNotice, restoreSession, projectPendingRemoval, projectRemovalBusy, setProjectPendingRemoval, removeProject, settingsOpen, providers, model, availableModels, pinnedModelIds, permission, availableModes, colorScheme, profile, showReasoningProcess, sessions, setSettingsOpen, setProviders, setProvider, setModel, activeSession, workspace, activeCwd: activeCwdRef.current, startAgent, changePermission, changePinnedModelIds, changeColorScheme, setProfile, setShowReasoningProcess, authCancellationRef, setToast, openSession, commandOpen, availableCommands, runAvailableCommand, createNewThread, chooseWorkspace, showPreviewPanel, setCommandOpen, searchOpen, workspaces, sessionQuery, setSessionQuery, setSearchOpen, authEvent, setAuthEvent, previewImage, setPreviewImage, toast,
      }} />
    </div>
  );
}
