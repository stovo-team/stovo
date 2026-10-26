import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useStrings } from "../i18n/LanguageContext";
import { DESIGN_COLOR_VALUES } from "../design-system/palette";

export function SymbolColorControls({ symbols, symbol, onSymbolChange, colors, color, onColorChange }: {
  symbols: Array<{ id: string; label: string; icon: ReactNode }>;
  symbol: string;
  onSymbolChange: (id: string) => void;
  colors: Array<{ id: string; label: string; value: string }>;
  color: string;
  onColorChange: (id: string) => void;
}) {
  const copy = useStrings().avatarChoices;
  const [expanded, setExpanded] = useState(false);
  const custom = !colors.some((item) => item.id === color);
  const presetColor = colors.find((item) => item.id === color)?.value;
  return <div className="symbol-color-controls">
    <fieldset><legend>{copy.symbols}</legend>
      <div className="symbol-color-controls__icons">{(expanded ? symbols : symbols.slice(0, 12)).map((item) => <button type="button" key={item.id} aria-label={item.label} aria-pressed={item.id === symbol} onClick={() => onSymbolChange(item.id)}>{item.icon}</button>)}</div>
      {symbols.length > 12 && <button type="button" className={`symbol-color-controls__expand${expanded ? " is-expanded" : ""}`} aria-expanded={expanded} aria-label={expanded ? copy.fewerSymbols : copy.moreSymbols} onClick={() => setExpanded(!expanded)}>{!expanded && <span className="symbol-color-controls__preview" aria-hidden="true">{symbols.slice(12, 18).map((item) => <span key={item.id}>{item.icon}</span>)}</span>}{expanded ? <ChevronUp /> : <ChevronDown />}</button>}
    </fieldset>
    <fieldset><legend>{copy.colors}</legend><div className="symbol-color-controls__colors">
      {colors.map((item) => <button type="button" key={item.id} className="symbol-color-controls__swatch" aria-label={item.label} aria-pressed={item.id === color} style={{ backgroundColor: item.value }} onClick={() => onColorChange(item.id)} />)}
      <label className={`symbol-color-controls__rainbow${custom ? " is-selected" : ""}`}><input type="color" aria-label={copy.customColor} value={/^#[0-9a-f]{6}$/i.test(color) ? color : presetColor?.startsWith("#") ? presetColor : DESIGN_COLOR_VALUES.storageCollections.defaultCover} onChange={(event) => onColorChange(event.target.value)} /></label>
    </div></fieldset>
  </div>;
}
