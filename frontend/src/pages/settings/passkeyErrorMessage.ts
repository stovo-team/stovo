import { ApiError } from "../../api/client";
import type { AppStrings } from "../../config/strings";

export function passkeyRegistrationErrorMessage(error: unknown, strings: AppStrings): string | null {
  if ((error instanceof Error || error instanceof DOMException) && ["NotAllowedError", "AbortError"].includes(error.name)) {
    return null;
  }
  if (error instanceof ApiError) return error.message;
  if ((error instanceof Error || error instanceof DOMException) && error.name === "SecurityError") {
    return strings.security.passkeySecurityError;
  }
  if ((error instanceof Error || error instanceof DOMException) && error.name === "NotSupportedError") {
    return strings.security.passkeyUnsupported;
  }
  return strings.security.addPasskeyFailed;
}
