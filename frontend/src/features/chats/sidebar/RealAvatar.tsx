import type { CSSProperties } from "react";

import type { FamilyFile } from "../../../api/files";
import { EntityAvatar } from "../../../components/EntityAvatar";
import type { AvatarEntityKind } from "../../../components/avatarIdentity";
import type { ChatAvatarFallbackKind } from "../shared/types";

const entityKindForFallback: Record<ChatAvatarFallbackKind, AvatarEntityKind> = {
  direct: "person", group: "group", family: "family", archive: "archive", voice: "voice", channel: "channel"
};

export function RealAvatar({
  accessToken, className, file, fallbackKind = "direct", label, style, entityId,
  mode, symbolId, colorId
}: {
  accessToken: string | null;
  className: string;
  file: FamilyFile | null | undefined;
  fallbackKind?: ChatAvatarFallbackKind;
  label: string;
  style?: CSSProperties;
  entityId?: string;
  mode?: "photo" | "symbol";
  symbolId?: string | null;
  colorId?: string | null;
}) {
  const classNames = `${className}${fallbackKind && !className.includes(fallbackKind) ? ` ${fallbackKind}` : ""}`;
  return (
    <EntityAvatar
      accessToken={accessToken}
      className={classNames}
      entityId={entityId ?? label}
      entityKind={entityKindForFallback[fallbackKind]}
      file={file}
      label={label}
      mode={mode}
      symbolId={symbolId}
      colorId={colorId}
      style={style}
    />
  );
}
