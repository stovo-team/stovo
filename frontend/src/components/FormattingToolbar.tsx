import type React from "react";
import { createPortal } from "react-dom";

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

const formattingActions = [
  { kind: "bold", label: "Bold", Icon: IconBold },
  { kind: "italic", label: "Italic", Icon: IconItalic },
  { kind: "underline", label: "Underline", Icon: IconUnderline },
  { kind: "strikethrough", label: "Strikethrough", Icon: IconStrikethrough },
  { kind: "spoiler", label: "Spoiler", Icon: IconSpoiler }
] as const satisfies ReadonlyArray<{
  kind: FormattingKind;
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
}>;

export function FormattingToolbar(
  { selection, anchor, onFormat }: FormattingToolbarProps
): React.ReactNode {
  if (
    !selection ||
    selection.end <= selection.start ||
    !anchor ||
    typeof document === "undefined"
  ) {
    return null;
  }

  return createPortal(
    <div
      className="formatting-toolbar"
      role="toolbar"
      aria-label="Format selected text"
      style={{ position: "fixed", left: anchor.left, top: anchor.top }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {formattingActions.map(({ kind, label, Icon }) => (
        <button
          key={kind}
          type="button"
          className="formatting-toolbar-action"
          aria-label={label}
          title={label}
          onClick={(event) => {
            event.stopPropagation();
            onFormat(kind);
          }}
        >
          <Icon size={20} />
        </button>
      ))}
    </div>,
    document.body
  );
}
