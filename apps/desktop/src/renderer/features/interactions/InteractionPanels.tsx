import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp, ChevronRight, ExternalLink, ListTodo, LoaderCircle, MessageSquareQuote,
  MessageSquareText, Pencil, TerminalSquare, X,
} from "lucide-react";
import type { DesktopInteractionRequest, ExtensionUiRequest } from "../../../shared/types";
import type { AvailableCommand } from "../../../shared/conversation";
import { initialElicitationValues, validateElicitationValues } from "../../../shared/interactions";
import type { ToolActivity } from "../../lib/conversation";
import type { ChainConversationStore } from "../../lib/chains";
import { localizeExtensionUiRequest, useI18n } from "../../lib/i18n";
import { parseExitPlanPermission, parseStructuredPlan } from "../../lib/plan";
import { cleanError, localizeInteractionError } from "../../lib/app-helpers";
import { PlanTodoList } from "../plans/PlanCards";

export function SideChatPanel({
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

export function DesktopInteractionCard({
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

export function InlineExtensionRequest({
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
