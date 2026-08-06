import { useEffect, useRef, useState } from "react";
import { Check, Copy, Link2, QrCode, Share2, X } from "lucide-react";
import QRCode from "qrcode";

import { createInvite } from "../api/family";
import { ApiError } from "../api/client";

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
        setInviteUrl(response.inviteUrl);
        const dataUrl = await QRCode.toDataURL(response.inviteUrl, {
          margin: 2,
          width: 240,
          color: { dark: "#111827", light: "#ffffff" }
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

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

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
      setError("Could not copy invite link");
    }
  }

  async function handleShareLink() {
    if (!inviteUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Join ${familyName} on Stovo`,
          url: inviteUrl
        });
        return;
      }
      await copyText(inviteUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 1600);
    } catch {
      // Share cancelled or unavailable — fallback to clipboard copy
      try {
        await copyText(inviteUrl);
        setCopiedLink(true);
        window.setTimeout(() => setCopiedLink(false), 1600);
      } catch {}
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
      setError("Could not copy QR code");
    }
  }

  async function handleShareQr() {
    if (!qrDataUrl || !inviteUrl) return;
    try {
      const blob = await dataUrlToBlob(qrDataUrl);
      const file = new File([blob], "stovo-invite-qr.png", { type: blob.type || "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `Join ${familyName} on Stovo`,
          files: [file]
        });
        return;
      }
      if (navigator.share) {
        await navigator.share({
          title: `Join ${familyName} on Stovo`,
          url: inviteUrl
        });
        return;
      }
      await handleCopyQr();
    } catch {
      // User cancelled share
    }
  }

  return (
    <div
      className="modal-backdrop invite-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="messenger-modal invite-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="invite-modal-title"
      >
        <div className="modal-header">
          <h2 id="invite-modal-title">Invite to {familyName}</h2>
          <button
            type="button"
            className="icon-button subtle icon-button--plain"
            aria-label="Close invite dialog"
            onClick={onClose}
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}

        {isCreating && !inviteUrl && <p className="muted-copy">Creating invite…</p>}

        {inviteUrl && (
          <div className="invite-modal-sections">
            <div className="invite-modal-section">
              <div className="invite-modal-section-header">
                <QrCode aria-hidden="true" size={18} />
                <strong>QR code</strong>
              </div>
              <div className="invite-modal-qr">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Invite QR code" width={240} height={240} />
                ) : (
                  <p className="muted-copy">Generating QR…</p>
                )}
              </div>
              <div className="invite-modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!qrDataUrl}
                  onClick={() => void handleCopyQr()}
                >
                  {copiedQr ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
                  {copiedQr ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!qrDataUrl}
                  onClick={() => void handleShareQr()}
                >
                  <Share2 aria-hidden="true" size={16} />
                  Share
                </button>
              </div>
            </div>

            <div className="invite-modal-section">
              <div className="invite-modal-section-header">
                <Link2 aria-hidden="true" size={18} />
                <strong>Invite link</strong>
              </div>
              <code className="invite-modal-link">{inviteUrl}</code>
              <div className="invite-modal-actions">
                <button type="button" className="secondary-button" onClick={() => void handleCopyLink()}>
                  {copiedLink ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
                  {copiedLink ? "Copied" : "Copy"}
                </button>
                <button type="button" className="primary-button" onClick={() => void handleShareLink()}>
                  <Share2 aria-hidden="true" size={16} />
                  Share
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
