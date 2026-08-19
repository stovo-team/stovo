import { Component, type ErrorInfo, type ReactNode } from "react";

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
              borderRadius: "20px",
              background: "var(--surface-card, #ffffff)",
              border: "1px solid var(--border-default, #e5e7eb)",
              boxShadow: "0 12px 32px rgba(0, 0, 0, 0.1)"
            }}
          >
            <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem", fontWeight: 600 }}>
              Something went wrong
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: "0.875rem", color: "var(--text-secondary, #6b7280)" }}>
              {this.state.error?.message || "An unexpected error occurred."}
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
                borderRadius: "9999px",
                padding: "10px 24px",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Reload application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
