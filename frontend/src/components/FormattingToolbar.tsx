import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
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
import { BackButton } from "./BackButton";
import { useStrings } from "../i18n/LanguageContext";

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

export function FormattingToolbar(
  { selection, anchor, onFormat, onCut, onCopy, onPaste }: FormattingToolbarProps
): React.ReactNode {
  const copy = useStrings().auditUi;
  const formattingActions = [
    { kind: "spoiler", label: copy.spoiler, description: copy.hiddenUntilTapped, Icon: IconSpoiler },
    { kind: "bold", label: copy.bold, description: copy.strongEmphasis, Icon: IconBold },
    { kind: "italic", label: copy.italic, description: copy.emphasis, Icon: IconItalic },
    { kind: "code", label: copy.mono, description: copy.inlineCode, Icon: Code2 },
    { kind: "strikethrough", label: copy.strike, description: copy.strikethrough, Icon: IconStrikethrough },
    { kind: "underline", label: copy.underline, description: copy.underlineText, Icon: IconUnderline },
    { kind: "quote", label: copy.quote, description: copy.quotedReplyStyle, Icon: Quote }
  ] as const satisfies ReadonlyArray<{
    kind: FormattingKind;
    label: string;
    description: string;
    Icon: React.ComponentType<{ size?: number }>;
  }>;
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
      aria-label={copy.textSelection}
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
            aria-label={copy.cut}
            title={copy.cut}
            onClick={(event) => {
              event.stopPropagation();
              onCut?.();
            }}
          >
            <Scissors size={15} aria-hidden="true" />
            <span className="formatting-toolbar-action-label">{copy.cut}</span>
          </button>
          <button
            type="button"
            className="formatting-toolbar-action"
            aria-label={copy.copy}
            title={copy.copy}
            onClick={(event) => {
              event.stopPropagation();
              onCopy?.();
            }}
          >
            <Copy size={15} aria-hidden="true" />
            <span className="formatting-toolbar-action-label">{copy.copy}</span>
          </button>
          <button
            type="button"
            className="formatting-toolbar-action"
            aria-label={copy.paste}
            title={copy.paste}
            onClick={(event) => {
              event.stopPropagation();
              onPaste?.();
            }}
          >
            <ClipboardPaste size={15} aria-hidden="true" />
            <span className="formatting-toolbar-action-label">{copy.paste}</span>
          </button>
          <button
            type="button"
            className="formatting-toolbar-action"
            aria-label={copy.quote}
            title={copy.quoteStyle}
            onClick={(event) => {
              event.stopPropagation();
              onFormat("quote");
            }}
          >
            <Quote size={15} aria-hidden="true" />
            <span className="formatting-toolbar-action-label">{copy.quote}</span>
          </button>
          <span className="formatting-toolbar-divider" aria-hidden="true" />
          <button
            type="button"
            className="formatting-toolbar-action formatting-toolbar-more"
            aria-label={copy.formatting}
            aria-expanded={false}
            aria-haspopup="menu"
            title={copy.formatting}
            onClick={(event) => {
              event.stopPropagation();
              setFormatOpen(true);
            }}
          >
            <MoreVertical size={16} aria-hidden="true" />
          </button>
        </>
      ) : (
        <div className="formatting-toolbar-submenu" role="menu" aria-label={copy.formattingOptions}>
          <BackButton
            className="formatting-toolbar-back"
            ariaLabel={copy.back}
            title={copy.back}
            onClick={(event) => {
              event.stopPropagation();
              setFormatOpen(false);
            }}
          />
          <span className="formatting-toolbar-divider" aria-hidden="true" />
          {formattingActions.filter((action) => action.kind !== "quote").map(({ kind, label, description, Icon }) => (
            <button
              key={kind}
              type="button"
              role="menuitem"
              className="formatting-toolbar-action"
              aria-label={label}
              title={copy.by(label, description)}
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
