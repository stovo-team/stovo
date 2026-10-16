import type { PendingLocalAttachment } from "../shared/types";
import { PendingAttachmentCard } from "./PendingAttachmentCard";
import { useStrings } from "../../../i18n/LanguageContext";

type PendingAttachmentsStripProps = {
  attachments: PendingLocalAttachment[];
  onRemove: (localId: string) => void;
  onEdit: (attachment: PendingLocalAttachment) => void;
};

export function PendingAttachmentsStrip({ attachments, onRemove, onEdit }: PendingAttachmentsStripProps) {
  const label = useStrings().chats.composer.attachmentsToSend;
  if (!attachments.length) return null;
  return <div className="composer-attachments-strip" aria-label={label}><div className="pending-attachments">
    {attachments.map((attachment) => <PendingAttachmentCard key={attachment.localId} pending={attachment} onRemove={() => onRemove(attachment.localId)} onEdit={() => onEdit(attachment)} />)}
  </div></div>;
}
