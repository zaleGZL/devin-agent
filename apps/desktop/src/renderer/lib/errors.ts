/** Stable sentinel used by the ACP authentication bridge when a prompt is cancelled. */
export const AUTH_PROMPT_CANCEL_VALUE = "__devin_auth_prompt_cancel__";

export function isAgentSessionClosedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\bAgent session closed\b/i.test(message);
}

export function isAuthPromptCancelledError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(AUTH_PROMPT_CANCEL_VALUE) || /\bLogin prompt cancelled\b/i.test(message);
}
