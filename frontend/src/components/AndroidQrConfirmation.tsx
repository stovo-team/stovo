import { useStrings } from "../i18n/LanguageContext";

type AndroidQrConfirmationProps = {
  apiUrl: string;
  isSubmitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function AndroidQrConfirmation({ apiUrl, isSubmitting, onConfirm, onCancel }: AndroidQrConfirmationProps) {
  const copy = useStrings().auth;
  const host = new URL(apiUrl).host;

  return (
    <section className="qr-login-panel android-qr-confirmation" role="region" aria-label={copy.confirmScannedServer}>
      <h2>{copy.signInTo} <strong>{host}</strong>?</h2>
      <p className="muted-copy">{copy.confirmSpaceAddress}</p>
      <p className="android-qr-confirmation-address">{apiUrl}</p>
      <div className="auth-action-row">
        <button type="button" className="secondary-button" disabled={isSubmitting} onClick={onConfirm}>{copy.confirmSignIn}</button>
        <button type="button" className="secondary-button" disabled={isSubmitting} onClick={onCancel}>{copy.cancel}</button>
      </div>
    </section>
  );
}
