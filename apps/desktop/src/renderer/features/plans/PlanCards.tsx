import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Bot, Check, ChevronRight, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import type { AuthUiEvent } from "../../../shared/types";
import { AUTH_PROMPT_CANCEL_VALUE } from "../../../shared/types";
import type { PlanStepStatus, StructuredPlan } from "../../lib/plan";
import { useI18n } from "../../lib/i18n";

interface EditablePlanStep {
  id: string;
  step: string;
  status: PlanStepStatus;
}

export function EditablePlanCard({ plan, onSave }: { plan: StructuredPlan; onSave(plan: StructuredPlan): boolean }) {
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

export function PlanTodoList({ plan, action }: { plan: StructuredPlan; action?: ReactNode }) {
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

export function AuthPromptDialog({ event, onDone, onCancel }: { event: Extract<AuthUiEvent, { kind: "prompt" }>; onDone(): void; onCancel(): void }) {
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

export function AuthNotice({ event, onClose }: { event: Extract<AuthUiEvent, { kind: "notice" }>; onClose(): void }) {
  const { t } = useI18n();
  const notice = event.event;
  const instructions = notice.type === "device_code" ? t("auth.deviceCodeInstructions") : t("auth.browserOpened");
  return <div className="modal-backdrop"><div className="approval-dialog" role="dialog" aria-modal="true"><div className="approval-icon"><Bot size={19} /></div><h3>{notice.type === "device_code" ? t("auth.completeSignIn") : t("auth.continueInBrowser")}</h3><p>{instructions}</p>{notice.userCode && <div className="device-code">{notice.userCode}</div>}<div className="dialog-actions"><button className="primary-button" onClick={onClose}>{t("auth.done")}</button></div></div></div>;
}
