import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getApiUrl } from "../api/client";
import { respondToBrowserQRLogin } from "../api/auth";
import { useAuth } from "../auth/AuthContext";
import { RealAvatar } from "../features/chats/sidebar/RealAvatar";
import { useStrings } from "../i18n/LanguageContext";

export default function QRLoginApprovalPage() {
  const { requestId = "" } = useParams();
  const navigate = useNavigate();
  const copy = useStrings().auth;
  const { accessToken, activeServer, currentUser, isLoading } = useAuth();
  const [state, setState] = useState<"confirm" | "working" | "done" | "error">("confirm");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && !currentUser) navigate("/login", { replace: true });
  }, [currentUser, isLoading, navigate]);

  const respond = async (decision: "approve" | "reject") => {
    if (!accessToken || state === "working") return;
    setState("working");
    setError("");
    try {
      await respondToBrowserQRLogin(requestId, decision, accessToken);
      setState("done");
    } catch {
      setState("error");
      setError(copy.qrApprovalExpired);
    }
  };

  if (isLoading || !currentUser) return <main className="auth-page"><p>{copy.qrApprovalLoading}</p></main>;
  const spaceUrl = activeServer?.url ?? getApiUrl();
  return <main className="app-shell qr-approval-page"><section className="auth-panel qr-approval-panel" aria-labelledby="qr-approval-title">
    <h1 id="qr-approval-title">{copy.qrApprovalTitle}</h1>
    <p className="qr-approval-instruction">{copy.qrApprovalVerifyAccount}</p>
    <div className="qr-approval-account">
      <RealAvatar
        accessToken={accessToken}
        className="avatar-lg qr-approval-avatar"
        entityId={currentUser.id}
        file={currentUser.profilePhoto}
        label={currentUser.displayName}
        mode={currentUser.avatarMode}
        symbolId={currentUser.avatarSymbolId}
        colorId={currentUser.avatarColorId}
      />
      <strong className="qr-approval-account-name">{currentUser.displayName}</strong>
    </div>
    <a className="qr-approval-space-link" href={spaceUrl}>{spaceUrl}</a>
    {error && <p role="alert">{error}</p>}
    {state === "done" ? <p role="status">{copy.qrApprovalDone}</p> : <div className="auth-actions">
      <button type="button" disabled={state === "working"} onClick={() => void respond("approve")}>{copy.qrApprovalLogin}</button>
      <button type="button" className="button-secondary" disabled={state === "working"} onClick={() => void respond("reject")}>{copy.cancel}</button>
    </div>}
  </section></main>;
}
