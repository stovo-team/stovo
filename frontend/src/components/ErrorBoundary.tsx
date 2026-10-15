import { Component, type ErrorInfo, type ReactNode } from "react";
import { getAppStrings, getSystemLanguage } from "../config/strings";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const copy = getAppStrings(getSystemLanguage()).errors;
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "var(--background-primary, #ffffff)",
            color: "var(--text-primary, #111827)",
            fontFamily: "system-ui, -apple-system, sans-serif",
            textAlign: "center"
          }}
        >
          <div
            style={{
              maxWidth: "480px",
              padding: "32px",
              borderRadius: "var(--radius-bubble)",
              background: "var(--surface-card, #ffffff)",
              border: "1px solid var(--border-default, #e5e7eb)",
              boxShadow: "0 12px 32px rgba(0, 0, 0, 0.1)"
            }}
          >
            <h2 style={{ margin: "0 0 12px", fontSize: "var(--font-size-heading-small)", fontWeight: "var(--font-weight-semibold)" }}>
              {copy.somethingWentWrong}
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: "var(--font-size-small)", color: "var(--text-secondary, #6b7280)" }}>
              {this.state.error?.message || copy.unexpectedError}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              style={{
                background: "var(--accent-primary, #2aabee)",
                color: "#ffffff",
                border: "none",
                borderRadius: "var(--radius-pill)",
                padding: "10px 24px",
                fontSize: "var(--font-size-small)",
                fontWeight: "var(--font-weight-semibold)",
                cursor: "pointer"
              }}
            >
              {copy.reloadApplication}
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
