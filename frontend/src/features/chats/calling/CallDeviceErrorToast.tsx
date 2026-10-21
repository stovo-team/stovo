import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useStrings } from "../../../i18n/LanguageContext";
import "./CallDeviceErrorToast.css";

export function isCallDeviceError(message: string | null | undefined) {
  return Boolean(message && /failed|failure|error|denied|unsupported|not supported|not found|not available|unavailable|could not|unable|no .*camera|no .*device|NotFound|NotReadable|NotAllowed|недоступ|не найден|нет камер|ошиб|отказ/i.test(message));
}

export function CallDeviceErrorToast({ message }: { message: string | null | undefined }) {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const close = useStrings().auditUi.close;
  useEffect(() => { setDismissed(null); }, [message]);
  if (!message || dismissed === message) return null;
  return createPortal(<div className="call-device-error-toast" role="alert">
    <span>{message}</span>
    <button type="button" aria-label={close} onClick={() => setDismissed(message)}><X size={18} aria-hidden="true" /></button>
  </div>, document.body);
}
