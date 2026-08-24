import type { MentionKind, MentionRef } from "../../../shared/mentions";
import type { SessionSummary, WorkspaceItem } from "../../../shared/types";
import type { ChatAnnotation, ChatImage } from "../../lib/conversation";
import type { PositionedMention } from "../../lib/mentions";
import type { SidebarSessionGroupKey } from "../../lib/sidebar-order";

export interface Attachment extends ChatImage {
  name: string;
}

export interface QueuedPrompt {
  text: string;
  images: ChatImage[];
  annotations?: ChatAnnotation[];
  mentions?: PositionedMention[];
}

export interface MentionMenuOption {
  id: string;
  label: string;
  detail?: string;
  disabled?: boolean;
  category?: MentionKind;
  mention?: MentionRef;
}

export interface PreviewImage extends ChatImage {
  alt: string;
}

export type SidebarDragState =
  | { kind: "project"; id: string }
  | { kind: "session"; id: string; groupKey: SidebarSessionGroupKey };

export type SidebarDragSnapshot =
  | { kind: "project"; id: string; original: WorkspaceItem[] }
  | { kind: "session"; id: string; groupKey: SidebarSessionGroupKey; original: SessionSummary[] };
