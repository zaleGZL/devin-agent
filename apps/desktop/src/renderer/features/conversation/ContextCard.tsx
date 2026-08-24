import { Gauge } from "lucide-react";
import type { AgentSessionStats, ProviderId } from "../../../shared/types";
import { useI18n } from "../../lib/i18n";
import { clampPercent, formatCompactTokens, formatCost, formatPercent, shortModel } from "../../lib/app-helpers";

export function ContextCard({
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
