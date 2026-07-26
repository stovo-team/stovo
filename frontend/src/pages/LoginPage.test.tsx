import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { OwnerSetupPrompt } from "./LoginPage";

describe("OwnerSetupPrompt", () => {
  it("hides owner creation after the server has been initialized", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <OwnerSetupPrompt setupRequired={false} />
      </MemoryRouter>
    );

    expect(markup).not.toContain("Create owner account");
    expect(markup).not.toContain('href="/setup"');
  });

  it("offers owner creation when initial setup is required", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <OwnerSetupPrompt setupRequired />
      </MemoryRouter>
    );

    expect(markup).toContain("Create owner account");
    expect(markup).toContain('href="/setup"');
  });
});
