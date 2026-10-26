import type { FamilyFile } from "../../api/files";
import { EntityAvatar } from "../../components/EntityAvatar";

export function SettingsAvatar({
  accessToken, file, label, size = "lg", entityId, mode, symbolId, colorId
}: {
  accessToken: string | null;
  file: FamilyFile | null | undefined;
  label: string | undefined;
  size?: "default" | "lg";
  entityId?: string;
  mode?: "photo" | "symbol";
  symbolId?: string | null;
  colorId?: string | null;
}) {
  return (
    <EntityAvatar
      accessToken={accessToken}
      className={`user-avatar-preview${size === "lg" ? " avatar-lg" : ""}`}
      entityId={entityId ?? label ?? "person"}
      entityKind="person"
      file={file}
      label={label}
      mode={mode}
      symbolId={symbolId}
      colorId={colorId}
    />
  );
}
