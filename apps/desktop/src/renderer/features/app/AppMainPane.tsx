import type {
  ChangeEvent, ClipboardEvent, Dispatch, KeyboardEvent, MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent, RefObject, SetStateAction, WheelEvent as ReactWheelEvent,
} from "react";
import {
  ArrowUp, ChevronRight, CircleStop, Download, File as FileIcon, Folder, FolderOpen,
  GitBranch, GitCompareArrows, ListFilter, LoaderCircle, MessageSquareQuote,
  MessageSquareText, PanelLeft, PanelRight, Shield, Sparkles, X,
} from "lucide-react";
import type { MentionKind } from "../../../shared/mentions";
import type {
  AgentSessionStats, AgentSnapshot, DesktopInteractionRequest, ExtensionUiRequest,
  FilePreview, PermissionMode, ProviderId, WorkspaceChange, WorkspaceChanges, WorkspaceDiff,
} from "../../../shared/types";
import type { AvailableCommand, PlanState } from "../../../shared/conversation";
import type { DevinCapabilities } from "../../../shared/capabilities";
import type { ChainConversationStore } from "../../lib/chains";
import type { ChatAnnotation, ChatMessage } from "../../lib/conversation";
import { groupConversation } from "../../lib/conversation";
import { moveFollowUp, removeFollowUp, updateFollowUp, type FollowUpItem } from "../../lib/follow-up";
import type { PositionedMention } from "../../lib/mentions";
import { findAtTrigger } from "../../lib/mentions";
import type { InlineMentionEditorHandle } from "../../lib/inline-mention-editor";
import { InlineMentionEditor } from "../../lib/inline-mention-editor";
import type { StructuredPlan } from "../../lib/plan";
import { useI18n } from "../../lib/i18n";
import devinDesktopIcon from "../../assets/devin-desktop-icon.png";
import { cleanError, crop, imageDataUrl } from "../../lib/app-helpers";
import type { Attachment, MentionMenuOption, PreviewImage, QueuedPrompt } from "./types";
import { WeixinBotView } from "../../WeixinBotView";
import { TelegramBotView } from "../../TelegramBotView";
import { AttachmentMenu, ModelPicker, PermissionPicker } from "../composer/ComposerControls";
import { ContextCard } from "../conversation/ContextCard";
import { AssistantTurn, EmptyState, FollowUpQueue, UserMessage } from "../conversation/ConversationContent";
import { ChangesPanel, FilePreviewPanel } from "../inspector/InspectorPanels";
import { DesktopInteractionCard, InlineExtensionRequest, SideChatPanel } from "../interactions/InteractionPanels";
import { EditablePlanCard } from "../plans/PlanCards";

export interface AppMainPaneProps {
  activeView: "thread" | "weixin" | "telegram";
  sidebarOpen: boolean;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  threadLayoutRef: RefObject<HTMLDivElement | null>;
  activeTitle: string;
  sessionLocked: boolean;
  workspace?: string;
  workspaceName?: string;
  loading: boolean;
  running: boolean;
  messages: ChatMessage[];
  inspectorOpen: boolean;
  inspectorMode: "preview" | "changes";
  workspaceChanges?: WorkspaceChanges;
  contextCardOpen: boolean;
  setContextCardOpen: Dispatch<SetStateAction<boolean>>;
  setInspectorOpen: Dispatch<SetStateAction<boolean>>;
  conversationContextEnabled: boolean;
  activeFollowUps: FollowUpItem<QueuedPrompt>[];
  scrollRef: RefObject<HTMLDivElement | null>;
  handleConversationScroll(): void;
  handleConversationWheel(event: ReactWheelEvent<HTMLDivElement>): void;
  captureAnnotationSelection(event: ReactMouseEvent<HTMLDivElement>): void;
  uiRequest?: ExtensionUiRequest;
  interactionRequests: DesktopInteractionRequest[];
  agentPlan?: PlanState;
  conversationGroups: ReturnType<typeof groupConversation>;
  activeAssistantGroupId?: string;
  showReasoningProcess: boolean;
  setDraft: Dispatch<SetStateAction<string>>;
  textareaRef: RefObject<InlineMentionEditorHandle | null>;
  setPreviewImage: Dispatch<SetStateAction<PreviewImage | undefined>>;
  openFilePreview(filePath: string): Promise<void>;
  setToast: Dispatch<SetStateAction<{ message: string; type: "info" | "error" } | undefined>>;
  applyEditedPlan(plan: StructuredPlan): boolean;
  activeAssistantHasWork: boolean;
  applyEditedMarkdownPlan(plan: string): Promise<void>;
  setUiRequest: Dispatch<SetStateAction<ExtensionUiRequest | undefined>>;
  sideChatOpen: boolean;
  sideChatCommand?: AvailableCommand;
  sideChatState?: ChainConversationStore[string];
  sideChatEnabled: boolean;
  sendSideChat(question: string): Promise<void>;
  setSideChatOpen: Dispatch<SetStateAction<boolean>>;
  activeSession?: string;
  setFollowUpQueue(sessionId: string, update: (queue: FollowUpItem<QueuedPrompt>[]) => FollowUpItem<QueuedPrompt>[]): void;
  sendQueuedPromptNow(itemId: string): Promise<void>;
  chooseWorkspace(): Promise<string | undefined>;
  clearWorkspace(): Promise<void>;
  draftAnnotations: ChatAnnotation[];
  removeDraftAnnotation(annotationId?: string): void;
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  draft: string;
  draftMentions: PositionedMention[];
  handleDraftChange(value: string, mentions: PositionedMention[], caret: number): void;
  handleComposerKeyDown(event: KeyboardEvent<HTMLDivElement>): void;
  handleComposerPaste(event: ClipboardEvent<HTMLDivElement>): void;
  composingRef: RefObject<boolean>;
  mentionMenu?: { category?: MentionKind; activeIndex: number };
  setMentionMenu: Dispatch<SetStateAction<{ category?: MentionKind; activeIndex: number } | undefined>>;
  mentionBlurTimerRef: RefObject<number | undefined>;
  mentionTrigger?: ReturnType<typeof findAtTrigger>;
  mentionLoading: boolean;
  mentionError?: string;
  mentionOptions: MentionMenuOption[];
  selectMentionOption(option?: MentionMenuOption): void;
  imagePromptEnabled: boolean;
  handleAttachment(event: ChangeEvent<HTMLInputElement>): Promise<void>;
  permission: PermissionMode;
  availableModes: NonNullable<AgentSnapshot["modes"]>;
  permissionUpdating: boolean;
  changePermission(value: PermissionMode): Promise<void>;
  model: string;
  availableModels: AgentSnapshot["models"];
  pinnedModelIds: string[];
  changeModel(value: string): Promise<void>;
  changePinnedModelIds(value: string[]): Promise<void>;
  stopAgent(): Promise<void>;
  sendMessage(options?: { interrupt?: boolean }): Promise<void>;
  sessionStats?: AgentSessionStats;
  selectedModel?: AgentSnapshot["models"][number];
  provider: ProviderId;
  inspectorWidth: number;
  inspectorMinWidth: number;
  inspectorMaxWidth: number;
  inspectorDefaultWidth: number;
  startInspectorResize(event: ReactPointerEvent<HTMLDivElement>): void;
  resizeInspectorByKeyboard(event: KeyboardEvent<HTMLDivElement>): void;
  setInspectorWidth: Dispatch<SetStateAction<number>>;
  selectedChange?: WorkspaceChange;
  workspaceDiff?: WorkspaceDiff;
  changesLoading: boolean;
  changesError?: string;
  openWorkspaceDiff(change: WorkspaceChange): Promise<void>;
  refreshWorkspaceChanges(options?: { background?: boolean }): Promise<void>;
  changesDiffRequestRef: RefObject<number>;
  setSelectedChange: Dispatch<SetStateAction<WorkspaceChange | undefined>>;
  setWorkspaceDiff: Dispatch<SetStateAction<WorkspaceDiff | undefined>>;
  setChangesError: Dispatch<SetStateAction<string | undefined>>;
  setChangesLoading: Dispatch<SetStateAction<boolean>>;
  filePreview?: FilePreview;
  previewLoading: boolean;
  previewError?: string;
  recentPreviewFiles: string[];
  choosePreviewFile(): Promise<void>;
  closePreviewPanel(): void;
  showChangesPanel(): void;
  showPreviewPanel(): void;
  openWorkspaceInDevin(): Promise<void>;
  downloadSessionMarkdown(): Promise<void>;
  capabilities?: DevinCapabilities;
}

export function AppMainPane(props: AppMainPaneProps) {
  const { t } = useI18n();
  const {
    activeView, sidebarOpen, setSidebarOpen, threadLayoutRef, activeTitle, sessionLocked,
    workspace, workspaceName, loading, running, messages, inspectorOpen, inspectorMode,
    workspaceChanges, contextCardOpen, setContextCardOpen, setInspectorOpen,
    conversationContextEnabled: ENABLE_CONVERSATION_CONTEXT, activeFollowUps, scrollRef,
    handleConversationScroll, handleConversationWheel, captureAnnotationSelection, uiRequest,
    interactionRequests, agentPlan, conversationGroups, activeAssistantGroupId,
    showReasoningProcess, setDraft, textareaRef, setPreviewImage, openFilePreview, setToast,
    applyEditedPlan, activeAssistantHasWork, applyEditedMarkdownPlan, setUiRequest,
    sideChatOpen, sideChatCommand, sideChatState, sideChatEnabled, sendSideChat, setSideChatOpen,
    activeSession, setFollowUpQueue, sendQueuedPromptNow, chooseWorkspace, clearWorkspace,
    draftAnnotations, removeDraftAnnotation, attachments, setAttachments, draft, draftMentions,
    handleDraftChange, handleComposerKeyDown, handleComposerPaste, composingRef, mentionMenu,
    setMentionMenu, mentionBlurTimerRef, mentionTrigger, mentionLoading, mentionError,
    mentionOptions, selectMentionOption, imagePromptEnabled, handleAttachment, permission,
    availableModes, permissionUpdating, changePermission, model, availableModels,
    pinnedModelIds, changeModel, changePinnedModelIds, stopAgent, sendMessage, sessionStats,
    selectedModel, provider, inspectorWidth, inspectorMinWidth: MIN_INSPECTOR_WIDTH,
    inspectorMaxWidth: MAX_INSPECTOR_WIDTH, inspectorDefaultWidth: DEFAULT_INSPECTOR_WIDTH,
    startInspectorResize, resizeInspectorByKeyboard, setInspectorWidth, selectedChange,
    workspaceDiff, changesLoading, changesError, openWorkspaceDiff, refreshWorkspaceChanges,
    changesDiffRequestRef, setSelectedChange, setWorkspaceDiff, setChangesError, setChangesLoading,
    filePreview, previewLoading, previewError, recentPreviewFiles, choosePreviewFile,
    closePreviewPanel, showChangesPanel, showPreviewPanel, openWorkspaceInDevin,
    downloadSessionMarkdown,
  } = props;
  return (
      <main className="main-pane">
        {activeView === "weixin" ? (
          <WeixinBotView sidebarOpen={sidebarOpen} onShowSidebar={() => setSidebarOpen(true)} />
        ) : activeView === "telegram" ? (
          <TelegramBotView sidebarOpen={sidebarOpen} onShowSidebar={() => setSidebarOpen(true)} />
        ) : (
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
        )}
      </main>
  );
}
