import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/client";
import { russianStrings, strings } from "../../config/strings";
import { passkeyRegistrationErrorMessage } from "./passkeyErrorMessage";

describe("passkey registration errors", () => {
  it("keeps the backend's actionable origin configuration detail", () => {
    expect(passkeyRegistrationErrorMessage(new ApiError(400, "Passkeys need APP_URL set to the site's public HTTPS address."), strings))
      .toBe("Passkeys need APP_URL set to the site's public HTTPS address.");
  });

  it("maps a browser security rejection to a localized origin hint", () => {
    const error = new DOMException("The relying party ID is invalid", "SecurityError");
    expect(passkeyRegistrationErrorMessage(error, russianStrings)).toBe(russianStrings.security.passkeySecurityError);
  });

  it("maps unsupported authenticator errors to the localized support message", () => {
    const error = new DOMException("No authenticator is available", "NotSupportedError");
    expect(passkeyRegistrationErrorMessage(error, strings)).toBe(strings.security.passkeyUnsupported);
  });

  it("does not turn a user cancellation into an error", () => {
    expect(passkeyRegistrationErrorMessage(new DOMException("Dismissed", "NotAllowedError"), strings)).toBeNull();
    expect(passkeyRegistrationErrorMessage(new DOMException("Stopped", "AbortError"), strings)).toBeNull();
  });

  it("uses the neutral retry copy for unknown failures", () => {
    expect(passkeyRegistrationErrorMessage(new Error("unknown"), strings)).toBe(strings.security.addPasskeyFailed);
  });
});
