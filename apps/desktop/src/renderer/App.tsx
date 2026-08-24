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
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Bot,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleStop,
  Code2,
  Copy,
  CornerDownLeft,
  CornerDownRight,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  File as FileIcon,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  Gauge,
  GitBranch,
  GitCompareArrows,
  GitFork,
  GripVertical,
  ImagePlus,
  Info,
  Languages,
  ListFilter,
  ListTodo,
  LoaderCircle,
  MessageSquareWarning,
  MessageSquareQuote,
  MessageSquareText,
  Monitor,
  Moon,
  Paperclip,
  PanelLeft,
  PanelRight,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Shield,
  ShieldOff,
  SquarePen,
  Sparkles,
  Sun,
  TerminalSquare,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { MentionKind, MentionRef, MentionSearchResult, SkillMentionRef } from "../shared/mentions";
import type {
  AgentSnapshot,
  AgentSessionStats,
  AuthUiEvent,
  ColorSchemePreference,
  DevinCliUpdateStatus,
  DesktopInteractionRequest,
  ExtensionUiRequest,
  LanguagePreference,
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
} from "../shared/types";
import { AUTH_PROMPT_CANCEL_VALUE } from "../shared/types";
import {
  applyAgentEvent,
  getAssistantActivity,
  groupConversation,
  normalizeMessages,
  optimisticUserMessage,
  settleAssistantMessages,
  splitAssistantTurn,
  type ChatImage,
  type ChatAnnotation,
  type ChatMessage,
  type ToolActivity,
  type TurnWorkEntry,
} from "./lib/conversation";
import {
  formatPromptWithAnnotations,
  prepareAnnotationSelection,
  writeSelectionToClipboardEvent,
} from "./lib/annotations";
import { sameWorkspaceChanges } from "./lib/git-changes";
import { parseUnifiedDiff } from "./lib/git-diff";
import devinDesktopIcon from "./assets/devin-desktop-icon.png";
import { applyColorScheme } from "./lib/color-scheme";
import { localizeExtensionUiRequest, useI18n } from "./lib/i18n";
import { isAgentSessionClosedError, isAuthPromptCancelledError } from "./lib/errors";
import { isPreviewPathInWorkspace, previewPathsFromText } from "./lib/file-preview";
import { isImeCompositionKey } from "./lib/ime";
import {
  formatMarkdownPlanRevisionPrompt,
  formatPlanRevisionPrompt,
  parseExitPlanPermission,
  parseStructuredPlan,
  planForNextTurn,
  type PlanStepStatus,
  type StructuredPlan,
} from "./lib/plan";
import { updateConversationTailFollowing } from "./lib/conversation-scroll";
import { normalizeAcpUpdate } from "./lib/acp-normalizer";
import { supportsImagePrompt } from "./lib/capabilities";
import { markdownExportFileName } from "../shared/markdown-export";
import { assistantResponseText, formatSessionMarkdown } from "./lib/session-export";
import {
  beginChainConversation,
  chainConversationKey,
  reduceChainConversation,
  settleChainConversation,
  type ChainConversationStore,
} from "./lib/chains";
import { organizeModels, resolveNewSessionModelId, togglePinnedModelId } from "./lib/model-picker";
import { getModePresentation, type ModeKind } from "./lib/mode-presentation";
import { resolvePreferredModeId } from "./lib/mode-selection";
import {
  findAtTrigger,
  insertMentionAtTrigger,
  mentionDisplayText,
  mergeRootMentionOptions,
  rankSkillMentions,
  removePositionedMention,
  replaceDraftRange,
  splitMentionText,
  type PositionedMention,
} from "./lib/mentions";
import { InlineMentionEditor, type InlineMentionEditorHandle } from "./lib/inline-mention-editor";
import { resolveNewTaskCwd } from "./lib/workspace-context";
import { partitionSidebarSessions } from "./lib/sidebar-sessions";
import { clearSessionUnread, markBackgroundSessionUnread } from "./lib/session-attention";
import { confirmSessionRename, optimisticSessionRename, rollbackSessionRename } from "./lib/session-rename";
import {
  enqueueFollowUp,
  moveFollowUp,
  removeFollowUp,
  restoreFollowUp,
  takeFollowUp,
  updateFollowUp,
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
import { initialElicitationValues, validateElicitationValues } from "../shared/interactions";

interface Attachment extends ChatImage {
  name: string;
}

interface QueuedPrompt {
  text: string;
  images: ChatImage[];
  annotations?: ChatAnnotation[];
  mentions?: PositionedMention[];
}

interface MentionMenuOption {
  id: string;
  label: string;
  detail?: string;
  disabled?: boolean;
  category?: MentionKind;
  mention?: MentionRef;
}

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

interface PreviewImage extends ChatImage {
  alt: string;
}

type SidebarDragState =
  | { kind: "project"; id: string }
  | { kind: "session"; id: string; groupKey: SidebarSessionGroupKey };

type SidebarDragSnapshot =
  | { kind: "project"; id: string; original: WorkspaceItem[] }
  | { kind: "session"; id: string; groupKey: SidebarSessionGroupKey; original: SessionSummary[] };

const PROJECT_TASK_PREVIEW_COUNT = 4;
const SESSION_MENU_WIDTH = 176;
const SESSION_MENU_HEIGHT = 160;
const PROJECT_MENU_WIDTH = 176;
const PROJECT_MENU_HEIGHT = 88;
const SUPPORTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const DEVIN_GITHUB_URL = "https://github.com/zaleGZL/devin-agent";
const DEVIN_GITHUB_DISPLAY_URL = "github.com/zaleGZL/devin-agent";
const DEVIN_ISSUES_URL = `${DEVIN_GITHUB_URL}/issues`;
const DEVIN_ISSUES_DISPLAY_URL = `${DEVIN_GITHUB_DISPLAY_URL}/issues`;
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
      detail: [mention.description, mention.source].filter(Boolean).join(" · "),
      mention,
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
    const selected = await window.devinAgent.workspace.choose();
    if (!selected) return undefined;
    setWorkspaces(await window.devinAgent.workspace.recent());
    await createThreadInProject(selected);
    return selected;
  };

  const createNewThread = async () => {
    const projectPath = workspaceRef.current;
    await createThreadInProject(projectPath);
  };

  const createThreadInProject = async (projectPath?: string) => {
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
        </div>

        <div className="thread-list">
          {pinnedSessions.length > 0 && (
            <>
              <div className="section-label pinned-label">{t("sidebar.pinned")}</div>
              <div className="pinned-task-list">
                {pinnedSessions.map((session) => (
                  <div
                    key={session.path}
                    className={`recent-task-item pinned-task-item${session.path === activeSession ? " active" : ""}${runningSessionIds.has(session.path) || unreadSessionIds.has(session.path) ? " has-session-indicator" : ""}${sidebarDrag?.kind === "session" && sidebarDrag.id === session.id ? " dragging" : ""}`}
                    onContextMenu={(event) => openSessionMenu(event, session)}
                    onDragOver={(event) => dragSessionOver(event, session.id, "pinned")}
                    onDrop={(event) => void finishSidebarDrag(event)}
                  >
                    <button
                      type="button"
                      className="sidebar-drag-handle session-drag-handle"
                      draggable={!sessionQuery.trim() && renamingSessionId !== session.id}
                      disabled={Boolean(sessionQuery.trim()) || renamingSessionId === session.id}
                      onClick={(event) => event.stopPropagation()}
                      onDragStart={(event) => startSessionDrag(event, session, "pinned")}
                      onDragEnd={cancelSidebarDrag}
                      onKeyDown={(event) => void moveSessionByKeyboard(event, session, "pinned")}
                      aria-label={t("session.drag", { title: session.title })}
                      title={t("session.drag", { title: session.title })}
                    >
                      <GripVertical size={13} />
                    </button>
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
                        title={session.title}
                        aria-current={session.path === activeSession ? "page" : undefined}
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
                    onContextMenu={(event) => openProjectMenu(event, item)}
                    onDragOver={(event) => dragProjectOver(event, item.path)}
                    onDrop={(event) => void finishSidebarDrag(event)}
                  >
                    <button
                      type="button"
                      className="sidebar-drag-handle project-drag-handle"
                      draggable={!sessionQuery.trim() && renamingProjectPath !== item.path}
                      disabled={Boolean(sessionQuery.trim()) || renamingProjectPath === item.path}
                      onClick={(event) => event.stopPropagation()}
                      onDragStart={(event) => startProjectDrag(event, item)}
                      onDragEnd={cancelSidebarDrag}
                      onKeyDown={(event) => void moveProjectByKeyboard(event, item)}
                      aria-label={t("sidebar.dragProject", { project: item.name })}
                      title={t("sidebar.dragProject", { project: item.name })}
                    >
                      <GripVertical size={13} />
                    </button>
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
                        title={item.path}
                        aria-expanded={isExpanded}
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
                    <div className="project-task-list">
                      {visibleTasks.length === 0 && <div className="project-task-empty">{t("sidebar.noProjectTasks")}</div>}
                      {visibleTasks.map((session) => (
                        <div
                          key={session.path}
                          className={`project-task-item${session.path === activeSession ? " active" : ""}${runningSessionIds.has(session.path) || unreadSessionIds.has(session.path) ? " has-session-indicator" : ""}${sidebarDrag?.kind === "session" && sidebarDrag.id === session.id ? " dragging" : ""}`}
                          onContextMenu={(event) => openSessionMenu(event, session)}
                          onDragOver={(event) => dragSessionOver(event, session.id, `project:${item.path}`)}
                          onDrop={(event) => void finishSidebarDrag(event)}
                        >
                          <button
                            type="button"
                            className="sidebar-drag-handle session-drag-handle"
                            draggable={!sessionQuery.trim() && renamingSessionId !== session.id}
                            disabled={Boolean(sessionQuery.trim()) || renamingSessionId === session.id}
                            onClick={(event) => event.stopPropagation()}
                            onDragStart={(event) => startSessionDrag(event, session, `project:${item.path}`)}
                            onDragEnd={cancelSidebarDrag}
                            onKeyDown={(event) => void moveSessionByKeyboard(event, session, `project:${item.path}`)}
                            aria-label={t("session.drag", { title: session.title })}
                            title={t("session.drag", { title: session.title })}
                          >
                            <GripVertical size={13} />
                          </button>
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
                              title={session.title}
                              aria-current={session.path === activeSession ? "page" : undefined}
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
                className={`recent-task-item${session.path === activeSession ? " active" : ""}${runningSessionIds.has(session.path) || unreadSessionIds.has(session.path) ? " has-session-indicator" : ""}${sidebarDrag?.kind === "session" && sidebarDrag.id === session.id ? " dragging" : ""}`}
                onContextMenu={(event) => openSessionMenu(event, session)}
                onDragOver={(event) => dragSessionOver(event, session.id, "recent")}
                onDrop={(event) => void finishSidebarDrag(event)}
              >
                <button
                  type="button"
                  className="sidebar-drag-handle session-drag-handle"
                  draggable={!sessionQuery.trim() && renamingSessionId !== session.id}
                  disabled={Boolean(sessionQuery.trim()) || renamingSessionId === session.id}
                  onClick={(event) => event.stopPropagation()}
                  onDragStart={(event) => startSessionDrag(event, session, "recent")}
                  onDragEnd={cancelSidebarDrag}
                  onKeyDown={(event) => void moveSessionByKeyboard(event, session, "recent")}
                  aria-label={t("session.drag", { title: session.title })}
                  title={t("session.drag", { title: session.title })}
                >
                  <GripVertical size={13} />
                </button>
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
                  <button className="thread-row recent-task-row" onClick={() => void openSession(session)} title={session.title}>
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

      <main className="main-pane">
        <div className="thread-layout" ref={threadLayoutRef}>
          <div className="conversation-column">
            <header className="thread-header">
              <div className="header-left">
                {!sidebarOpen && <button className="icon-button sidebar-reveal" onClick={() => setSidebarOpen(true)} aria-label={t("sidebar.show")}><PanelLeft size={16} /></button>}
                <div className="thread-heading"><strong>{crop(activeTitle, 62)}</strong><span>{sessionLocked ? <Shield size={12} /> : workspace ? <GitBranch size={12} /> : <MessageSquareText size={12} />} {sessionLocked ? "Read-only Devin session" : workspaceName ?? t("status.regularTask")}</span></div>
              </div>
              <div className="header-actions">
                <button
                  type="button"
                  className="icon-button session-download-button"
                  onClick={() => void downloadSessionMarkdown()}
                  disabled={loading || running || messages.length === 0}
                  aria-label={t("session.downloadMarkdown")}
                  title={t("session.downloadMarkdown")}
                >
                  <Download size={16} />
                </button>
                {workspace && <button
                  className={`changes-toolbar-button${inspectorOpen && inspectorMode === "changes" ? " selected" : ""}`}
                  onClick={() => inspectorOpen && inspectorMode === "changes" ? closePreviewPanel() : showChangesPanel()}
                  aria-label={workspaceChanges?.branch ? t("changes.branchTitle", { branch: workspaceChanges.branch }) : t("changes.title")}
                  aria-pressed={inspectorOpen && inspectorMode === "changes"}
                  title={workspaceChanges?.branch ? t("changes.branchTitle", { branch: workspaceChanges.branch }) : t("changes.title")}
                >
                  <GitCompareArrows size={15} />
                  <span className="changes-toolbar-branch">{workspaceChanges?.branch ?? t("changes.title")}</span>
                  {workspaceChanges && workspaceChanges.changes.length > 0 && <small>{workspaceChanges.changes.length}</small>}
                </button>}
                {!inspectorOpen && workspace && <button
                  className="open-in-devin-button"
                  onClick={() => void openWorkspaceInDevin()}
                  aria-label={t("toolbar.openInDevin")}
                  title={t("toolbar.openInDevin")}
                >
                  <span className="devin-desktop-mark"><img src={devinDesktopIcon} alt="" /></span>
                </button>}
                {!inspectorOpen && ENABLE_CONVERSATION_CONTEXT && <button
                  className={`icon-button context-card-toggle ${contextCardOpen ? "selected" : ""}`}
                  onClick={() => {
                    const next = !contextCardOpen;
                    setContextCardOpen(next);
                    if (next) setInspectorOpen(false);
                  }}
                  aria-label={contextCardOpen ? t("toolbar.hideContext") : t("toolbar.showContext")}
                  aria-pressed={contextCardOpen}
                >
                  <ListFilter size={16} />
                </button>}
                {!inspectorOpen && <button
                  className="icon-button"
                  onClick={showPreviewPanel}
                  aria-label={t("toolbar.openSidebar")}
                  aria-pressed="false"
                >
                  <PanelRight size={17} />
                </button>}
              </div>
            </header>

            <section className={`conversation-pane${ENABLE_CONVERSATION_CONTEXT && contextCardOpen ? " context-card-visible" : ""}${activeFollowUps.length > 0 ? " has-follow-up-queue" : ""}`}>
            <div
              className="message-scroll"
              ref={scrollRef}
              onScroll={handleConversationScroll}
              onWheel={handleConversationWheel}
              onMouseUp={captureAnnotationSelection}
            >
              {loading ? (
                <div className="loading-state"><LoaderCircle className="spin" size={20} /><span>{t("status.openingWorkspace")}</span></div>
              ) : messages.length === 0 && !uiRequest && interactionRequests.length === 0 && !agentPlan ? (
                <EmptyState workspace={workspace} onSuggest={(value) => { setDraft(value); textareaRef.current?.focus(); }} />
              ) : (
                <div className="messages">
                  {conversationGroups.map((group) => (
                    group.type === "user"
                      ? <UserMessage key={group.id} message={group.message} onPreview={setPreviewImage} />
                      : <AssistantTurn
                          key={group.id}
                          messages={group.messages}
                          active={group.id === activeAssistantGroupId}
                          showReasoningProcess={showReasoningProcess}
                          onPreviewFile={(filePath) => void openFilePreview(filePath)}
                          onCopyError={() => setToast({ message: t("message.copyFailed"), type: "error" })}
                        />
                  ))}
                  {agentPlan && <EditablePlanCard plan={agentPlan} onSave={applyEditedPlan} />}
                  {running && !uiRequest && !activeAssistantHasWork && (
                    <div className="work-log active" role="status" aria-live="polite">
                      <div className="work-log-summary work-log-status">
                        <LoaderCircle className="spin work-log-spinner" size={14} aria-hidden="true" />
                        <span>{t("work.thinkingStatus")}</span>
                      </div>
                    </div>
                  )}
                  {uiRequest && (
                    <InlineExtensionRequest
                      key={uiRequest.id}
                      request={uiRequest}
                      tools={messages.flatMap((message) => message.tools)}
                      onRevisePlan={applyEditedMarkdownPlan}
                      onDone={() => setUiRequest(undefined)}
                      onError={(message) => setToast({ message, type: "error" })}
                    />
                  )}
                  {interactionRequests[0] && (
                    <DesktopInteractionCard
                      key={interactionRequests[0].id}
                      request={interactionRequests[0]}
                      queuedCount={interactionRequests.length - 1}
                      onError={(message) => setToast({ message, type: "error" })}
                    />
                  )}
                  {sideChatOpen && sideChatCommand && (
                    <SideChatPanel
                      command={sideChatCommand}
                      state={sideChatState}
                      enabled={sideChatEnabled}
                      onSend={(question) => void sendSideChat(question)}
                      onClose={() => setSideChatOpen(false)}
                    />
                  )}
                </div>
              )}
            </div>

            <div className="composer-wrap">
              <div className="composer-stack">
                {activeSession && activeFollowUps.length > 0 && (
                  <FollowUpQueue
                    items={activeFollowUps}
                    onMove={(draggedId, targetId) => setFollowUpQueue(activeSession, (queue) => moveFollowUp(queue, draggedId, targetId))}
                    onDelete={(itemId) => setFollowUpQueue(activeSession, (queue) => removeFollowUp(queue, itemId))}
                    onEdit={(itemId, text) => setFollowUpQueue(activeSession, (queue) => updateFollowUp(queue, itemId, (value) => ({ ...value, text })))}
                    onSendNow={(itemId) => void sendQueuedPromptNow(itemId)}
                  />
                )}
                {messages.length === 0 && (
                  <div className={`composer-workspace-context ${workspace ? "selected" : ""}`}>
                    <button
                      type="button"
                      className="composer-workspace"
                      onClick={() => void chooseWorkspace()}
                      disabled={loading || running}
                      title={workspace ?? t("composer.selectProject")}
                      aria-label={workspace ? t("composer.changeProject") : t("composer.selectProject")}
                    >
                      <FolderOpen size={15} />
                      <span>{workspaceName ?? t("composer.selectProject")}</span>
                    </button>
                    {workspace && (
                      <button
                        type="button"
                        className="composer-workspace-clear"
                        onClick={() => void clearWorkspace()}
                        disabled={loading || running}
                        title={t("composer.clearProject")}
                        aria-label={t("composer.clearProject")}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                )}
                <div className={`composer ${running ? "composer-running" : ""}`}>
                  {draftAnnotations.length > 0 && (
                    <div className="annotation-chip-wrap">
                      <div className="annotation-preview" role="tooltip">
                        {draftAnnotations.map((annotation, index) => (
                          <div className="annotation-preview-item" key={annotation.id}>
                            <strong>{index + 1}. {t("annotation.selectedText")}</strong>
                            <p>{annotation.text}</p>
                            {annotation.comment && <small>{t("annotation.comment")}: {annotation.comment}</small>}
                          </div>
                        ))}
                      </div>
                      <div className="annotation-chip">
                        <MessageSquareQuote size={14} aria-hidden="true" />
                        <span>{t("annotation.count", { count: draftAnnotations.length })}</span>
                        <button type="button" onClick={() => removeDraftAnnotation()} aria-label={t("annotation.removeAll")}>
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                  {attachments.length > 0 && (
                    <div className="attachment-strip">
                      {attachments.map((attachment, index) => (
                        <div className="attachment-preview" key={`${attachment.name}-${index}`}>
                          <button
                            type="button"
                            className="attachment-thumbnail"
                            onClick={() => setPreviewImage({ ...attachment, alt: attachment.name })}
                            title={attachment.name}
                          >
                            <img src={imageDataUrl(attachment)} alt={attachment.name} />
                          </button>
                          <button
                            type="button"
                            className="attachment-remove"
                            onClick={() => setAttachments((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                            aria-label={t("composer.removeImage")}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <InlineMentionEditor
                    ref={textareaRef}
                    value={draft}
                    mentions={draftMentions}
                    onChange={handleDraftChange}
                    onKeyDown={handleComposerKeyDown}
                    onPaste={handleComposerPaste}
                    onCompositionStart={() => { composingRef.current = true; }}
                    onCompositionEnd={(value, mentions, caret) => {
                      composingRef.current = false;
                      handleDraftChange(value, mentions, caret);
                      const trigger = findAtTrigger(value, caret, mentions);
                      setMentionMenu((current) => trigger ? { ...current, activeIndex: 0 } : undefined);
                    }}
                    onBlur={() => {
                      if (mentionBlurTimerRef.current !== undefined) window.clearTimeout(mentionBlurTimerRef.current);
                      mentionBlurTimerRef.current = window.setTimeout(() => {
                        setMentionMenu(undefined);
                        mentionBlurTimerRef.current = undefined;
                      }, 100);
                    }}
                    aria-autocomplete="list"
                    aria-expanded={Boolean(mentionMenu)}
                    aria-controls={mentionMenu ? "composer-mention-listbox" : undefined}
                    aria-activedescendant={mentionMenu && mentionOptions[mentionMenu.activeIndex] ? `mention-option-${mentionOptions[mentionMenu.activeIndex]!.id}` : undefined}
                    placeholder={sessionLocked ? "This Devin session is locked and read-only." : running ? t("composer.runningPrompt") : t("composer.prompt")}
                    disabled={sessionLocked}
                  />
                  {mentionMenu && mentionTrigger && (
                    <div className="mention-menu" role="dialog" aria-label={t("mentions.menu")}>
                      {mentionMenu.category && (
                        <button
                          type="button"
                          className="mention-menu-back"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => setMentionMenu({ activeIndex: 0 })}
                        >← {mentionMenu.category === "file" ? t("mentions.files") : mentionMenu.category === "directory" ? t("mentions.directories") : t("mentions.skills")}</button>
                      )}
                      <div id="composer-mention-listbox" className="mention-menu-list" role="listbox">
                        {mentionLoading && <div className="mention-menu-state"><LoaderCircle className="spin" size={14} />{t("mentions.loading")}</div>}
                        {!mentionLoading && mentionError && <div className="mention-menu-state error">{mentionError}</div>}
                        {!mentionLoading && !mentionError && mentionOptions.length === 0 && <div className="mention-menu-state">{t("mentions.empty")}</div>}
                        {!mentionLoading && !mentionError && mentionOptions.map((option, index) => (
                          <button
                            type="button"
                            id={`mention-option-${option.id}`}
                            role="option"
                            aria-selected={index === mentionMenu.activeIndex}
                            aria-disabled={option.disabled || undefined}
                            disabled={option.disabled}
                            className={index === mentionMenu.activeIndex ? "active" : ""}
                            key={option.id}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setMentionMenu((current) => current ? { ...current, activeIndex: index } : current)}
                            onClick={() => selectMentionOption(option)}
                          >
                            <span className="mention-menu-icon">
                              {(option.category ?? option.mention?.kind) === "file" ? <FileIcon size={16} /> : (option.category ?? option.mention?.kind) === "directory" ? <Folder size={16} /> : <Sparkles size={16} />}
                            </span>
                            <span className="mention-menu-copy"><strong>{option.label}</strong>{option.detail && <small>{option.detail}</small>}</span>
                            {option.category && <ChevronRight size={15} />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="composer-toolbar">
                    <div className="composer-tools">
                      {imagePromptEnabled && !sessionLocked && (
                        <AttachmentMenu onChange={(event) => void handleAttachment(event)} />
                      )}
                      <PermissionPicker
                        value={permission}
                        modes={availableModes}
                        updating={permissionUpdating}
                        disabled={sessionLocked || availableModes.length === 0}
                        onChange={(value) => void changePermission(value)}
                      />
                    </div>
                    <div className="composer-actions">
                      <ModelPicker
                        model={model}
                        models={availableModels}
                        pinnedModelIds={pinnedModelIds}
                        onChange={(value) => void changeModel(value)}
                        onPinnedModelIdsChange={(value) => void changePinnedModelIds(value)}
                      />
                      <button
                        className={`send-button ${running ? "stop-button" : ""}`}
                        onClick={() => running && !draft.trim() && attachments.length === 0 && draftAnnotations.length === 0 && draftMentions.length === 0 ? void stopAgent() : void sendMessage()}
                        disabled={sessionLocked || (!running && !draft.trim() && attachments.length === 0 && draftAnnotations.length === 0 && draftMentions.length === 0)}
                        aria-label={running ? t("composer.sendOrStop") : t("composer.send")}
                      >
                        {running && !draft.trim() && attachments.length === 0 && draftAnnotations.length === 0 && draftMentions.length === 0 ? <CircleStop size={17} /> : <ArrowUp size={17} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="composer-caption">{t("composer.caption")}</div>
            </div>
            {ENABLE_CONVERSATION_CONTEXT && contextCardOpen && (
              <ContextCard
                stats={sessionStats}
                contextWindow={selectedModel?.contextWindow}
                provider={provider}
                model={model}
                running={running}
              />
            )}
            </section>
          </div>

          {inspectorOpen && (
            <>
              <div
                className="inspector-resizer"
                role="separator"
                aria-label={t("toolbar.resizeSidebar")}
                aria-orientation="vertical"
                aria-valuemin={MIN_INSPECTOR_WIDTH}
                aria-valuemax={MAX_INSPECTOR_WIDTH}
                aria-valuenow={Math.round(inspectorWidth)}
                tabIndex={0}
                onPointerDown={startInspectorResize}
                onKeyDown={resizeInspectorByKeyboard}
                onDoubleClick={() => setInspectorWidth(DEFAULT_INSPECTOR_WIDTH)}
              />
              {inspectorMode === "changes" ? (
                <ChangesPanel
                  width={inspectorWidth}
                  snapshot={workspaceChanges}
                  selectedChange={selectedChange}
                  diff={workspaceDiff}
                  loading={changesLoading}
                  error={changesError}
                  onRefresh={() => selectedChange ? void openWorkspaceDiff(selectedChange) : void refreshWorkspaceChanges()}
                  onSelect={(change) => void openWorkspaceDiff(change)}
                  onBack={() => {
                    changesDiffRequestRef.current += 1;
                    setSelectedChange(undefined);
                    setWorkspaceDiff(undefined);
                    setChangesError(undefined);
                    setChangesLoading(false);
                    void refreshWorkspaceChanges();
                  }}
                  onClose={closePreviewPanel}
                />
              ) : (
                <FilePreviewPanel
                  width={inspectorWidth}
                  preview={filePreview}
                  loading={previewLoading}
                  error={previewError}
                  recentFiles={recentPreviewFiles}
                  onChoose={() => void choosePreviewFile()}
                  onPreview={(filePath) => void openFilePreview(filePath)}
                  onRefresh={() => filePreview && void openFilePreview(filePreview.path)}
                  onOpenExternal={() => filePreview && void window.devinAgent.files.openPreview(filePreview.id).catch((error) => {
                    setToast({ message: cleanError(error instanceof Error ? error.message : String(error)), type: "error" });
                  })}
                  onClose={closePreviewPanel}
                />
              )}
            </>
          )}
        </div>
      </main>

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
              activeCwdRef.current,
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
    </div>
  );
}

function ContextCard({
  stats,
  contextWindow,
  provider,
  model,
  running,
}: {
  stats?: AgentSessionStats;
  contextWindow?: number;
  provider: ProviderId;
  model: string;
  running: boolean;
}) {
  const { t } = useI18n();
  const reportedContext = stats?.contextUsage;
  const capacity = reportedContext?.contextWindow ?? contextWindow;
  const used = reportedContext?.tokens ?? null;
  const calculatedPercent = used !== null && capacity ? (used / capacity) * 100 : null;
  const contextPercent = clampPercent(reportedContext?.percent ?? calculatedPercent);
  const remaining = used !== null && capacity ? Math.max(0, capacity - used) : null;
  const promptTokens = stats
    ? stats.tokens.input + stats.tokens.cacheRead + stats.tokens.cacheWrite
    : 0;
  const cacheRate = promptTokens > 0
    ? clampPercent((stats!.tokens.cacheRead / promptTokens) * 100)
    : null;
  const hasUsage = Boolean(stats && stats.tokens.total > 0);

  return (
    <aside className="context-rail" aria-label={t("context.title")}>
      <section className={`context-card${running ? " active" : ""}`}>
        <header className="context-card-header">
          <span><Gauge size={15} /> <strong>{t("context.title")}</strong></span>
          {running && <i className="context-live-dot" aria-label={t("status.working")} />}
        </header>

        <div className="context-capacity">
          <div
            className={`context-ring${contextPercent === null ? " empty" : ""}`}
            aria-label={`${t("context.capacity")}: ${formatPercent(contextPercent)}`}
          >
            <svg viewBox="0 0 42 42" aria-hidden="true">
              <circle className="context-ring-track" cx="21" cy="21" r="17" pathLength="100" />
              <circle
                className="context-ring-value"
                cx="21"
                cy="21"
                r="17"
                pathLength="100"
                strokeDasharray={`${contextPercent ?? 0} 100`}
              />
            </svg>
            <span><strong>{formatPercent(contextPercent)}</strong><small>{t("context.used")}</small></span>
          </div>
          <div className="context-capacity-copy">
            <span>{t("context.capacity")}</span>
            <strong title={used === null ? undefined : used.toLocaleString()}>
              {formatCompactTokens(used)} <small>/ {formatCompactTokens(capacity)}</small>
            </strong>
            <small>{remaining === null ? t("context.empty") : t("context.remaining", { tokens: formatCompactTokens(remaining) })}</small>
          </div>
        </div>

        <div className="context-card-section">
          <div className="context-section-heading">
            <span>{t("context.total")}</span>
            <strong title={stats?.tokens.total.toLocaleString()}>{formatCompactTokens(stats?.tokens.total)}</strong>
          </div>
          <div className="context-token-grid">
            <div><span>{t("context.input")}</span><strong title={stats?.tokens.input.toLocaleString()}>{formatCompactTokens(stats?.tokens.input)}</strong></div>
            <div><span>{t("context.output")}</span><strong title={stats?.tokens.output.toLocaleString()}>{formatCompactTokens(stats?.tokens.output)}</strong></div>
          </div>
        </div>

        <div className="context-card-section context-cache-section">
          <div className="context-section-heading">
            <span>{t("context.cache")}</span>
            <strong>{formatPercent(cacheRate)}</strong>
          </div>
          <div className="context-cache-track" aria-hidden="true"><span style={{ width: `${cacheRate ?? 0}%` }} /></div>
          <div className="context-cache-values">
            <span>{t("context.cacheRead")} <strong>{formatCompactTokens(stats?.tokens.cacheRead)}</strong></span>
            <span>{t("context.cacheWrite")} <strong>{formatCompactTokens(stats?.tokens.cacheWrite)}</strong></span>
          </div>
        </div>

        <footer className="context-card-footer">
          <div><span>{t("context.model")}</span><strong title={`${provider}/${model}`}>{shortModel(model)}</strong></div>
          <div><span>{t("context.cost")}</span><strong>{hasUsage ? formatCost(stats?.cost ?? 0) : "—"}</strong></div>
        </footer>
      </section>
    </aside>
  );
}

function EmptyState({ workspace, onSuggest }: { workspace?: string; onSuggest(value: string): void }) {
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

function UserMessage({ message, onPreview }: { message: ChatMessage; onPreview(image: PreviewImage): void }) {
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

function FollowUpQueue({
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

function ImageLightbox({ image, onClose }: { image: PreviewImage; onClose(): void }) {
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

function AssistantTurn({
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

function MarkdownContent({ text, className = "markdown-body", onPreviewFile }: { text: string; className?: string; onPreviewFile?(filePath: string): void }) {
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

function ChangesPanel(props: {
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

function FilePreviewPanel(props: {
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

function ProfileAvatar({ profile, className }: { profile: UserProfile; className: string }) {
  return (
    <span className={className} aria-hidden="true">
      {profile.avatarDataUrl
        ? <img src={profile.avatarDataUrl} alt="" />
        : profileInitials(profile.nickname)}
    </span>
  );
}

function ProjectRemovalDialog({
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

function SettingsDialog(props: {
  providers: ProviderStatus[];
  model: string;
  models: AgentSnapshot["models"];
  pinnedModelIds: string[];
  permission: PermissionMode;
  modes: NonNullable<AgentSnapshot["modes"]>;
  colorScheme: ColorSchemePreference;
  profile: UserProfile;
  showReasoningProcess: boolean;
  sessions: SessionSummary[];
  runningSessionIds: Set<string>;
  onClose(): void;
  onRefresh(): Promise<void>;
  onConnected(value: ProviderId): Promise<void>;
  onPermission(value: PermissionMode): void;
  onPinnedModelIdsChange(value: string[]): void;
  onColorScheme(preference: ColorSchemePreference): void;
  onProfile(profile: UserProfile): Promise<void>;
  onShowReasoningProcess(value: boolean): Promise<void>;
  onRestoreSession(session: SessionSummary): Promise<void>;
  onOpenSession(session: SessionSummary): Promise<void>;
  onAuthStart(): void;
  consumeAuthCancellation(): boolean;
  onToast(message: string, type?: "info" | "error"): void;
}) {
  const { language, locale, setLanguage, t } = useI18n();
  const [section, setSection] = useState<"general" | "models" | "agent" | "appearance" | "archived" | "about">("general");
  const [busy, setBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [reasoningPreferenceBusy, setReasoningPreferenceBusy] = useState(false);
  const [profileNickname, setProfileNickname] = useState(props.profile.nickname);
  const [profileAvatar, setProfileAvatar] = useState(props.profile.avatarDataUrl);
  const [cliPath, setCliPath] = useState("");
  const [detectedCliPath, setDetectedCliPath] = useState("");
  const [modelQuery, setModelQuery] = useState("");
  const [cliUpdateStatus, setCliUpdateStatus] = useState<DevinCliUpdateStatus>();
  const [cliUpdateChecking, setCliUpdateChecking] = useState(false);
  const [cliUpdating, setCliUpdating] = useState(false);
  const cliUpdateRequestRef = useRef(0);
  const selectedProvider = props.providers.find((provider) => provider.id === "devin") ?? props.providers[0];
  const organizedModels = useMemo(
    () => organizeModels(props.models, props.pinnedModelIds, modelQuery),
    [modelQuery, props.models, props.pinnedModelIds],
  );
  const visibleModelCount = organizedModels.pinned.length + organizedModels.others.length;
  const cliPathChanged = cliPath.trim() !== detectedCliPath;
  const runtimeBusy = busy || cliUpdating;
  const archivedSessions = useMemo(
    () => props.sessions.filter((session) => session.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [props.sessions],
  );

  useEffect(() => {
    void window.devinAgent.settings.getDevinCliPath().then((value) => {
      const nextPath = value ?? selectedProvider?.binaryPath ?? "";
      setCliPath(nextPath);
      setDetectedCliPath(nextPath);
    });
  }, [selectedProvider?.binaryPath]);

  const refreshCliUpdateStatus = useCallback(async () => {
    const requestId = ++cliUpdateRequestRef.current;
    if (!selectedProvider?.configured) {
      setCliUpdateStatus(undefined);
      setCliUpdateChecking(false);
      return;
    }
    setCliUpdateChecking(true);
    try {
      const status = await window.devinAgent.settings.getDevinCliUpdateStatus();
      if (requestId === cliUpdateRequestRef.current) setCliUpdateStatus(status);
    } catch (error) {
      if (requestId === cliUpdateRequestRef.current) setCliUpdateStatus({
        currentVersion: selectedProvider.version ?? "",
        state: "unavailable",
        checkedAt: new Date().toISOString(),
        message: cleanError(error instanceof Error ? error.message : String(error)),
      });
    } finally {
      if (requestId === cliUpdateRequestRef.current) setCliUpdateChecking(false);
    }
  }, [selectedProvider?.configured, selectedProvider?.version]);

  useEffect(() => {
    if (section !== "models") return;
    void refreshCliUpdateStatus();
  }, [refreshCliUpdateStatus, section, selectedProvider?.binaryPath]);

  const connect = async () => {
    setBusy(true);
    try {
      props.onAuthStart();
      const providerId = selectedProvider?.id ?? "devin";
      const connected = await window.devinAgent.auth.login(providerId);
      if (props.consumeAuthCancellation() || !connected) return;
      await props.onConnected(providerId);
      props.onToast(t("settings.providerConnected", { provider: selectedProvider?.name ?? providerId }));
    } catch (error) {
      if (props.consumeAuthCancellation() || isAuthPromptCancelledError(error)) return;
      props.onToast(cleanError(error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setBusy(false);
    }
  };

  const saveCliPath = async (value: string | null) => {
    setBusy(true);
    try {
      const status = await window.devinAgent.settings.setDevinCliPath(value);
      const nextPath = status.binaryPath ?? "";
      setCliPath(nextPath);
      setDetectedCliPath(nextPath);
      await props.onRefresh();
      props.onToast(`Devin CLI ${status.version ?? ""} detected.`.trim());
    } catch (error) {
      props.onToast(cleanError(error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setBusy(false);
    }
  };

  const chooseCliPath = async () => {
    setBusy(true);
    try {
      const status = await window.devinAgent.settings.chooseDevinCliPath();
      if (!status) return;
      const nextPath = status.binaryPath ?? "";
      setCliPath(nextPath);
      setDetectedCliPath(nextPath);
      await props.onRefresh();
      props.onToast(`Devin CLI ${status.version ?? ""} detected.`.trim());
    } catch (error) {
      props.onToast(cleanError(error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setBusy(false);
    }
  };

  const reconnect = async () => {
    setBusy(true);
    try {
      await window.devinAgent.agent.command("reconnect");
      await props.onRefresh();
      props.onToast("Devin ACP reconnected.");
    } catch (error) {
      props.onToast(cleanError(error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setBusy(false);
    }
  };

  const updateCli = async () => {
    setCliUpdating(true);
    try {
      const status = await window.devinAgent.settings.updateDevinCli();
      setCliUpdateStatus(status);
      await props.onRefresh();
      props.onToast(t("settings.cliUpdated", { version: status.currentVersion }));
    } catch (error) {
      props.onToast(cleanError(error instanceof Error ? error.message : String(error)), "error");
      await refreshCliUpdateStatus();
    } finally {
      setCliUpdating(false);
    }
  };

  const changeLanguage = async (next: LanguagePreference) => {
    try {
      await setLanguage(next);
    } catch (error) {
      props.onToast(cleanError(error instanceof Error ? error.message : String(error)), "error");
    }
  };

  const changeAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) throw new Error("invalid avatar");
      setProfileAvatar(await fileToAvatarDataUrl(file));
    } catch {
      props.onToast(t("settings.avatarInvalid"), "error");
    }
  };

  const saveProfile = async () => {
    const nickname = profileNickname.trim();
    if (!nickname) return;
    setProfileBusy(true);
    try {
      await props.onProfile({ nickname, ...(profileAvatar ? { avatarDataUrl: profileAvatar } : {}) });
      setProfileNickname(nickname);
      props.onToast(t("settings.profileSaved"));
    } catch (error) {
      props.onToast(cleanError(error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setProfileBusy(false);
    }
  };

  const changeShowReasoningProcess = async (value: boolean) => {
    setReasoningPreferenceBusy(true);
    try {
      await props.onShowReasoningProcess(value);
    } catch (error) {
      props.onToast(cleanError(error instanceof Error ? error.message : String(error)), "error");
    } finally {
      setReasoningPreferenceBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <div className="settings-dialog">
        <button className="icon-button modal-close" onClick={props.onClose} aria-label={t("common.close")}><X size={17} /></button>
        <aside>
          <div className="settings-title">{t("settings.title")}</div>
          <button className={section === "general" ? "active" : ""} onClick={() => setSection("general")}><Languages size={16} /> {t("settings.general")}</button>
          <button className={section === "models" ? "active" : ""} onClick={() => setSection("models")}><Bot size={16} /> {t("settings.models")}</button>
          <button className={section === "agent" ? "active" : ""} onClick={() => setSection("agent")}><TerminalSquare size={16} /> {t("settings.agent")}</button>
          <button className={section === "appearance" ? "active" : ""} onClick={() => setSection("appearance")}><Sun size={16} /> {t("settings.appearance")}</button>
          <button className={section === "archived" ? "active" : ""} onClick={() => setSection("archived")}><Archive size={16} /> {t("settings.archived")}</button>
          <button className={section === "about" ? "active" : ""} onClick={() => setSection("about")}><Info size={16} /> {t("settings.about")}</button>
        </aside>
        <section className="settings-content">
          {section === "general" && <>
            <h2>{t("settings.general")}</h2><p>{t("settings.generalDescription")}</p>
            <div className="profile-editor">
              <label className="profile-avatar-picker">
                <ProfileAvatar profile={{ nickname: profileNickname || props.profile.nickname, ...(profileAvatar ? { avatarDataUrl: profileAvatar } : {}) }} className="profile-avatar-preview" />
                <span><ImagePlus size={14} /> {t("settings.changeAvatar")}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void changeAvatar(event)} />
              </label>
              <div className="profile-fields">
                <label>
                  <span>{t("settings.nickname")}</span>
                  <input value={profileNickname} maxLength={60} onChange={(event) => setProfileNickname(event.target.value)} />
                </label>
                <small>{t("settings.nicknameDescription")}</small>
                <div className="profile-actions">
                  {profileAvatar && <button className="danger-link" onClick={() => setProfileAvatar(undefined)}><Trash2 size={14} /> {t("settings.removeAvatar")}</button>}
                  <button className="primary-button" disabled={profileBusy || !profileNickname.trim()} onClick={() => void saveProfile()}>
                    {profileBusy && <LoaderCircle className="spin" size={14} />}
                    {t("settings.saveProfile")}
                  </button>
                </div>
              </div>
            </div>
            <label className="setting-row">
              <span><strong>{t("settings.language")}</strong><small>{t("settings.languageDescription")}</small></span>
              <select value={language} onChange={(event) => void changeLanguage(event.target.value as LanguagePreference)}>
                <option value="system">{t("settings.languageSystem")}</option>
                <option value="zh-CN">{t("settings.languageZhCN")}</option>
                <option value="en">{t("settings.languageEnglish")}</option>
              </select>
            </label>
            <label className="setting-row">
              <span><strong>{t("settings.showReasoningProcess")}</strong><small>{t("settings.showReasoningProcessDescription")}</small></span>
              <input
                className="setting-switch"
                type="checkbox"
                role="switch"
                checked={props.showReasoningProcess}
                disabled={reasoningPreferenceBusy}
                onChange={(event) => void changeShowReasoningProcess(event.target.checked)}
              />
            </label>
          </>}
          {section === "models" && <>
            <h2>{t("settings.modelsTitle")}</h2><p>{t("settings.credentialsDescription")}</p>
            <div className="cli-runtime-card">
              <div className="cli-runtime-header">
                <span className="cli-runtime-icon"><TerminalSquare size={17} /></span>
                <span className="cli-runtime-copy">
                  <strong>{selectedProvider?.name ?? "Devin CLI"}</strong>
                  <small>{selectedProvider?.configured ? t("settings.cliDetectedVersion", { version: selectedProvider.version ?? "" }) : t("settings.connectProvider")}</small>
                </span>
                {!selectedProvider?.configured ? (
                  <span className="cli-status">{t("settings.notConnected")}</span>
                ) : (
                  <span className="cli-update-control" aria-live="polite">
                    {cliUpdateChecking ? (
                      <span className="cli-update-checking"><LoaderCircle className="spin" size={13} />{t("settings.cliCheckingUpdate")}</span>
                    ) : cliUpdateStatus?.state === "available" ? (
                      <>
                        <span className="cli-latest-version">{t("settings.cliLatestVersion", { version: cliUpdateStatus.latestVersion ?? "" })}</span>
                        <button type="button" className="cli-update-button" disabled={runtimeBusy} onClick={() => void updateCli()}>
                          {cliUpdating ? <LoaderCircle className="spin" size={13} /> : <ArrowUp size={13} />}
                          {cliUpdating ? t("settings.cliUpdating") : t("settings.cliUpdateNow")}
                        </button>
                      </>
                    ) : cliUpdateStatus?.state === "latest" ? (
                      <span className="cli-update-latest"><Check size={13} />{t("settings.cliLatest")}</span>
                    ) : (
                      <button type="button" className="cli-update-retry" disabled={cliUpdateChecking} title={cliUpdateStatus?.message} onClick={() => void refreshCliUpdateStatus()}>{t("settings.cliRecheckUpdate")}</button>
                    )}
                  </span>
                )}
              </div>
              <p className="credential-note">{t("settings.cliAuthenticationNote")}</p>
              <label className="cli-path-field">
                <span>{t("settings.cliExecutable")}</span>
                <span className="settings-input-shell">
                  <TerminalSquare size={15} aria-hidden="true" />
                  <input value={cliPath} spellCheck={false} placeholder="/absolute/path/to/devin" onChange={(event) => setCliPath(event.target.value)} />
                  <button type="button" disabled={runtimeBusy} onClick={() => void chooseCliPath()}><FolderOpen size={14} />{t("settings.chooseExecutable")}</button>
                </span>
              </label>
              <div className="cli-runtime-actions">
                <button type="button" className="secondary-button" disabled={runtimeBusy || !cliPath.trim() || !cliPathChanged} onClick={() => void saveCliPath(cliPath.trim())}>{t("settings.saveAndDetect")}</button>
                <button type="button" className="secondary-button" disabled={runtimeBusy || !selectedProvider?.configured} onClick={() => void reconnect()}>{t("settings.reconnect")}</button>
                <button type="button" className="primary-button" disabled={runtimeBusy || !selectedProvider?.configured} onClick={() => void connect()}>{busy && <LoaderCircle className="spin" size={14} />}{t("settings.authenticate")}</button>
              </div>
            </div>
            <section className="settings-model-catalog">
              <div className="settings-model-heading">
                <span><strong>{t("settings.availableModels")}</strong><small>{t("settings.availableModelsDescription")}</small></span>
                <label className="settings-model-search">
                  <Search size={14} aria-hidden="true" />
                  <input value={modelQuery} onChange={(event) => setModelQuery(event.target.value)} placeholder={t("model.search")} aria-label={t("model.search")} />
                  <span>{visibleModelCount}</span>
                </label>
              </div>
              <div className="settings-model-list">
                {organizedModels.pinned.length > 0 && <>
                  <div className="settings-model-section-label">{t("model.pinned")}</div>
                  {organizedModels.pinned.map((item) => (
                    <SettingsModelRow key={item.id} model={item} current={item.id === props.model} pinned onTogglePin={() => props.onPinnedModelIdsChange(togglePinnedModelId(props.pinnedModelIds, item.id))} />
                  ))}
                </>}
                {organizedModels.others.length > 0 && <>
                  <div className="settings-model-section-label">{t("model.all")}</div>
                  {organizedModels.others.map((item) => (
                    <SettingsModelRow key={item.id} model={item} current={item.id === props.model} pinned={false} onTogglePin={() => props.onPinnedModelIdsChange(togglePinnedModelId(props.pinnedModelIds, item.id))} />
                  ))}
                </>}
                {visibleModelCount === 0 && <div className="settings-model-empty">{props.models.length === 0 ? t("settings.modelsUnavailable") : t("model.noResults")}</div>}
              </div>
            </section>
          </>}
          {section === "agent" && <>
            <h2>{t("settings.agentTitle")}</h2><p>{t("settings.agentDescription")}</p>
            <label className="setting-row"><span><strong>{t("settings.sessionMode")}</strong><small>{t("settings.sessionModeDescription")}</small></span><select value={props.permission} disabled={props.modes.length === 0} onChange={(event) => props.onPermission(event.target.value)}>{props.modes.length === 0 && <option value="">{t("settings.sessionModeUnavailable")}</option>}{props.modes.map((mode) => <option key={mode.id} value={mode.id}>{getModePresentation(mode, locale).label}</option>)}</select></label>
            <div className="setting-row"><span><strong>{t("settings.sandbox")}</strong><small>{window.devinAgent.platform === "win32" ? t("settings.sandboxWindowsDescription") : window.devinAgent.platform === "linux" ? t("settings.sandboxLinuxDescription") : t("settings.sandboxMacDescription")}</small></span><strong>{t("settings.sandboxCliManaged")}</strong></div>
          </>}
          {section === "appearance" && <>
            <h2>{t("settings.appearance")}</h2>
            <p>{t("settings.appearanceDescription")}</p>
            <section className="appearance-mode-section">
              <div className="appearance-mode-heading">
                <strong>{t("settings.colorMode")}</strong>
                <small>{t("settings.colorModeDescription")}</small>
              </div>
              <div className="appearance-mode-options" role="radiogroup" aria-label={t("settings.colorMode")}>
                {([
                  { value: "system", icon: Monitor, label: t("settings.auto"), description: t("settings.followsSystem") },
                  { value: "light", icon: Sun, label: t("settings.light"), description: t("settings.alwaysLight") },
                  { value: "dark", icon: Moon, label: t("settings.dark"), description: t("settings.alwaysDark") },
                ] satisfies Array<{ value: ColorSchemePreference; icon: typeof Sun; label: string; description: string }>).map((option) => {
                  const Icon = option.icon;
                  const selected = props.colorScheme === option.value;
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`appearance-mode-option${selected ? " selected" : ""}`}
                      key={option.value}
                      onClick={() => props.onColorScheme(option.value)}
                    >
                      <span className="appearance-mode-icon"><Icon size={17} /></span>
                      <span className="appearance-mode-copy"><strong>{option.label}</strong><small>{option.description}</small></span>
                      <span className="appearance-mode-check">{selected && <Check size={13} strokeWidth={2.5} />}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </>}
          {section === "archived" && <>
            <h2>{t("settings.archivedTitle")}</h2>
            <p>{t("settings.archivedDescription")}</p>
            <div className="archived-session-list">
              {archivedSessions.length === 0 && (
                <div className="archived-session-empty"><Archive size={20} /><strong>{t("settings.archivedEmpty")}</strong><span>{t("settings.archivedEmptyDescription")}</span></div>
              )}
              {archivedSessions.map((session) => (
                <div className="archived-session-row" key={session.id}>
                  <button type="button" className="archived-session-open" onClick={() => void props.onOpenSession(session)}>
                    <span><strong>{session.title}</strong><small>{session.cwd}</small></span>
                    <time>{relativeTime(session.updatedAt, locale, t("status.now"))}</time>
                    {props.runningSessionIds.has(session.path) && <LoaderCircle className="spin" size={13} aria-label={t("status.running")} />}
                  </button>
                  <button type="button" className="secondary-button archived-session-restore" onClick={() => void props.onRestoreSession(session)}><ArchiveRestore size={14} />{t("settings.restoreSession")}</button>
                </div>
              ))}
            </div>
          </>}
          {section === "about" && (
            <div className="about-panel">
              <span className="brand-mark about"><span /></span>
              <h2>Devin Agent Desktop</h2>
              <p>{t("settings.aboutTagline")}</p>
              <div className="about-links">
                <button type="button" title={DEVIN_GITHUB_URL} onClick={() => void window.devinAgent.app.openExternal(DEVIN_GITHUB_URL)}>
                  <span className="about-link-icon"><GitFork size={17} /></span>
                  <span><strong>{t("settings.githubRepository")}</strong><small>{DEVIN_GITHUB_DISPLAY_URL}</small></span>
                  <ExternalLink size={14} />
                </button>
                <button type="button" title={DEVIN_ISSUES_URL} onClick={() => void window.devinAgent.app.openExternal(DEVIN_ISSUES_URL)}>
                  <span className="about-link-icon"><MessageSquareWarning size={17} /></span>
                  <span><strong>{t("settings.reportIssue")}</strong><small>{DEVIN_ISSUES_DISPLAY_URL}</small></span>
                  <ExternalLink size={14} />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function SettingsModelRow({
  model,
  current,
  pinned,
  onTogglePin,
}: {
  model: AgentSnapshot["models"][number];
  current: boolean;
  pinned: boolean;
  onTogglePin(): void;
}) {
  const { t } = useI18n();
  const name = model.name ?? model.id;
  return (
    <div className={`settings-model-row ${current ? "current" : ""}`}>
      <span className="settings-model-copy">
        <strong>{name}</strong>
        <small>{model.id}</small>
      </span>
      {current && <span className="settings-model-current">{t("settings.currentModel")}</span>}
      <button
        type="button"
        className={`settings-model-pin ${pinned ? "pinned" : ""}`}
        aria-label={t(pinned ? "model.unpin" : "model.pin", { model: name })}
        aria-pressed={pinned}
        title={t(pinned ? "model.unpin" : "model.pin", { model: name })}
        onClick={onTogglePin}
      >
        <Pin size={14} fill={pinned ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

function CommandPalette({ availableCommands, onRunCommand, onClose, onNew, onOpen, onSettings, onInspector }: { availableCommands: AvailableCommand[]; onRunCommand(command: AvailableCommand): void; onClose(): void; onNew(): void; onOpen(): void; onSettings(): void; onInspector(): void }) {
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

function SessionSearchDialog({
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

function SideChatPanel({
  command,
  state,
  enabled,
  onSend,
  onClose,
}: {
  command: AvailableCommand;
  state?: ChainConversationStore[string];
  enabled: boolean;
  onSend(question: string): void;
  onClose(): void;
}) {
  const { t } = useI18n();
  const [question, setQuestion] = useState("");
  const input = command.input && typeof command.input === "object" && !Array.isArray(command.input)
    ? command.input as Record<string, unknown>
    : {};
  const hint = typeof input.hint === "string" ? input.hint : t("sideChat.placeholder");
  const submit = () => {
    if (!question.trim() || state?.running || !enabled) return;
    onSend(question.trim());
    setQuestion("");
  };
  return (
    <section className="side-chat-panel" aria-label={t("sideChat.title")}>
      <header>
        <span><MessageSquareQuote size={15} /><strong>/{command.name.replace(/^\//, "")}</strong></span>
        <button type="button" onClick={onClose} aria-label={t("common.close")}><X size={14} /></button>
      </header>
      {command.description && <p>{command.description}</p>}
      <div className="side-chat-messages">
        {(state?.messages ?? []).map((message) => (
          <article key={message.id} className={`side-chat-message ${message.role}`}>
            <strong>{message.role === "user" ? t("sideChat.you") : "Devin"}</strong>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.text}</ReactMarkdown>
            {message.tools.map((tool) => <small key={tool.id}>{tool.title} · {tool.status}</small>)}
          </article>
        ))}
        {state?.running && <div className="side-chat-running"><LoaderCircle className="spin" size={13} />{t("sideChat.thinking")}</div>}
        {state?.error && <div className="interaction-error" role="alert">{state.error}</div>}
      </div>
      <div className="side-chat-composer">
        <input
          value={question}
          disabled={!enabled || state?.running}
          placeholder={hint}
          aria-label={t("sideChat.placeholder")}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button type="button" disabled={!enabled || Boolean(state?.running) || !question.trim()} onClick={submit}><ArrowUp size={14} /><span className="sr-only">{t("composer.send")}</span></button>
      </div>
    </section>
  );
}

function DesktopInteractionCard({
  request,
  queuedCount,
  onError,
}: {
  request: DesktopInteractionRequest;
  queuedCount: number;
  onError(message: string): void;
}) {
  const { locale, t } = useI18n();
  const [busy, setBusy] = useState<string>();
  const [opened, setOpened] = useState(false);
  const [command, setCommand] = useState(request.kind === "permission" ? request.editableCommand?.command ?? "" : "");
  const [revisionNote, setRevisionNote] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>(
    request.kind === "elicitation-form" ? initialElicitationValues(request.form) : {},
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (request.kind === "permission" && request.editableCommand) setCommand(request.editableCommand.command);
  }, [request]);

  const respond = async (response: Record<string, unknown>, action: string) => {
    if (busy) return undefined;
    setBusy(action);
    try {
      const result = await window.devinAgent.agent.respondToUi(request.id, response);
      if (result && typeof result === "object" && result.pending) setBusy(undefined);
      return result;
    } catch (error) {
      setBusy(undefined);
      onError(cleanError(error instanceof Error ? error.message : String(error)));
      return undefined;
    }
  };

  const submitForm = async () => {
    if (request.kind !== "elicitation-form") return;
    const validated = validateElicitationValues(request.form, values);
    setErrors(validated.errors);
    if (!validated.ok) return;
    await respond({ action: "accept", content: validated.content }, "accept");
  };

  const submitRevision = async () => {
    if (request.kind !== "permission" || !request.commandRevision || !revisionNote.trim()) return;
    const nextRevision = request.commandRevision.revision + 1;
    const result = await respond({ action: "revise", instruction: revisionNote.trim(), revision: nextRevision }, "revise");
    if (result && typeof result === "object" && result.pending) setRevisionNote("");
  };

  return (
    <section className="inline-request desktop-interaction" aria-live="polite">
      <div className="inline-request-icon">{request.kind === "elicitation-form" ? <MessageSquareText size={16} /> : request.kind === "elicitation-url" ? <ExternalLink size={16} /> : <TerminalSquare size={16} />}</div>
      <div className="inline-request-body">
        <h3>{request.kind === "permission" ? request.title : request.kind === "elicitation-form" ? request.form.title ?? t("interaction.formTitle") : t("interaction.urlTitle")}</h3>
        <p>{request.message}</p>

        {request.kind === "permission" && (
          <>
            {request.editableCommand && (
              <label className="interaction-field command-editor">
                <span>{t("interaction.command")}</span>
                <textarea value={command} disabled={Boolean(busy)} onChange={(event) => setCommand(event.target.value)} aria-label={t("interaction.command")} />
                {command.trim() !== request.editableCommand.command.trim() && <small>{t("interaction.reviewEditedCommand")}</small>}
              </label>
            )}
            {request.commandRevision && (
              <div className="command-revision-row">
                <input
                  value={revisionNote}
                  disabled={Boolean(busy)}
                  onChange={(event) => setRevisionNote(event.target.value)}
                  placeholder={t("interaction.revisionPlaceholder")}
                  aria-label={t("interaction.revisionPlaceholder")}
                />
                <button disabled={Boolean(busy) || !revisionNote.trim()} onClick={() => void submitRevision()}>
                  {busy === "revise" && <LoaderCircle className="spin" size={14} />}{t("interaction.revise")}
                </button>
              </div>
            )}
            <div className="approval-options">
              {request.options.map((option) => (
                <button
                  key={option.id}
                  disabled={Boolean(busy)}
                  onClick={() => void respond({
                    action: "select",
                    optionId: option.id,
                    ...(request.editableCommand && command.trim() !== request.editableCommand.command.trim()
                      ? { updatedCommand: command }
                      : {}),
                  }, `select:${option.id}`)}
                >
                  <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
                  {busy === `select:${option.id}` ? <LoaderCircle className="spin" size={14} /> : <ChevronRight size={14} />}
                </button>
              ))}
            </div>
          </>
        )}

        {request.kind === "elicitation-form" && (
          <div className="interaction-form">
            {request.form.description && <p className="interaction-description">{request.form.description}</p>}
            {request.form.fields.map((field) => (
              <label className={`interaction-field${errors[field.name] ? " invalid" : ""}`} key={field.name}>
                <span>{field.title}{field.required ? " *" : ""}</span>
                {field.description && <small>{field.description}</small>}
                {field.type === "boolean" ? (
                  <input type="checkbox" checked={values[field.name] === true} disabled={Boolean(busy)} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.checked }))} />
                ) : field.type === "array" && field.choices ? (
                  <span className="interaction-check-list">
                    {field.choices.map((choice) => {
                      const selected = Array.isArray(values[field.name]) ? values[field.name] as string[] : [];
                      return <span key={choice.value}><input type="checkbox" checked={selected.includes(choice.value)} disabled={Boolean(busy)} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.checked ? [...selected, choice.value] : selected.filter((item) => item !== choice.value) }))} />{choice.label}</span>;
                    })}
                  </span>
                ) : field.choices ? (
                  <select value={typeof values[field.name] === "string" ? values[field.name] as string : ""} disabled={Boolean(busy)} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}>
                    <option value="">{t("interaction.chooseValue")}</option>
                    {field.choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.type === "number" || field.type === "integer" ? "number" : field.format === "date" ? "date" : field.format === "email" ? "email" : "text"}
                    step={field.type === "integer" ? 1 : field.type === "number" ? "any" : undefined}
                    value={typeof values[field.name] === "string" || typeof values[field.name] === "number" ? String(values[field.name]) : ""}
                    disabled={Boolean(busy)}
                    onChange={(event) => setValues((current) => ({
                      ...current,
                      [field.name]: field.type === "number" || field.type === "integer"
                        ? event.target.value === "" ? undefined : Number(event.target.value)
                        : event.target.value,
                    }))}
                  />
                )}
                {errors[field.name] && <small className="interaction-error" role="alert">{localizeInteractionError(errors[field.name], locale)}</small>}
              </label>
            ))}
          </div>
        )}

        {request.kind === "elicitation-url" && (
          <div className="interaction-url">
            <strong>{request.origin}</strong>
            <small>{t(opened ? "interaction.waitingCompletion" : "interaction.externalWarning")}</small>
          </div>
        )}

        <div className="inline-request-actions">
          {request.kind === "elicitation-url" && (
            <button className="primary-button" disabled={Boolean(busy) || opened} onClick={() => void respond({ action: "open" }, "open").then((result) => {
              if (result && typeof result === "object" && result.pending) setOpened(true);
            })}>
              {busy === "open" && <LoaderCircle className="spin" size={14} />}{t("interaction.openBrowser")}
            </button>
          )}
          {request.kind === "elicitation-form" && <button className="primary-button" disabled={Boolean(busy)} onClick={() => void submitForm()}>{busy === "accept" && <LoaderCircle className="spin" size={14} />}{t("interaction.submit")}</button>}
          {request.kind !== "permission" && <button disabled={Boolean(busy)} onClick={() => void respond({ action: "decline" }, "decline")}>{t("interaction.decline")}</button>}
          <button disabled={Boolean(busy)} onClick={() => void respond({ action: "cancel" }, "cancel")}>{t("common.cancel")}</button>
        </div>
        {queuedCount > 0 && <small className="interaction-queue">{t("interaction.queued", { count: queuedCount })}</small>}
      </div>
    </section>
  );
}

function InlineExtensionRequest({
  request,
  tools,
  onRevisePlan,
  onDone,
  onError,
}: {
  request: ExtensionUiRequest;
  tools: ToolActivity[];
  onRevisePlan(plan: string): Promise<void>;
  onDone(): void;
  onError(message: string): void;
}) {
  const { locale, t } = useI18n();
  const [value, setValue] = useState(request.prefill ?? "");
  const [pendingResponse, setPendingResponse] = useState<string>();
  const structuredPlan = request.method === "confirm" ? parseStructuredPlan(request.message) : undefined;
  const exitPlan = parseExitPlanPermission(request.request, tools);
  const [editingPlan, setEditingPlan] = useState(false);
  const [editedPlan, setEditedPlan] = useState(exitPlan?.plan ?? "");
  const localizedRequest = localizeExtensionUiRequest(request, locale);
  const respond = async (response: Record<string, unknown>, action: string) => {
    if (pendingResponse) return;
    setPendingResponse(action);
    try {
      await window.devinAgent.agent.respondToUi(request.id, response);
      onDone();
    } catch (error) {
      setPendingResponse(undefined);
      onError(cleanError(error instanceof Error ? error.message : String(error)));
    }
  };
  const revisePlan = async () => {
    if (pendingResponse || !exitPlan) return;
    const normalizedPlan = editedPlan.trim();
    if (!normalizedPlan) {
      onError(t("plan.emptyRevision"));
      return;
    }
    setPendingResponse("revise-plan");
    let permissionAnswered = false;
    try {
      await window.devinAgent.agent.respondToUi(request.id, { value: exitPlan.rejectOptionId });
      permissionAnswered = true;
      onDone();
      await onRevisePlan(normalizedPlan);
    } catch (error) {
      if (!permissionAnswered) setPendingResponse(undefined);
      onError(cleanError(error instanceof Error ? error.message : String(error)));
    }
  };
  const busy = Boolean(pendingResponse);
  return (
    <section className="inline-request" aria-live="polite">
      <div className="inline-request-icon">{structuredPlan || exitPlan ? <ListTodo size={16} /> : <TerminalSquare size={16} />}</div>
      <div className="inline-request-body">
        <h3>{structuredPlan ? t("dialog.updatePlan") : exitPlan ? t("plan.reviewTitle") : localizedRequest.title ?? (request.method === "confirm" ? t("dialog.approval") : t("dialog.chooseOption"))}</h3>
        {structuredPlan
          ? <PlanTodoList plan={structuredPlan} />
          : exitPlan
            ? <p>{t("plan.reviewDescription")}</p>
            : localizedRequest.message && <p>{localizedRequest.message}</p>}
        {editingPlan && exitPlan && (
          <label className="plan-markdown-editor">
            <span>{t("plan.markdownContent")}</span>
            <textarea autoFocus disabled={busy} value={editedPlan} onChange={(event) => setEditedPlan(event.target.value)} />
          </label>
        )}
        {!editingPlan && request.method === "select" && (
          <div className="approval-options">
            {localizedRequest.options.map((option) => (
              <button key={option.value} disabled={busy} onClick={() => void respond({ value: option.value }, `select:${option.value}`)}>
                <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>{pendingResponse === `select:${option.value}` ? <LoaderCircle className="spin" size={14} /> : <ChevronRight size={14} />}
              </button>
            ))}
          </div>
        )}
        {!editingPlan && (request.method === "input" || request.method === "editor") && (
          request.method === "editor"
            ? <textarea autoFocus disabled={busy} value={value} onChange={(event) => setValue(event.target.value)} />
            : <input autoFocus disabled={busy} value={value} placeholder={request.placeholder} onChange={(event) => setValue(event.target.value)} />
        )}
        <div className="inline-request-actions">
          {editingPlan ? (
            <>
              <button disabled={busy} onClick={() => { setEditedPlan(exitPlan?.plan ?? ""); setEditingPlan(false); }}>{t("common.cancel")}</button>
              <button className="primary-button" disabled={busy} onClick={() => void revisePlan()}>
                {pendingResponse === "revise-plan" && <LoaderCircle className="spin" size={14} />}{t("plan.sendRevision")}
              </button>
            </>
          ) : (
            <>
              {exitPlan && (
                <button className="plan-request-edit" disabled={busy} onClick={() => setEditingPlan(true)}>
                  <Pencil size={13} />{t("plan.edit")}
                </button>
              )}
              <button disabled={busy} onClick={() => void respond({ cancelled: true }, "cancel")}>
                {pendingResponse === "cancel" && <LoaderCircle className="spin" size={14} />}{t("common.cancel")}
              </button>
            </>
          )}
          {!editingPlan && request.method === "confirm" && (
            <>
              <button disabled={busy} onClick={() => void respond({ confirmed: false }, "deny")}>
                {pendingResponse === "deny" && <LoaderCircle className="spin" size={14} />}{t("common.deny")}
              </button>
              <button className="primary-button" disabled={busy} onClick={() => void respond({ confirmed: true }, "allow")}>
                {pendingResponse === "allow" && <LoaderCircle className="spin" size={14} />}{t("common.allow")}
              </button>
            </>
          )}
          {!editingPlan && (request.method === "input" || request.method === "editor") && (
            <button className="primary-button" disabled={busy} onClick={() => void respond({ value }, "continue")}>
              {pendingResponse === "continue" && <LoaderCircle className="spin" size={14} />}{t("common.continue")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

interface EditablePlanStep {
  id: string;
  step: string;
  status: PlanStepStatus;
}

function EditablePlanCard({ plan, onSave }: { plan: StructuredPlan; onSave(plan: StructuredPlan): boolean }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [steps, setSteps] = useState<EditablePlanStep[]>([]);
  const [validationError, setValidationError] = useState<string>();

  const beginEditing = () => {
    setExplanation(plan.explanation ?? "");
    setSteps(plan.steps.map((item) => ({ ...item, id: crypto.randomUUID() })));
    setValidationError(undefined);
    setEditing(true);
  };
  const updateStep = (id: string, update: Partial<Pick<EditablePlanStep, "step" | "status">>) => {
    setSteps((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
    setValidationError(undefined);
  };
  const moveStep = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= steps.length) return;
    setSteps((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const save = () => {
    const normalizedSteps = steps.flatMap((item) => {
      const step = item.step.trim();
      return step ? [{ step, status: item.status }] : [];
    });
    if (normalizedSteps.length === 0) {
      setValidationError(t("plan.noSteps"));
      return;
    }
    const normalizedExplanation = explanation.trim();
    const saved = onSave({
      ...(normalizedExplanation ? { explanation: normalizedExplanation } : {}),
      steps: normalizedSteps,
    });
    if (saved) setEditing(false);
  };

  if (!editing) {
    return (
      <section className="agent-plan-card">
        <PlanTodoList
          plan={plan}
          action={(
            <button type="button" className="plan-edit-action" onClick={beginEditing}>
              <Pencil size={12} />
              <span>{t("plan.edit")}</span>
            </button>
          )}
        />
      </section>
    );
  }

  return (
    <section
      className="agent-plan-card plan-editor-card"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setEditing(false);
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          save();
        }
      }}
    >
      <div className="plan-editor-heading">
        <div><strong>{t("plan.editTitle")}</strong><small>{t("plan.editDescription")}</small></div>
        <kbd>⌘↵</kbd>
      </div>
      <label className="plan-editor-explanation">
        <span>{t("plan.explanation")}</span>
        <textarea
          value={explanation}
          onChange={(event) => setExplanation(event.target.value)}
          placeholder={t("plan.explanationPlaceholder")}
          rows={2}
        />
      </label>
      <div className="plan-editor-steps">
        {steps.map((item, index) => (
          <div className="plan-editor-step" key={item.id}>
            <span className="plan-editor-index">{index + 1}</span>
            <select
              value={item.status}
              onChange={(event) => updateStep(item.id, { status: event.target.value as PlanStepStatus })}
              aria-label={t("plan.stepStatus", { number: index + 1 })}
            >
              <option value="pending">{t("plan.pending")}</option>
              <option value="in_progress">{t("plan.inProgress")}</option>
              <option value="completed">{t("plan.completed")}</option>
            </select>
            <input
              value={item.step}
              onChange={(event) => updateStep(item.id, { step: event.target.value })}
              aria-label={t("plan.step", { number: index + 1 })}
              autoFocus={index === 0}
            />
            <div className="plan-editor-step-actions">
              <button type="button" disabled={index === 0} onClick={() => moveStep(index, -1)} title={t("plan.moveUp")} aria-label={t("plan.moveUp")}><ArrowUp size={13} /></button>
              <button type="button" disabled={index === steps.length - 1} onClick={() => moveStep(index, 1)} title={t("plan.moveDown")} aria-label={t("plan.moveDown")}><ArrowDown size={13} /></button>
              <button type="button" onClick={() => setSteps((current) => current.filter((step) => step.id !== item.id))} title={t("plan.removeStep")} aria-label={t("plan.removeStep")}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="plan-add-step"
        onClick={() => setSteps((current) => [...current, { id: crypto.randomUUID(), step: "", status: "pending" }])}
      >
        <Plus size={13} />
        <span>{t("plan.addStep")}</span>
      </button>
      {validationError && <p className="plan-editor-error" role="alert">{validationError}</p>}
      <div className="plan-editor-actions">
        <button type="button" onClick={() => setEditing(false)}>{t("common.cancel")}</button>
        <button type="button" className="primary-button" onClick={save}>{t("plan.saveAndApply")}</button>
      </div>
    </section>
  );
}

function PlanTodoList({ plan, action }: { plan: StructuredPlan; action?: ReactNode }) {
  const { t } = useI18n();
  const completed = plan.steps.filter((item) => item.status === "completed").length;
  const statusLabels = {
    completed: t("plan.completed"),
    in_progress: t("plan.inProgress"),
    pending: t("plan.pending"),
  };

  return (
    <div className="plan-todo">
      {plan.explanation && <p className="plan-explanation">{plan.explanation}</p>}
      <div className="plan-progress">
        <span>{t("plan.tasks")}</span>
        <span className="plan-progress-meta">
          <span>{t("plan.progress", { completed, total: plan.steps.length })}</span>
          {action}
        </span>
      </div>
      <ol className="plan-todo-list">
        {plan.steps.map((item, index) => (
          <li className={`plan-todo-item ${item.status}`} key={`${index}-${item.step}`}>
            <span className="plan-todo-status" title={statusLabels[item.status]} aria-label={statusLabels[item.status]}>
              {item.status === "completed" && <Check size={12} />}
              {item.status === "in_progress" && <LoaderCircle className="spin" size={12} />}
            </span>
            <span>{item.step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function AuthPromptDialog({ event, onDone, onCancel }: { event: Extract<AuthUiEvent, { kind: "prompt" }>; onDone(): void; onCancel(): void }) {
  const { t } = useI18n();
  const [value, setValue] = useState("");
  const respond = (answer: string, close = onDone) => {
    close();
    void window.devinAgent.auth.respond(event.id, answer).catch(() => undefined);
  };
  const cancel = () => respond(AUTH_PROMPT_CANCEL_VALUE, onCancel);
  const isCodexMethodPrompt = event.prompt.type === "select"
    && event.prompt.options?.some((option) => option.id === "browser")
    && event.prompt.options.some((option) => option.id === "device_code");
  const message = isCodexMethodPrompt
    ? t("auth.codexLoginMethod")
    : event.prompt.type === "manual_code"
      ? t("auth.manualCodePrompt")
      : event.prompt.message;
  const optionText = (option: NonNullable<typeof event.prompt.options>[number]) => {
    if (!isCodexMethodPrompt) return option;
    if (option.id === "browser") return { ...option, label: t("auth.browserLogin"), description: t("auth.browserLoginDescription") };
    if (option.id === "device_code") return { ...option, label: t("auth.deviceCodeLogin"), description: t("auth.deviceCodeLoginDescription") };
    return option;
  };
  const closeOnBackdrop = (pointerEvent: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerEvent.target === pointerEvent.currentTarget) cancel();
  };
  return (
    <div className="modal-backdrop" onPointerDown={closeOnBackdrop}>
      <div className="approval-dialog auth-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby={`auth-prompt-${event.id}`} onKeyDown={(key) => { if (key.key === "Escape") cancel(); }}>
        <button className="icon-button auth-dialog-close" onClick={cancel} aria-label={t("auth.cancelSignIn")} title={t("auth.cancelSignIn")}><X size={17} /></button>
        <div className="approval-icon"><Bot size={19} /></div>
        <h3 id={`auth-prompt-${event.id}`}>{message}</h3>
        {event.prompt.type === "select"
          ? <div className="approval-options">{event.prompt.options?.map(optionText).map((option, index) => <button key={option.id} autoFocus={index === 0} onClick={() => respond(option.id)}><span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span><ChevronRight size={14} /></button>)}</div>
          : <input type={event.prompt.type === "secret" ? "password" : "text"} autoFocus value={value} placeholder={event.prompt.placeholder} onChange={(input) => setValue(input.target.value)} onKeyDown={(key) => { if (key.key === "Enter") respond(value); }} />}
        <div className="dialog-actions">
          <button onClick={cancel}>{t("common.cancel")}</button>
          {event.prompt.type !== "select" && <button className="primary-button" onClick={() => respond(value)}>{t("common.continue")}</button>}
        </div>
      </div>
    </div>
  );
}

function AuthNotice({ event, onClose }: { event: Extract<AuthUiEvent, { kind: "notice" }>; onClose(): void }) {
  const { t } = useI18n();
  const notice = event.event;
  const instructions = notice.type === "device_code" ? t("auth.deviceCodeInstructions") : t("auth.browserOpened");
  return <div className="modal-backdrop"><div className="approval-dialog" role="dialog" aria-modal="true"><div className="approval-icon"><Bot size={19} /></div><h3>{notice.type === "device_code" ? t("auth.completeSignIn") : t("auth.continueInBrowser")}</h3><p>{instructions}</p>{notice.userCode && <div className="device-code">{notice.userCode}</div>}<div className="dialog-actions"><button className="primary-button" onClick={onClose}>{t("auth.done")}</button></div></div></div>;
}

function AttachmentMenu({ onChange }: { onChange(event: ChangeEvent<HTMLInputElement>): void }) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="composer-popover" ref={rootRef}>
      <button
        type="button"
        className={`composer-tool-button${open ? " open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        title={t("composer.attachImages")}
        aria-label={t("composer.moreActions")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Plus size={17} />
      </button>
      {open && (
        <div className="composer-popup-menu attachment-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              inputRef.current?.click();
            }}
          >
            <Paperclip size={16} />
            <span>{t("composer.uploadFile")}</span>
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        className="composer-file-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        onChange={onChange}
      />
    </div>
  );
}

function PermissionPicker({ value, modes, updating, disabled, onChange }: { value: PermissionMode; modes: NonNullable<AgentSnapshot["modes"]>; updating: boolean; disabled: boolean; onChange(value: PermissionMode): void }) {
  const { locale, t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = modes.find((mode) => mode.id === value);
  const selectedPresentation = selected ? getModePresentation(selected, locale) : undefined;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="composer-popover permission-picker" ref={rootRef}>
      <button
        type="button"
        className={`permission-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        disabled={updating || disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={updating}
      >
        {updating ? <LoaderCircle className="spin" size={13} /> : <ModeIcon kind={selectedPresentation?.kind ?? "unknown"} size={13} />}
        <span>{selectedPresentation?.label ?? (value || t("mode.cliMode"))}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="composer-popup-menu permission-menu" role="menu">
          {modes.map((option) => {
            const presentation = getModePresentation(option, locale);
            return (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={option.id === value}
                className={`permission-option${option.id === value ? " selected" : ""}`}
                key={option.id}
                onClick={() => {
                  setOpen(false);
                  onChange(option.id);
                }}
              >
                <span className="permission-option-icon"><ModeIcon kind={presentation.kind} size={17} /></span>
                <span className="permission-option-copy"><strong>{presentation.label}</strong>{presentation.description && <small>{presentation.description}</small>}</span>
                {option.id === value && <Check size={15} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ModeIcon({ kind, size }: { kind: ModeKind; size: number }) {
  const Icon = kind === "code"
    ? Code2
    : kind === "smart"
      ? Sparkles
      : kind === "ask"
        ? MessageSquareText
        : kind === "plan"
          ? FileText
          : kind === "bypass"
            ? ShieldOff
            : kind === "autonomous"
              ? Box
              : Shield;
  return <Icon size={size} aria-hidden="true" />;
}

function ModelPicker({
  model,
  models,
  pinnedModelIds,
  onChange,
  onPinnedModelIdsChange,
}: {
  model: string;
  models: AgentSnapshot["models"];
  pinnedModelIds: string[];
  onChange(value: string): void;
  onPinnedModelIdsChange(value: string[]): void;
}) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const options = useMemo(() => {
    const options = [...models];
    if (model && !options.some((item) => item.id === model)) options.unshift({ provider: "devin", id: model });
    return options;
  }, [model, models]);
  const organizedModels = useMemo(
    () => organizeModels(options, pinnedModelIds, query),
    [options, pinnedModelIds, query],
  );

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const selectedModel = options.find((item) => item.id === model);
  const visibleCount = organizedModels.pinned.length + organizedModels.others.length;

  const renderModelOption = (item: AgentSnapshot["models"][number], pinned: boolean) => {
    const selected = item.id === model;
    const name = item.name ?? item.id;
    return (
      <div className={`model-option${selected ? " selected" : ""}${pinned ? " pinned" : ""}`} key={item.id}>
        <button
          type="button"
          className="model-option-select"
          onClick={() => {
            onChange(item.id);
            setOpen(false);
          }}
          role="menuitemradio"
          aria-checked={selected}
          title={item.description ?? item.id}
        >
          <span>{name}</span>
          {selected && <Check size={14} />}
        </button>
        <button
          type="button"
          className="model-pin-button"
          onClick={() => onPinnedModelIdsChange(togglePinnedModelId(pinnedModelIds, item.id))}
          aria-label={t(pinned ? "model.unpin" : "model.pin", { model: name })}
          title={t(pinned ? "model.unpin" : "model.pin", { model: name })}
          aria-pressed={pinned}
        >
          <Pin size={13} fill={pinned ? "currentColor" : "none"} />
        </button>
      </div>
    );
  };

  return (
    <div className="model-picker" ref={rootRef}>
      <button
        type="button"
        className={`model-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((current) => {
          if (!current) setQuery("");
          return !current;
        })}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={model}
      >
        <span>{shortModel(selectedModel?.name ?? model)}</span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="model-menu" role="dialog" aria-label={t("model.models")}>
          <label className="model-search">
            <Search size={14} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("model.search")}
              aria-label={t("model.search")}
            />
          </label>
          <div className="model-list" role="menu">
            {organizedModels.pinned.length > 0 && (
              <>
                <div className="model-section-label">{t("model.pinned")}</div>
                {organizedModels.pinned.map((item) => renderModelOption(item, true))}
              </>
            )}
            {organizedModels.others.length > 0 && (
              <>
                {organizedModels.pinned.length > 0 && <div className="model-section-label">{t("model.all")}</div>}
                {organizedModels.others.map((item) => renderModelOption(item, false))}
              </>
            )}
            {visibleCount === 0 && <div className="model-empty">{t("model.noResults")}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

function profileInitials(nickname: string): string {
  const value = nickname.trim();
  if (!value) return "U";
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.slice(0, 2).map((word) => Array.from(word)[0]).join("").toUpperCase();
  return Array.from(value).slice(0, 2).join("").toUpperCase();
}

async function fileToAvatarDataUrl(file: File): Promise<string> {
  const source = await readFileDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const next = new Image();
    next.onload = () => resolve(next);
    next.onerror = () => reject(new Error("Unable to read avatar image"));
    next.src = source;
  });
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  if (!sourceSize) throw new Error("Avatar image is empty");
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to process avatar image");
  const sourceX = (image.naturalWidth - sourceSize) / 2;
  const sourceY = (image.naturalHeight - sourceSize) / 2;
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, 256, 256);
  return canvas.toDataURL("image/webp", 0.86);
}

function readFileDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function fileToAttachment(file: File): Promise<Attachment> {
  const dataUrl = await readFileDataUrl(file);
  return { name: file.name, mimeType: file.type, data: dataUrl.split(",")[1] ?? "" };
}

function imageDataUrl(image: ChatImage): string {
  return image.data.startsWith("data:") ? image.data : `data:${image.mimeType};base64,${image.data}`;
}

type Translator = ReturnType<typeof useI18n>["t"];

function shortModel(value: string): string {
  return value.length > 22 ? `${value.slice(0, 20)}…` : value;
}

function workDuration(messages: ChatMessage[], liveNow?: number): number | undefined {
  const tools = messages.flatMap((message) => message.tools);
  const starts = tools
    .map((tool) => tool.startedAt)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  for (const message of messages) {
    const messageStart = normalizeTimestamp(message.timestamp);
    if (messageStart !== undefined) starts.push(messageStart);
  }
  if (starts.length === 0) return undefined;

  const ends = tools
    .map((tool) => tool.endedAt)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const end = liveNow ?? (ends.length > 0 ? Math.max(...ends) : undefined);
  if (end === undefined) return undefined;
  return Math.max(0, end - Math.min(...starts));
}

function normalizeTimestamp(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value < 10_000_000_000 ? value * 1_000 : value;
}

function clampPercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, value));
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value < 10 && value > 0 ? value.toFixed(1) : Math.round(value)}%`;
}

function formatCompactTokens(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value < 1_000) return Math.round(value).toLocaleString();
  if (value < 10_000) return `${(value / 1_000).toFixed(1)}k`;
  if (value < 1_000_000) return `${Math.round(value / 1_000)}k`;
  if (value < 10_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  return `${Math.round(value / 1_000_000)}m`;
}

function formatCost(value: number): string {
  return `$${value < 0.01 ? value.toFixed(4) : value.toFixed(2)}`;
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(1, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function relativeTime(value: string, locale: string, nowLabel: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return nowLabel;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(value).toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function sortSidebarSessions(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort(compareSidebarSessions);
}

function formatJson(value: unknown): string {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function formatToolArgs(tool: ToolActivity): string {
  if (typeof tool.args === "string") return tool.args;
  if (!tool.args || typeof tool.args !== "object" || Array.isArray(tool.args)) return formatJson(tool.args);

  const args = tool.args as Record<string, unknown>;
  const commandKey = typeof args.cmd === "string" ? "cmd" : typeof args.command === "string" ? "command" : undefined;
  if (commandKey) {
    const command = String(args[commandKey]);
    const rest = Object.fromEntries(Object.entries(args).filter(([key]) => key !== commandKey));
    return Object.keys(rest).length > 0 ? `${command}\n\n${formatJson(rest)}` : command;
  }

  const entries = Object.entries(args);
  if (entries.length === 1 && typeof entries[0]?.[1] === "string") return entries[0][1];
  return formatJson(tool.args);
}

function toolDisplayTitle(tool: ToolActivity, t: Translator): string {
  const name = tool.name.toLowerCase();
  const args = tool.args && typeof tool.args === "object" && !Array.isArray(tool.args)
    ? tool.args as Record<string, unknown>
    : {};
  const fileValue = typeof args.path === "string" ? args.path : typeof args.file_path === "string" ? args.file_path : undefined;
  const file = fileValue ? crop(fileValue, 76) : undefined;

  if (name.includes("exec") || name.includes("bash") || name.includes("command")) return t("work.toolRanCommand");
  if (name.includes("read")) return file ? t("work.toolRead", { file }) : t("work.toolReadFiles");
  if (name.includes("write")) return file ? t("work.toolWrote", { file }) : t("work.toolWroteFile");
  if (name.includes("edit") || name.includes("patch")) return file ? t("work.toolEdited", { file }) : t("work.toolEditedFiles");
  if (name.includes("search")) return t("work.toolSearched");
  if (name === "update_plan") return t("work.toolUpdatedPlan");
  return tool.name.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function toolFilePath(tool: ToolActivity): string | undefined {
  const name = tool.name.toLowerCase();
  if (!["read", "write", "edit", "patch", "file", "image"].some((part) => name.includes(part))) return undefined;
  if (!tool.args || typeof tool.args !== "object" || Array.isArray(tool.args)) return undefined;
  const args = tool.args as Record<string, unknown>;
  for (const key of ["path", "file_path", "filePath", "filename", "target", "targetPath"]) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function previewPathFromHref(href?: string): string | undefined {
  if (!href || /^(?:https?:|mailto:|#)/i.test(href)) return undefined;
  if (href.startsWith("file://")) {
    try {
      return decodeURIComponent(new URL(href).pathname);
    } catch {
      return undefined;
    }
  }
  if (/^(?:\/|\.\.?\/|~\/)/.test(href)) return decodeURIComponent(href);
  return undefined;
}

function fileNameFromPath(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function crop(value: string, length: number): string {
  const singleLine = value.replace(/\s+/g, " ").trim();
  return singleLine.length > length ? `${singleLine.slice(0, length - 1)}…` : singleLine;
}

function cleanError(value: string): string {
  return value.replace(/^Error invoking remote method '[^']+':\s*/i, "").split("\n").filter(Boolean).slice(0, 3).join(" ");
}

function localizeInteractionError(value: string, locale: string): string {
  if (locale !== "en") return value;
  if (value === "此字段为必填项") return "This field is required.";
  if (value === "值类型不符合字段要求") return "The value has the wrong type.";
  if (value === "输入格式不符合要求") return "The value does not match the required format.";
  if (value === "选择值不在允许范围内") return "Choose only an allowed value.";
  return value
    .replace(/^至少输入 (\d+) 个字符$/, "Enter at least $1 characters.")
    .replace(/^最多输入 (\d+) 个字符$/, "Enter no more than $1 characters.")
    .replace(/^值不能小于 (.+)$/, "The value must be at least $1.")
    .replace(/^值不能大于 (.+)$/, "The value must be no more than $1.")
    .replace(/^至少选择 (\d+) 项$/, "Choose at least $1 items.")
    .replace(/^最多选择 (\d+) 项$/, "Choose no more than $1 items.");
}

function isDesktopInteractionRequest(value: unknown): value is DesktopInteractionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return typeof request.id === "string"
    && Number.isSafeInteger(request.generation)
    && (request.kind === "permission" || request.kind === "elicitation-form" || request.kind === "elicitation-url");
}

function isSessionSummary(value: unknown): value is SessionSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const session = value as Record<string, unknown>;
  return typeof session.id === "string"
    && typeof session.cwd === "string"
    && typeof session.title === "string"
    && typeof session.updatedAt === "string";
}
