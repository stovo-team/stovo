import { AVATAR_SYMBOL_COMPONENTS as symbols } from "./avatarSymbols";
import { useEffect, useState, type CSSProperties } from "react";

import type { FamilyFile } from "../api/files";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";
import { avatarInitials } from "../utils/avatarInitials";
import { colorForAvatarId, defaultAvatarSymbol, isKnownAvatarColorId, isKnownAvatarSymbolId } from "./avatarIdentity";
import type { AvatarEntityKind } from "./avatarIdentity";

export type EntityAvatarProps = {
  accessToken: string | null;
  className?: string;
  entityId: string;
  entityKind: AvatarEntityKind;
  file?: FamilyFile | null;
  label?: string | null;
  mode?: "photo" | "symbol";
  symbolId?: string | null;
  colorId?: string | null;
  size?: number;
  style?: CSSProperties;
};

export function EntityAvatar({
  accessToken, className = "", entityId, entityKind, file, label, mode, symbolId, colorId, size, style
}: EntityAvatarProps) {
  const previewUrl = useFilePreviewUrl(accessToken, file ?? null, Boolean(file?.id));
  const [imageBroken, setImageBroken] = useState(false);
  useEffect(() => setImageBroken(false), [file?.id, previewUrl]);
  const resolvedMode = entityKind === "person" ? (file ? "photo" : "symbol") : mode ?? (file ? "photo" : "symbol");
  const showPhoto = resolvedMode === "photo" && Boolean(previewUrl) && !imageBroken;
  const defaultSymbol = defaultAvatarSymbol(entityKind);
  const resolvedSymbol = entityKind === "person" ? "initials" : isKnownAvatarSymbolId(symbolId) ? symbolId : defaultSymbol;
  const resolvedColor = isKnownAvatarColorId(colorId) ? colorId : colorForAvatarId(entityId);
  const avatarStyle: CSSProperties = {
    ...style,
    "--avatar-custom-bg": resolvedColor.startsWith("#") ? resolvedColor : `var(--avatar-color-${resolvedColor})`,
    ...(size ? { height: size, width: size } : {})
  } as CSSProperties;
  const Icon = resolvedSymbol === "initials" ? null : symbols[resolvedSymbol];

  return (
    <span className={`avatar entity-avatar${className ? ` ${className}` : ""}`} data-avatar-color={resolvedColor} data-avatar-kind={entityKind} style={avatarStyle}>
      {showPhoto ? <img src={previewUrl ?? undefined} alt="" draggable={false} onError={() => setImageBroken(true)} /> : Icon ? <Icon aria-hidden className="entity-avatar__symbol" /> : <span className="avatar-initials">{avatarInitials(label ?? undefined)}</span>}
    </span>
  );
}
