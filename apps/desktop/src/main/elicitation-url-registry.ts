export class ElicitationUrlRegistry {
  private readonly interactions = new Map<string, string>();

  register(elicitationId: string, interactionId: string): void {
    this.interactions.set(elicitationId, interactionId);
  }

  get(elicitationId: string): string | undefined {
    return this.interactions.get(elicitationId);
  }

  unregister(elicitationId: string, interactionId: string): boolean {
    if (this.interactions.get(elicitationId) !== interactionId) return false;
    this.interactions.delete(elicitationId);
    return true;
  }

  clear(): void { this.interactions.clear(); }
}
