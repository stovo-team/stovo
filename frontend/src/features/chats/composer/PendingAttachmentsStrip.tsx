import type { PendingLocalAttachment } from "../shared/types";
import { PendingAttachmentCard } from "./PendingAttachmentCard";

type PendingAttachmentsStripProps = {
  attachments: PendingLocalAttachment[];
  onRemove: (localId: string) => void;
  onEdit: (attachment: PendingLocalAttachment) => void;
};

export function PendingAttachmentsStrip({ attachments, onRemove, onEdit }: PendingAttachmentsStripProps) {
  if (!attachments.length) return null;
  return <div className="composer-attachments-strip" aria-label="Attachments to send"><div className="pending-attachments">
    {attachments.map((attachment) => <PendingAttachmentCard key={attachment.localId} pending={attachment} onRemove={() => onRemove(attachment.localId)} onEdit={() => onEdit(attachment)} />)}
  </div></div>;
}
