import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Code2, Quote } from "lucide-react";

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
};

type RectangleSize = {
  width: number;
  height: number;
};

type ViewportSize = RectangleSize;

const toolbarViewportGutter = 12;
const toolbarAnchorGap = 8;

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function getFormattingToolbarPlacement(
  anchor: ToolbarAnchor,
  toolbar: RectangleSize,
  viewport: ViewportSize,
  gutter = toolbarViewportGutter
): ToolbarAnchor {
  const safeGutter = finiteNonNegative(gutter);
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

  return {
    left: clamp(anchorLeft - toolbarWidth / 2, safeGutter, maximumLeft),
    top: clamp(
      anchorTop - toolbarHeight - toolbarAnchorGap,
      safeGutter,
      maximumTop
    )
  };
}

const formattingActions = [
  { kind: "bold", label: "Bold", description: "Strong emphasis", Icon: IconBold },
  { kind: "italic", label: "Italic", description: "Emphasis", Icon: IconItalic },
  { kind: "underline", label: "Underline", description: "Underline text", Icon: IconUnderline },
  { kind: "strikethrough", label: "Strike", description: "Strikethrough", Icon: IconStrikethrough },
  { kind: "spoiler", label: "Spoiler", description: "Hidden until tapped", Icon: IconSpoiler },
  { kind: "code", label: "Code", description: "Inline code", Icon: Code2 },
  { kind: "quote", label: "Quote", description: "Quoted reply style", Icon: Quote }
] as const satisfies ReadonlyArray<{
  kind: FormattingKind;
  label: string;
  description: string;
  Icon: React.ComponentType<{ size?: number }>;
}>;

export function FormattingToolbar(
  { selection, anchor, onFormat }: FormattingToolbarProps
): React.ReactNode {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<ToolbarAnchor | null>(null);
  const canRender = Boolean(
    selection &&
    selection.end > selection.start &&
    anchor &&
    typeof document !== "undefined"
  );

  useLayoutEffect(() => {
    if (!canRender || !anchor) {
      setPlacement(null);
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
        }
      ));
    };

    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [anchor, canRender]);

  if (!canRender) {
    return null;
  }

  return createPortal(
    <div
      ref={toolbarRef}
      className="formatting-toolbar"
      role="toolbar"
      aria-label="Format selected text"
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
      {formattingActions.map(({ kind, label, description, Icon }) => (
        <button
          key={kind}
          type="button"
          className="formatting-toolbar-action"
          aria-label={label}
          title={`${label} — ${description}`}
          onClick={(event) => {
            event.stopPropagation();
            onFormat(kind);
          }}
        >
          <Icon size={18} aria-hidden="true" />
          <span className="formatting-toolbar-action-label">{label}</span>
        </button>
      ))}
    </div>,
    document.body
  );
}
