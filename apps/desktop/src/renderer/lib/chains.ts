import type { AgentEvent } from "../../shared/conversation";
import { applyAgentEvent, optimisticUserMessage, type ChatMessage } from "./conversation";

export interface ChainConversationState {
  sessionId: string;
  chainId: string;
  generation: number;
  messages: ChatMessage[];
  running: boolean;
  error?: string;
}

export type ChainConversationStore = Record<string, ChainConversationState>;

export function chainConversationKey(sessionId: string, chainId: string): string {
  return `${sessionId}\u0000${chainId}`;
}

export function beginChainConversation(
  store: ChainConversationStore,
  sessionId: string,
  chainId: string,
  prompt: string,
  generation: number,
): ChainConversationStore {
  const key = chainConversationKey(sessionId, chainId);
  const existing = store[key];
  const messages = existing?.generation === generation ? existing.messages : [];
  return {
    ...store,
    [key]: {
      sessionId,
      chainId,
      generation,
      messages: [...messages, optimisticUserMessage(prompt)],
      running: true,
    },
  };
}

export function reduceChainConversation(
  store: ChainConversationStore,
  event: AgentEvent,
  generation: number,
): ChainConversationStore {
  if (!event.chainId) return store;
  const key = chainConversationKey(event.sessionId, event.chainId);
  const current = store[key];
  const base: ChainConversationState = current?.generation === generation
    ? current
    : { sessionId: event.sessionId, chainId: event.chainId, generation, messages: [], running: true };
  if (event.type === "error") {
    return { ...store, [key]: { ...base, running: false, error: event.message } };
  }
  return { ...store, [key]: { ...base, messages: applyAgentEvent(base.messages, event), error: undefined } };
}

export function settleChainConversation(
  store: ChainConversationStore,
  sessionId: string,
  chainId: string,
  generation: number,
  error?: string,
): ChainConversationStore {
  const key = chainConversationKey(sessionId, chainId);
  const current = store[key];
  if (!current || current.generation !== generation) return store;
  return { ...store, [key]: { ...current, running: false, ...(error ? { error } : {}) } };
}

export function clearChainGeneration(store: ChainConversationStore, generation: number): ChainConversationStore {
  return Object.fromEntries(Object.entries(store).filter(([, state]) => state.generation === generation));
}
