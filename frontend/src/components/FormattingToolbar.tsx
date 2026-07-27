import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ClipboardPaste,
  Code2,
  Copy,
  MoreVertical,
  Quote,
  Scissors,
} from "lucide-react";

import type {
  FormattingKind,
  TextSelection,
  ToolbarAnchor
} from "../composerFormatting";
import {
  IconBold,
  IconItalic,
  IconSpoiler,
  IconStrikethrough,
  IconUnderline
} from "./icons";

export type FormattingToolbarProps = {
  selection: TextSelection | null;
  anchor: ToolbarAnchor | null;
  onFormat: (kind: FormattingKind) => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
};

type RectangleSize = {
  width: number;
  height: number;
};

type ViewportSize = RectangleSize;

const toolbarViewportGutter = 12;
const toolbarAnchorGap = 8;
const formatMenuAnchorGap = 20;
/** Shift the vertical format menu right of the selection center. */
const formatMenuRightBias = 56;

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export type FormattingToolbarPlacementOptions = {
  formatOpen?: boolean;
  gutter?: number;
};

export function getFormattingToolbarPlacement(
  anchor: ToolbarAnchor,
  toolbar: RectangleSize,
  viewport: ViewportSize,
  gutterOrOptions: number | FormattingToolbarPlacementOptions = toolbarViewportGutter
): ToolbarAnchor {
  const options: FormattingToolbarPlacementOptions =
    typeof gutterOrOptions === "number"
      ? { gutter: gutterOrOptions }
      : gutterOrOptions;
  const safeGutter = finiteNonNegative(options.gutter ?? toolbarViewportGutter);
  const toolbarWidth = finiteNonNegative(toolbar.width);
  const toolbarHeight = finiteNonNegative(toolbar.height);
  const viewportWidth = finiteNonNegative(viewport.width);
  const viewportHeight = finiteNonNegative(viewport.height);
  const anchorLeft = Number.isFinite(anchor.left) ? anchor.left : safeGutter;
  const anchorTop = Number.isFinite(anchor.top) ? anchor.top : safeGutter;
  const maximumLeft = Math.max(
    safeGutter,
    viewportWidth - safeGutter - toolbarWidth
  );
  const maximumTop = Math.max(
    safeGutter,
    viewportHeight - safeGutter - toolbarHeight
  );
  const formatOpen = Boolean(options.formatOpen);
  const preferredLeft = formatOpen
    ? anchorLeft - toolbarWidth * 0.2 + formatMenuRightBias
    : anchorLeft - toolbarWidth / 2;
  const gap = formatOpen ? formatMenuAnchorGap : toolbarAnchorGap;

  return {
    left: clamp(preferredLeft, safeGutter, maximumLeft),
    top: clamp(anchorTop - toolbarHeight - gap, safeGutter, maximumTop)
  };
}

const formattingActions = [
  { kind: "spoiler", label: "Spoiler", description: "Hidden until tapped", Icon: IconSpoiler },
  { kind: "bold", label: "Bold", description: "Strong emphasis", Icon: IconBold },
  { kind: "italic", label: "Italic", description: "Emphasis", Icon: IconItalic },
  { kind: "code", label: "Mono", description: "Inline code", Icon: Code2 },
  { kind: "strikethrough", label: "Strike", description: "Strikethrough", Icon: IconStrikethrough },
  { kind: "underline", label: "Underline", description: "Underline text", Icon: IconUnderline },
  { kind: "quote", label: "Quote", description: "Quoted reply style", Icon: Quote }
] as const satisfies ReadonlyArray<{
  kind: FormattingKind;
  label: string;
  description: string;
  Icon: React.ComponentType<{ size?: number }>;
}>;

export function FormattingToolbar(
  { selection, anchor, onFormat, onCut, onCopy, onPaste }: FormattingToolbarProps
): React.ReactNode {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<ToolbarAnchor | null>(null);
  const [formatOpen, setFormatOpen] = useState(false);
  const canRender = Boolean(
    selection &&
    selection.end > selection.start &&
    anchor &&
    typeof document !== "undefined"
  );

  useLayoutEffect(() => {
    if (!canRender || !anchor) {
      setPlacement(null);
      setFormatOpen(false);
      return;
    }

    const reposition = () => {
      const element = toolbarRef.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      setPlacement(getFormattingToolbarPlacement(
        anchor,
        { width: bounds.width, height: bounds.height },
        {
          width: window.innerWidth || document.documentElement.clientWidth,
          height: window.innerHeight || document.documentElement.clientHeight
        },
        { formatOpen }
      ));
    };

    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [anchor, canRender, formatOpen]);

  if (!canRender) {
    return null;
  }

  return createPortal(
    <div
      ref={toolbarRef}
      className={`formatting-toolbar${formatOpen ? " is-format-open" : ""}`}
      role="toolbar"
      aria-label="Text selection"
      style={{
        position: "fixed",
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        visibility: placement ? "visible" : "hidden",
        zIndex: 10000
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {!formatOpen ? (
        <>
          <button
            type="button"
            className="formatting-toolbar-action"
            aria-label="Cut"
            title="Cut"
            onClick={(event) => {
              event.stopPropagation();
              onCut?.();
            }}
          >
            <Scissors size={15} aria-hidden="true" />
            <span className="formatting-toolbar-action-label">Cut</span>
          </button>
          <button
            type="button"
            className="formatting-toolbar-action"
            aria-label="Copy"
            title="Copy"
            onClick={(event) => {
              event.stopPropagation();
              onCopy?.();
            }}
          >
            <Copy size={15} aria-hidden="true" />
            <span className="formatting-toolbar-action-label">Copy</span>
          </button>
          <button
            type="button"
            className="formatting-toolbar-action"
            aria-label="Paste"
            title="Paste"
            onClick={(event) => {
              event.stopPropagation();
              onPaste?.();
            }}
          >
            <ClipboardPaste size={15} aria-hidden="true" />
            <span className="formatting-toolbar-action-label">Paste</span>
          </button>
          <button
            type="button"
            className="formatting-toolbar-action"
            aria-label="Quote"
            title="Quote — Quoted reply style"
            onClick={(event) => {
              event.stopPropagation();
              onFormat("quote");
            }}
          >
            <Quote size={15} aria-hidden="true" />
            <span className="formatting-toolbar-action-label">Quote</span>
          </button>
          <span className="formatting-toolbar-divider" aria-hidden="true" />
          <button
            type="button"
            className="formatting-toolbar-action formatting-toolbar-more"
            aria-label="Formatting"
            aria-expanded={false}
            aria-haspopup="menu"
            title="Formatting"
            onClick={(event) => {
              event.stopPropagation();
              setFormatOpen(true);
            }}
          >
            <MoreVertical size={16} aria-hidden="true" />
          </button>
        </>
      ) : (
        <div className="formatting-toolbar-submenu" role="menu" aria-label="Formatting options">
          <button
            type="button"
            className="formatting-toolbar-action formatting-toolbar-back"
            aria-label="Back"
            title="Back"
            onClick={(event) => {
              event.stopPropagation();
              setFormatOpen(false);
            }}
          >
            <ChevronLeft size={15} aria-hidden="true" />
            <span className="formatting-toolbar-action-label">Back</span>
          </button>
          <span className="formatting-toolbar-divider" aria-hidden="true" />
          {formattingActions.filter((action) => action.kind !== "quote").map(({ kind, label, description, Icon }) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              className="formatting-toolbar-action"
              aria-label={label}
              title={`${label} — ${description}`}
              onClick={(event) => {
                event.stopPropagation();
                onFormat(kind);
                setFormatOpen(false);
              }}
            >
              <Icon size={15} aria-hidden="true" />
              <span className="formatting-toolbar-action-label">{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}
