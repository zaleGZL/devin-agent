import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SessionSummary, WorkspaceItem } from "../../../shared/types";
import { I18nProvider } from "../../lib/i18n";
import { AppSidebar, type AppSidebarProps } from "./AppSidebar";

const project: WorkspaceItem = {
  path: "/workspace/devin-agent",
  name: "devin-agent",
  lastOpenedAt: "2026-08-25T00:00:00.000Z",
};

const session: SessionSummary = {
  id: "session-1",
  path: "/sessions/session-1",
  cwd: project.path,
  title: "Improve sidebar hierarchy",
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
};

function createProps(overrides: Partial<AppSidebarProps> = {}): AppSidebarProps {
  return {
    sidebarOpen: true,
    sessionQuery: "",
    activeView: "thread",
    pinnedSessions: [],
    recentTasks: [],
    selectedThreadPath: session.path,
    runningSessionIds: new Set(),
    unreadSessionIds: new Set(),
    sessionRenameDraft: "",
    sessionRenameInputRef: createRef<HTMLInputElement>(),
    projectsSectionOpen: true,
    filteredWorkspaces: [project],
    projectSessions: new Map([[project.path, [session]]]),
    expandedProjects: new Set([project.path]),
    fullyExpandedProjects: new Set(),
    recentSectionOpen: true,
    projectRenameDraft: "",
    projectRenameInputRef: createRef<HTMLInputElement>(),
    profile: { nickname: "Zale" },
    setSessionQuery: vi.fn(),
    setSearchOpen: vi.fn(),
    setSidebarOpen: vi.fn(),
    setActiveView: vi.fn(),
    setProjectsSectionOpen: vi.fn(),
    setRecentSectionOpen: vi.fn(),
    setFullyExpandedProjects: vi.fn(),
    setSessionRenameDraft: vi.fn(),
    setProjectRenameDraft: vi.fn(),
    setSettingsOpen: vi.fn(),
    createNewThread: vi.fn(async () => undefined),
    createThreadInProject: vi.fn(async () => undefined),
    openSession: vi.fn(async () => undefined),
    openSessionMenu: vi.fn(),
    openProjectMenu: vi.fn(),
    dragSessionOver: vi.fn(),
    dragProjectOver: vi.fn(),
    finishSidebarDrag: vi.fn(async () => undefined),
    startSessionDrag: vi.fn(),
    startProjectDrag: vi.fn(),
    cancelSidebarDrag: vi.fn(),
    moveSessionByKeyboard: vi.fn(async () => undefined),
    moveProjectByKeyboard: vi.fn(async () => undefined),
    commitSessionRename: vi.fn(async () => undefined),
    cancelSessionRename: vi.fn(),
    commitProjectRename: vi.fn(async () => undefined),
    cancelProjectRename: vi.fn(),
    toggleWorkspace: vi.fn(),
    ...overrides,
  };
}

function renderSidebar(props: AppSidebarProps): string {
  return renderToStaticMarkup(
    <I18nProvider>
      <AppSidebar {...props} />
    </I18nProvider>,
  );
}

describe("AppSidebar", () => {
  it("makes project and session items draggable without rendering drag handles", () => {
    const html = renderSidebar(createProps());

    expect(html.match(/draggable="true"/g)).toHaveLength(2);
    expect(html).not.toContain("sidebar-drag-handle");
    expect(html).not.toContain("lucide-grip-vertical");
  });

  it("exposes project sessions as a named child group", () => {
    const html = renderSidebar(createProps());

    expect(html).toContain('class="project-task-list" role="group" aria-label="devin-agent"');
    expect(html.match(/aria-keyshortcuts="Alt\+ArrowUp Alt\+ArrowDown"/g)).toHaveLength(2);
  });
});
