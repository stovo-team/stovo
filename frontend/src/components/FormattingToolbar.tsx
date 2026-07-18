import type React from "react";

import type {
  FormattingKind,
  TextSelection,
  ToolbarAnchor
} from "../composerFormatting";

export type FormattingToolbarProps = {
  selection: TextSelection | null;
  anchor: ToolbarAnchor | null;
  onFormat: (kind: FormattingKind) => void;
};

export function FormattingToolbar(
  _props: FormattingToolbarProps
): React.ReactNode {
  return null;
}
