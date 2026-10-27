import type { FamilyFile } from "../api/files";
import { AVATAR_COLOR_IDS, AVATAR_SYMBOL_IDS, colorForAvatarId, defaultAvatarSymbol, isKnownAvatarColorId, isKnownAvatarSymbolId } from "./entityAvatar";
import type { AvatarEntityKind, AvatarColorId, AvatarSymbolId } from "./entityAvatar";
import { EntityAvatar } from "./EntityAvatar";
import { useStrings } from "../i18n/LanguageContext";
import { SymbolColorControls } from "./SymbolColorControls";
import { DESIGN_COLOR_VALUES } from "../design-system/palette";

type AvatarChoicePickerProps = {
  accessToken?: string | null;
  entityId: string;
  entityKind: AvatarEntityKind;
  label: string;
  file?: FamilyFile | null;
  mode: "photo" | "symbol";
  symbolId?: string | null;
  colorId?: string | null;
  allowPhoto?: boolean;
  onModeChange: (mode: "photo" | "symbol") => void;
  onSymbolChange: (symbolId: AvatarSymbolId) => void;
  onColorChange: (colorId: AvatarColorId) => void;
};

export function AvatarChoicePicker({
  accessToken = null, entityId, entityKind, label, file, mode, symbolId, colorId, allowPhoto = false,
  onModeChange, onSymbolChange, onColorChange
}: AvatarChoicePickerProps) {
  const strings = useStrings().avatarChoices;
  const selectedSymbol = isKnownAvatarSymbolId(symbolId) ? symbolId : defaultAvatarSymbol(entityKind);
  const selectedColor = isKnownAvatarColorId(colorId) ? colorId : colorForAvatarId(entityId);

  return (
    <section className="avatar-choice-picker" aria-label={strings.symbols}>
      {allowPhoto && <div className="avatar-choice-picker__modes" role="group" aria-label={strings.symbol}>
        <button type="button" aria-pressed={mode === "photo"} onClick={() => onModeChange("photo")}>{strings.photo}</button>
        <button type="button" aria-pressed={mode === "symbol"} onClick={() => onModeChange("symbol")}>{strings.symbol}</button>
      </div>}
      <SymbolColorControls
        symbols={AVATAR_SYMBOL_IDS.map((id) => ({ id, label: id === "initials" ? strings.initials : strings.symbolNames[id], icon: <EntityAvatar accessToken={null} entityId={entityId} entityKind={entityKind} label={label} mode="symbol" symbolId={id} colorId={selectedColor} size={36} /> }))}
        symbol={selectedSymbol}
        onSymbolChange={(id) => onSymbolChange(id as AvatarSymbolId)}
        colors={AVATAR_COLOR_IDS.map((id) => ({ id, label: strings.colorNames[id], value: DESIGN_COLOR_VALUES.avatarPalette[id] }))}
        color={selectedColor}
        onColorChange={(id) => onColorChange(id as AvatarColorId)}
      />
      {mode === "photo" && allowPhoto && <div className="avatar-choice-picker__photo-selected"><EntityAvatar accessToken={accessToken} entityId={entityId} entityKind={entityKind} label={label} file={file} mode="photo" size={36} /><span>{strings.photo}</span></div>}
    </section>
  );
}
