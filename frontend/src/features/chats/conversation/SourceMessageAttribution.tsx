import type { MessageImportAttribution } from "../../../api/chatTransferTypes";
import { getChatTransferStrings } from "../../../config/strings/chatTransfer";
import { useResolvedLanguage } from "../../../i18n/LanguageContext";

export function SourceMessageAttribution({ attribution }: { attribution: MessageImportAttribution }) {
  const copy = getChatTransferStrings(useResolvedLanguage());
  const provider = attribution.sourceProvider === "rocketchat"
    ? "Rocket.Chat"
    : attribution.sourceProvider === "whatsapp"
      ? "WhatsApp"
      : attribution.sourceProvider.charAt(0).toUpperCase() + attribution.sourceProvider.slice(1);
  return (
    <div className="message-import-attribution" aria-label={copy.attributionLabel(attribution.sourceAuthorName, provider)}>
      <strong>{copy.originalAuthor(attribution.sourceAuthorName)}</strong>
      <span>{copy.importedFrom(provider)}</span>
    </div>
  );
}
