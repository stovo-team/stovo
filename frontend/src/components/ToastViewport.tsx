import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useStrings } from "../i18n/LanguageContext";

import "./ToastViewport.css";

export type ToastKind = "success" | "error" | "info";
type ToastMessage = { id: number; kind: ToastKind; message: string };
const TOAST_EVENT = "stovo:toast";
let nextToastId = 0;

export function showToast(message: string, kind: ToastKind = "success") {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { message, kind } }));
}

export function ToastViewport() {
  const strings = useStrings();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timers = useRef(new Map<number, number>());

  useEffect(() => {
    const onToast = (event: Event) => {
      const { message, kind } = (event as CustomEvent<{ message: string; kind: ToastKind }>).detail;
      const id = ++nextToastId;
      setToasts((current) => [...current.slice(-2), { id, kind, message }]);
      if (kind !== "error") {
        timers.current.set(id, window.setTimeout(() => {
          timers.current.delete(id);
          setToasts((current) => current.filter((toast) => toast.id !== id));
        }, 5000));
      }
    };
    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
    };
  }, []);

  return <div className="toast-viewport" aria-label="Notifications">
    {toasts.map(({ id, kind, message }) => {
      const Icon = kind === "error" ? AlertCircle : kind === "success" ? CheckCircle2 : Info;
      return <div key={id} className={`app-toast app-toast--${kind}`} role={kind === "error" ? "alert" : "status"} aria-live={kind === "error" ? "assertive" : "polite"}>
        <Icon size={18} aria-hidden="true" />
        <span>{message}</span>
        <button type="button" aria-label={strings.accessibility.dismissNotification} onClick={() => {
          const timer = timers.current.get(id);
          if (timer !== undefined) window.clearTimeout(timer);
          timers.current.delete(id);
          setToasts((current) => current.filter((toast) => toast.id !== id));
        }}><X size={16} aria-hidden="true" /></button>
      </div>;
    })}
  </div>;
}
