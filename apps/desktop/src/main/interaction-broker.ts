import { randomUUID } from "node:crypto";

export interface PendingInteractionMetadata {
  kind: "permission" | "elicitation-form" | "elicitation-url";
  generation: number;
  sessionId?: string;
  toolCallId?: string;
  requestId?: string | number | null;
  ownerId?: number;
}

export interface PendingInteraction<TRequest = unknown, TResult = unknown> extends PendingInteractionMetadata {
  id: string;
  request: TRequest;
  openedAt: number;
  resolve(result: TResult): void;
  cancelResult: TResult;
  timer?: ReturnType<typeof setTimeout>;
}

export interface OpenInteractionOptions<TResult> extends PendingInteractionMetadata {
  id?: string;
  timeoutMs?: number;
  cancelResult: TResult;
}

export class InteractionBroker {
  private readonly pending = new Map<string, PendingInteraction<any, any>>();

  constructor(private readonly createId: () => string = randomUUID) {}

  open<TRequest, TResult>(request: TRequest, options: OpenInteractionOptions<TResult>): { id: string; result: Promise<TResult> } {
    const id = options.id || this.createId();
    if (this.pending.has(id)) throw new Error(`Interaction already exists: ${id}`);
    let resolveResult!: (result: TResult) => void;
    const result = new Promise<TResult>((resolve) => { resolveResult = resolve; });
    const pending: PendingInteraction<TRequest, TResult> = {
      id,
      request,
      kind: options.kind,
      generation: options.generation,
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
      ...(options.toolCallId ? { toolCallId: options.toolCallId } : {}),
      ...(options.requestId !== undefined ? { requestId: options.requestId } : {}),
      ...(options.ownerId !== undefined ? { ownerId: options.ownerId } : {}),
      openedAt: Date.now(),
      resolve: resolveResult,
      cancelResult: options.cancelResult,
    };
    if (options.timeoutMs && options.timeoutMs > 0) {
      pending.timer = setTimeout(() => this.cancel(id), options.timeoutMs);
    }
    this.pending.set(id, pending);
    return { id, result };
  }

  settle<TResult>(id: string, result: TResult, generation?: number): boolean {
    const pending = this.pending.get(id);
    if (!pending || (generation !== undefined && pending.generation !== generation)) return false;
    this.finish(pending, result);
    return true;
  }

  cancel(id: string): boolean {
    const pending = this.pending.get(id);
    if (!pending) return false;
    this.finish(pending, pending.cancelResult);
    return true;
  }

  cancelSession(sessionId: string): number { return this.cancelWhere((pending) => pending.sessionId === sessionId); }
  cancelGeneration(generation: number): number { return this.cancelWhere((pending) => pending.generation === generation); }
  cancelOwner(ownerId: number): number { return this.cancelWhere((pending) => pending.ownerId === ownerId); }
  cancelAll(): number { return this.cancelWhere(() => true); }

  cancelWhere(predicate: (pending: Readonly<PendingInteraction>) => boolean): number {
    const ids = [...this.pending.values()].filter(predicate).map((pending) => pending.id);
    ids.forEach((id) => this.cancel(id));
    return ids.length;
  }

  get(id: string): Readonly<PendingInteraction> | undefined { return this.pending.get(id); }
  updateRequest<TRequest>(id: string, update: (request: TRequest) => TRequest): TRequest | undefined {
    const pending = this.pending.get(id);
    if (!pending) return undefined;
    pending.request = update(pending.request as TRequest);
    return pending.request as TRequest;
  }
  get size(): number { return this.pending.size; }

  private finish<TResult>(pending: PendingInteraction<unknown, TResult>, result: TResult): void {
    if (!this.pending.delete(pending.id)) return;
    if (pending.timer) clearTimeout(pending.timer);
    pending.resolve(result);
  }
}
