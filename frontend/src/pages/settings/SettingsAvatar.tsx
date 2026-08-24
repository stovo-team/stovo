import type { FamilyFile } from "../../api/files";
import useFilePreviewUrl from "../../hooks/useFilePreviewUrl";

export function SettingsAvatar({ accessToken, file, label, size = "lg" }: { accessToken: string | null; file: FamilyFile | null | undefined; label: string | undefined; size?: "default" | "lg" }) {
  const previewUrl = useFilePreviewUrl(accessToken, file ?? null, Boolean(file));
  return <span className={`avatar${size === "lg" ? " avatar-lg" : ""} user-avatar-preview`}>
    {previewUrl ? <img src={previewUrl} alt="" /> : initials(label)}
  </span>;
}

function initials(name: string | undefined) {
  return (name ?? "Stovo").split(" ").filter(Boolean).slice(0, 2).map((part) => part.at(0)?.toUpperCase()).join("");
}
