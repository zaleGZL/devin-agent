export interface ModelPickerItem {
  id: string;
  name?: string;
  description?: string;
}

export function organizeModels<T extends ModelPickerItem>(
  models: T[],
  pinnedModelIds: string[],
  query: string,
): { pinned: T[]; others: T[] } {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const uniqueModels = [...new Map(models.map((model) => [model.id, model])).values()];
  const visibleModels = normalizedQuery
    ? uniqueModels.filter((model) => `${model.name ?? ""} ${model.id} ${model.description ?? ""}`.toLocaleLowerCase().includes(normalizedQuery))
    : uniqueModels;
  const byId = new Map(visibleModels.map((model) => [model.id, model]));
  const pinned = pinnedModelIds.flatMap((id) => {
    const model = byId.get(id);
    if (!model) return [];
    byId.delete(id);
    return [model];
  });
  return { pinned, others: visibleModels.filter((model) => byId.has(model.id)) };
}

export function togglePinnedModelId(pinnedModelIds: string[], modelId: string, limit = 32): string[] {
  return pinnedModelIds.includes(modelId)
    ? pinnedModelIds.filter((id) => id !== modelId)
    : [modelId, ...pinnedModelIds.filter((id) => id !== modelId)].slice(0, limit);
}
