import { CSSProperties, useEffect, useState } from "react";
import { Home, Megaphone, Users } from "lucide-react";

import { FamilyFile } from "../../../api/files";
import useFilePreviewUrl from "../../../hooks/useFilePreviewUrl";
import { chatInitials } from "../shared/chatPresentation";
import type { ChatAvatarFallbackKind } from "../shared/types";

export function RealAvatar({
  accessToken,
  className,
  file,
  fallbackKind = "direct",
  label,
  style
}: {
  accessToken: string | null;
  className: string;
  file: FamilyFile | null | undefined;
  fallbackKind?: ChatAvatarFallbackKind;
  label: string;
  style?: CSSProperties;
}) {
  const previewUrl = useFilePreviewUrl(accessToken, file ?? null, Boolean(file));
  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    setImageBroken(false);
  }, [file?.id, previewUrl]);

  function renderFallback() {
    const isXl = className.includes("avatar-xl");
    const iconSize = isXl ? 56 : 24;

    if (fallbackKind === "group") {
      return <Users aria-hidden className="avatar-fallback-svg" size={iconSize} strokeWidth={1.75} />;
    }
    if (fallbackKind === "channel") {
      return <Megaphone aria-hidden className="avatar-fallback-svg" size={iconSize} strokeWidth={1.75} />;
    }
    if (fallbackKind === "family") {
      return <Home aria-hidden className="avatar-fallback-svg" size={iconSize} strokeWidth={1.75} />;
    }
    return chatInitials(label);
  }

  const showImage = Boolean(previewUrl) && !imageBroken;

  return (
    <span className={className} style={style}>
      {showImage ? (
        <img
          src={previewUrl ?? undefined}
          alt=""
          onError={() => setImageBroken(true)}
        />
      ) : (
        renderFallback()
      )}
    </span>
  );
}
