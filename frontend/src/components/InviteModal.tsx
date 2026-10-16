import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, QrCode, Share2 } from "lucide-react";
import QRCode from "qrcode";

import { createInvite, inviteUrlForServer } from "../api/family";
import { ApiError, getApiUrl } from "../api/client";
import { shareContent } from "../native/nativeSharePlugin";
import { DESIGN_COLOR_VALUES } from "../design-system/palette";
import { useStrings } from "../i18n/LanguageContext";
import { PopupDialog } from "./ui/Popup";
import { PopupButton } from "./ui/PopupButton";

type InviteModalProps = {
  accessToken: string;
  familyName: string;
  open: boolean;
  onClose: () => void;
};

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  document.body.removeChild(input);
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

export default function InviteModal({ accessToken, familyName, open, onClose }: InviteModalProps) {
  const strings = useStrings();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedQr, setCopiedQr] = useState(false);
  const createdForOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      createdForOpenRef.current = false;
      setInviteUrl(null);
      setQrDataUrl(null);
      setError(null);
      setStatus(null);
      setCopiedLink(false);
      setCopiedQr(false);
      return;
    }

    if (createdForOpenRef.current) {
      return;
    }
    createdForOpenRef.current = true;

    let cancelled = false;
    setIsCreating(true);
    setError(null);
    setStatus(null);

    void createInvite(accessToken, {
      role: "member",
      expiresInHours: 168,
      maxUses: 10
    })
      .then(async (response) => {
        if (cancelled) return;
        const currentServerInviteUrl = inviteUrlForServer(response.inviteUrl, getApiUrl());
        setInviteUrl(currentServerInviteUrl);
        const dataUrl = await QRCode.toDataURL(currentServerInviteUrl, {
          margin: 2,
          width: 240,
          color: DESIGN_COLOR_VALUES.inviteQr
        });
        if (cancelled) return;
        setQrDataUrl(dataUrl);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? String(err.message) : "Could not create invite");
      })
      .finally(() => {
        if (!cancelled) setIsCreating(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken, open]);

  if (!open) {
    return null;
  }

  async function handleCopyLink() {
    if (!inviteUrl) return;
    try {
      await copyText(inviteUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1600);
    } catch {
      setError(strings.sharedUi.copyInviteLinkFailed);
    }
  }

  async function handleShareLink() {
    if (!inviteUrl) return;
    const result = await shareContent({
      title: strings.inviteModal.shareTitle(familyName),
      text: strings.inviteModal.shareText(familyName),
      url: inviteUrl,
      dialogTitle: strings.inviteModal.shareDialogTitle(familyName)
    });
    if (result.fallbackToCopy) {
      await handleCopyLink();
    }
  }

  async function handleCopyQr() {
    if (!qrDataUrl) return;
    try {
      const blob = await dataUrlToBlob(qrDataUrl);
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        setCopiedQr(true);
        window.setTimeout(() => setCopiedQr(false), 1600);
        return;
      }
      await copyText(inviteUrl ?? "");
      setCopiedQr(true);
      window.setTimeout(() => setCopiedQr(false), 1600);
    } catch {
      setError(strings.sharedUi.copyQrFailed);
    }
  }

  async function handleShareQr() {
    if (!qrDataUrl || !inviteUrl) return;
    const result = await shareContent({
      title: strings.inviteModal.shareTitle(familyName),
      text: strings.inviteModal.shareText(familyName),
      url: inviteUrl,
      dialogTitle: `${strings.inviteModal.shareDialogTitle(familyName)} (${strings.inviteModal.qrCode})`,
      dataUrl: qrDataUrl,
      filename: "stovo-invite-qr.png",
      mimeType: "image/png"
    });
    if (result.fallbackToCopy) {
      await handleCopyQr();
    }
  }

  return (
    <PopupDialog className="invite-modal" ariaLabelledBy="invite-modal-title" onClose={onClose} closeOnBackdrop closeOnEscape backdropClassName="invite-modal-backdrop" size="md">
        <div className="modal-header">
          <h2 id="invite-modal-title">{strings.inviteModal.title(familyName)}</h2>
        </div>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        {isCreating && !inviteUrl && <p className="muted-copy">{strings.inviteModal.creating}</p>}

        {inviteUrl && (
          <div className="invite-modal-sections">
            <div className="invite-modal-section">
              <div className="invite-modal-section-header">
                <QrCode aria-hidden="true" size={18} />
                <strong>{strings.inviteModal.qrCode}</strong>
              </div>
              <div className="invite-modal-qr">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt={strings.inviteModal.qrAlt} width={240} height={240} />
                ) : (
                  <p className="muted-copy">{strings.inviteModal.generatingQr}</p>
                )}
              </div>
              <div className="invite-modal-actions">
                <PopupButton
                  variant="secondary"
                  disabled={!qrDataUrl}
                  onClick={() => void handleCopyQr()}
                  startIcon={copiedQr ? <Check size={16} /> : <Copy size={16} />}
                >
                  {copiedQr ? strings.inviteModal.copied : strings.inviteModal.copy}
                </PopupButton>
                <PopupButton
                  variant="primary"
                  disabled={!qrDataUrl}
                  onClick={() => void handleShareQr()}
                  startIcon={<Share2 size={16} />}
                >
                  {strings.inviteModal.share}
                </PopupButton>
              </div>
            </div>

            <div className="invite-modal-section">
              <div className="invite-modal-section-header">
                <Link2 aria-hidden="true" size={18} />
                <strong>{strings.inviteModal.inviteLink}</strong>
              </div>
              <code className="invite-modal-link">{inviteUrl}</code>
              <div className="invite-modal-actions">
                <PopupButton variant="secondary" onClick={() => void handleCopyLink()} startIcon={copiedLink ? <Check size={16} /> : <Copy size={16} />}>
                  {copiedLink ? strings.inviteModal.copied : strings.inviteModal.copy}
                </PopupButton>
                <PopupButton variant="primary" onClick={() => void handleShareLink()} startIcon={<Share2 size={16} />}>
                  {strings.inviteModal.share}
                </PopupButton>
              </div>
            </div>
          </div>
        )}
    </PopupDialog>
  );
}

