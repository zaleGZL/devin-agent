import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Box, Check, ChevronDown, Code2, FileText, LoaderCircle, MessageSquareText, Paperclip,
  Pin, Plus, Search, Shield, ShieldOff, Sparkles,
} from "lucide-react";
import type { AgentSnapshot, PermissionMode } from "../../../shared/types";
import { useI18n } from "../../lib/i18n";
import { getModePresentation, type ModeKind } from "../../lib/mode-presentation";
import { organizeModels, togglePinnedModelId } from "../../lib/model-picker";
import { shortModel } from "../../lib/app-helpers";

export function AttachmentMenu({ onChange }: { onChange(event: ChangeEvent<HTMLInputElement>): void }) {
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

export function PermissionPicker({ value, modes, updating, disabled, onChange }: { value: PermissionMode; modes: NonNullable<AgentSnapshot["modes"]>; updating: boolean; disabled: boolean; onChange(value: PermissionMode): void }) {
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

export function ModelPicker({
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
