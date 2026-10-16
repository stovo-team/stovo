import type { ReactNode } from "react";
import { Check } from "lucide-react";

import type { NativeMediaItem } from "../../native/mediaLibraryPlugin";
import { useStrings } from "../../i18n/LanguageContext";

type DocumentPickerListProps = {
  items: NativeMediaItem[];
  selectedItemIds: string[];
  loading: boolean;
  emptyLabel: string;
  icon: ReactNode;
  onChoose: () => void;
  onToggle: (id: string) => void;
};

export function DocumentPickerList({ items, selectedItemIds, loading, emptyLabel, icon, onChoose, onToggle }: DocumentPickerListProps) {
  const copy = useStrings().attachments.picker;
  return <div className="attachment-picker-list-tab">
    <button type="button" className="attachment-picker-sheet-item" onClick={onChoose}>
      <span className="attachment-picker-sheet-icon file-icon">{icon}</span>
      <span className="attachment-picker-sheet-copy"><strong>{copy.chooseFromDevice}</strong><span>{items.length ? copy.browseAllFiles : emptyLabel}</span></span>
    </button>
    {loading && <p className="attachment-picker-gallery-status">{copy.loadingRecentItems}</p>}
    {items.map((item) => {
      const selected = selectedItemIds.includes(item.id);
      return <button key={item.id} type="button" className={`attachment-picker-sheet-item attachment-picker-recent-item ${selected ? "selected" : ""}`} onClick={() => onToggle(item.id)}>
        <span className="attachment-picker-sheet-icon file-icon">{icon}</span>
        <span className="attachment-picker-sheet-copy"><strong>{item.name}</strong><span>{item.mimeType}</span></span>
        <span className={`media-tile-checkbox ${selected ? "checked" : ""}`}>{selected && <Check size={12} strokeWidth={3} />}</span>
      </button>;
    })}
  </div>;
}
