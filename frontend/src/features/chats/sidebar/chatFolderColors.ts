import type { CSSProperties } from "react";

import { colorForAvatarId } from "../../../components/avatarIdentity";

export function chatFolderColorValue(id: string, colorId?: string | null): string {
  if (id === "default-groups" && colorId == null) return "var(--text-secondary)";
  const color = colorId ?? (id === "default-dms" ? "blue" : id.startsWith("default-") ? null : colorForAvatarId(id));
  if (color === null) return "var(--accent-primary)";
  return color.startsWith("#") ? color : `var(--avatar-color-${color})`;
}

export function chatFolderColorStyle(id: string, colorId?: string | null): CSSProperties {
  return { "--folder-color": chatFolderColorValue(id, colorId) } as CSSProperties;
}

export function chatFolderAvatarStyle(id: string, colorId?: string | null): CSSProperties {
  return { color: chatFolderColorValue(id, colorId) };
}
