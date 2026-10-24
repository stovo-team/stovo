import { describe, expect, it } from "vitest";
import config from "../../capacitor.config";

describe("Android WebView routing origin", () => {
  it("uses an HTTPS origin so React Router can replace local routes", () => {
    expect(config.server?.androidScheme).toBe("https");
  });
});
