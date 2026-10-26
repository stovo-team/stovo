import type { FamilyFile } from "../api/files";
import { AVATAR_COLOR_IDS, AVATAR_SYMBOL_IDS, colorForAvatarId, defaultAvatarSymbol, isKnownAvatarColorId, isKnownAvatarSymbolId } from "./entityAvatar";
import type { AvatarEntityKind, AvatarColorId, AvatarSymbolId } from "./entityAvatar";
import { EntityAvatar } from "./EntityAvatar";
import { useStrings } from "../i18n/LanguageContext";

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
      <fieldset>
        <legend>{strings.symbols}</legend>
        <div className="avatar-choice-picker__symbols">
          {AVATAR_SYMBOL_IDS.map((id) => (
            <button key={id} type="button" aria-label={id === "initials" ? strings.initials : strings.symbolNames[id]} aria-pressed={selectedSymbol === id} onClick={() => onSymbolChange(id)}>
              <EntityAvatar accessToken={null} entityId={entityId} entityKind={entityKind} label={label} mode="symbol" symbolId={id} colorId={selectedColor} size={36} />
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>{strings.colors}</legend>
        <div className="avatar-choice-picker__colors">
          {AVATAR_COLOR_IDS.map((id) => (
            <button key={id} type="button" aria-label={strings.colorNames[id]} aria-pressed={selectedColor === id} onClick={() => onColorChange(id)}>
              <EntityAvatar accessToken={null} entityId={entityId} entityKind={entityKind} label={label} mode="symbol" symbolId={selectedSymbol} colorId={id} size={28} />
            </button>
          ))}
        </div>
      </fieldset>
      {mode === "photo" && allowPhoto && <div className="avatar-choice-picker__photo-selected"><EntityAvatar accessToken={accessToken} entityId={entityId} entityKind={entityKind} label={label} file={file} mode="photo" size={36} /><span>{strings.photo}</span></div>}
    </section>
  );
}
