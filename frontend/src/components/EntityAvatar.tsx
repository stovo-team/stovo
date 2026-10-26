import { Archive, AudioLines, Bell, BookOpen, Camera, Folder, Heart, Home, Megaphone, Music, Shield, Sparkles, Star, UserRound, Users } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

import type { FamilyFile } from "../api/files";
import useFilePreviewUrl from "../hooks/useFilePreviewUrl";
import { avatarInitials } from "../utils/avatarInitials";
import { colorForAvatarId, defaultAvatarSymbol, isKnownAvatarColorId, isKnownAvatarSymbolId } from "./entityAvatar";
import type { AvatarEntityKind, AvatarSymbolId } from "./entityAvatar";

const symbols = {
  "user-round": UserRound,
  users: Users,
  home: Home,
  archive: Archive,
  "audio-lines": AudioLines,
  megaphone: Megaphone,
  folder: Folder,
  heart: Heart,
  star: Star,
  music: Music,
  "book-open": BookOpen,
  camera: Camera,
  shield: Shield,
  sparkles: Sparkles,
  bell: Bell
} satisfies Record<Exclude<AvatarSymbolId, "initials">, typeof UserRound>;

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
  const resolvedMode = mode ?? (file ? "photo" : "symbol");
  const showPhoto = resolvedMode === "photo" && Boolean(previewUrl) && !imageBroken;
  const defaultSymbol = defaultAvatarSymbol(entityKind);
  const resolvedSymbol = isKnownAvatarSymbolId(symbolId) ? symbolId : defaultSymbol;
  const resolvedColor = isKnownAvatarColorId(colorId) ? colorId : colorForAvatarId(entityId);
  const avatarStyle: CSSProperties = {
    ...style,
    "--avatar-custom-bg": `var(--avatar-color-${resolvedColor})`,
    ...(size ? { height: size, width: size } : {})
  } as CSSProperties;
  const Icon = resolvedSymbol === "initials" ? null : symbols[resolvedSymbol];

  return (
    <span className={`avatar entity-avatar${className ? ` ${className}` : ""}`} data-avatar-color={resolvedColor} style={avatarStyle}>
      {showPhoto ? <img src={previewUrl ?? undefined} alt="" draggable={false} onError={() => setImageBroken(true)} /> : Icon ? <Icon aria-hidden className="entity-avatar__symbol" /> : <span className="avatar-initials">{avatarInitials(label ?? undefined)}</span>}
    </span>
  );
}
