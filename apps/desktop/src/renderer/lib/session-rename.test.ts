import { describe, expect, it } from "vitest";
import { confirmSessionRename, optimisticSessionRename, rollbackSessionRename } from "./session-rename";

const original = { id: "s", path: "s", cwd: "/tmp", title: "Old", createdAt: "2026-08-23T00:00:00Z", updatedAt: "2026-08-23T00:00:00Z", titleSource: "server" as const };

describe("renderer session rename state", () => {
  it("optimistically updates, confirms native source and removes local override", () => {
    const optimistic = optimisticSessionRename(original, "New");
    expect(optimistic).toMatchObject({ title: "New", customTitle: "New" });
    expect(confirmSessionRename(optimistic, { ...original, title: "Confirmed", titleSource: "native", titleUpdatedAt: "2026-08-23T00:01:00Z" })).toEqual(expect.objectContaining({ title: "Confirmed", titleSource: "native", customTitle: undefined }));
  });

  it("restores the complete previous state on failure", () => {
    expect(rollbackSessionRename(optimisticSessionRename(original, "New"), original)).toEqual(original);
  });
});
