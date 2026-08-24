import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Archive, ArchiveRestore, ArrowUp, Bot, Check, ExternalLink, FolderOpen, GitFork,
  ImagePlus, Info, Languages, LoaderCircle, MessageSquareWarning, Monitor, Moon, Pin,
  Search, Sun, TerminalSquare, Trash2, X,
} from "lucide-react";
import type {
  AgentSnapshot, ColorSchemePreference, DevinCliUpdateStatus, LanguagePreference,
  PermissionMode, ProviderId, ProviderStatus, SessionSummary, UserProfile,
} from "../../../shared/types";
import { isAuthPromptCancelledError } from "../../lib/errors";
import { useI18n } from "../../lib/i18n";
import { getModePresentation } from "../../lib/mode-presentation";
import { organizeModels, togglePinnedModelId } from "../../lib/model-picker";
import {
  cleanError, DEVIN_GITHUB_DISPLAY_URL, DEVIN_GITHUB_URL, DEVIN_ISSUES_DISPLAY_URL,
  DEVIN_ISSUES_URL, fileToAvatarDataUrl, profileInitials, relativeTime,
} from "../../lib/app-helpers";

export function ProfileAvatar({ profile, className }: { profile: UserProfile; className: string }) {
  return (
    <span className={className} aria-hidden="true">
      {profile.avatarDataUrl
        ? <img src={profile.avatarDataUrl} alt="" />
        : profileInitials(profile.nickname)}
    </span>
  );
}


export function SettingsDialog(props: {
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
