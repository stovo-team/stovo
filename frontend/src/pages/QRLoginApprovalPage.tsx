import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { respondToBrowserQRLogin } from "../api/auth";
import { useAuth } from "../auth/AuthContext";

export default function QRLoginApprovalPage() {
  const { requestId = "" } = useParams();
  const navigate = useNavigate();
  const { accessToken, currentUser, isLoading } = useAuth();
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
      setError("Запрос истёк или уже обработан. Создайте новый QR-код на компьютере.");
    }
  };

  if (isLoading || !currentUser) return <main className="auth-page"><p>Загрузка…</p></main>;
  return <main className="auth-page"><section className="auth-card" aria-labelledby="qr-approval-title">
    <h1 id="qr-approval-title">Вход на компьютере</h1>
    <p>Разрешить вход в Stovo на другом устройстве под аккаунтом <strong>{currentUser.displayName}</strong>?</p>
    {error && <p role="alert">{error}</p>}
    {state === "done" ? <p role="status">Запрос обработан. Можно вернуться к компьютеру.</p> : <div className="auth-actions">
      <button type="button" disabled={state === "working"} onClick={() => void respond("approve")}>Разрешить вход</button>
      <button type="button" className="button-secondary" disabled={state === "working"} onClick={() => void respond("reject")}>Отклонить</button>
    </div>}
  </section></main>;
}
