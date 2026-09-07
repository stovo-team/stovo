import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import LandingPage from "./LandingPage";

describe("LandingPage", () => {
  const getMarkup = (initialEntries: string[] = ["/landing"]) => {
    return renderToStaticMarkup(
      <MemoryRouter initialEntries={initialEntries}>
        <LandingPage />
      </MemoryRouter>
    );
  };

  it("renders the hero section with headlines, copy, and CTAs", () => {
    const markup = getMarkup();

    expect(markup).toContain("Your conversations. Your files.");
    expect(markup).toContain("Your infrastructure.");
    expect(markup).toContain("Private messaging, storage and AI for teams, communities and families.");
    expect(markup).toContain("Get Stovo");
    expect(markup).toContain("Explore Self-Hosted");
    expect(markup).toContain('href="/setup"');
  });

  it("renders audience sections for Business, Gaming, and Families", () => {
    const markup = getMarkup();

    expect(markup).toContain("Stovo adapts to your world.");
    expect(markup).toContain("FOR BUSINESS");
    expect(markup).toContain("Stovo for Business");
    expect(markup).toContain("Corporate Knowledge Base");
    expect(markup).toContain("Okta SAML Active");

    expect(markup).toContain("FOR GAMING");
    expect(markup).toContain("Stovo for Gaming");
    expect(markup).toContain("Opus Voice Room");
    expect(markup).toContain("#Raid-Command-Alpha");

    expect(markup).toContain("FOR FAMILIES");
    expect(markup).toContain("Stovo for Families");
    expect(markup).toContain("Family Media &amp; Archive");
  });

  it("renders autonomous deployment options (Cloud vs Self-Hosted)", () => {
    const markup = getMarkup();

    expect(markup).toContain("Your cloud. Or ours.");
    expect(markup).toContain("Stovo Cloud");
    expect(markup).toContain("Self-Hosted Engine");
    expect(markup).toContain("Start with Stovo Cloud");
    expect(markup).toContain("Explore Docker Setup");
  });

  it("renders core capabilities bento grid", () => {
    const markup = getMarkup();

    expect(markup).toContain("More than messaging.");
    expect(markup).toContain("Messaging &amp; Channels");
    expect(markup).toContain("Voice &amp; Video Mesh");
    expect(markup).toContain("Object Storage &amp; Vaults");
    expect(markup).toContain("Private AI Engine");
    expect(markup).toContain("Extensible Integrations");
    expect(markup).toContain("Real-time WebSocket • MLS");
  });

  it("renders supercharged storage section and lifecycle pipeline", () => {
    const markup = getMarkup();

    expect(markup).toContain("Messages and files belong in one connected workspace.");
    expect(markup).toContain("File Lifecycle in Stovo");
    expect(markup).toContain("Message in");
    expect(markup).toContain("Attachment (");
    expect(markup).toContain("Synced in Stovo Drive &amp; Encrypted Vault");
    expect(markup).toContain("Stovo Drive");
    expect(markup).toContain("Encrypted S3 Node");
  });

  it("renders supercharged AI section with verified sources", () => {
    const markup = getMarkup();

    expect(markup).toContain("AI that understands your workspace.");
    expect(markup).toContain("What did we decide about auth migration?");
    expect(markup).toContain("Stovo Grounded Answer");
    expect(markup).toContain("Verified Sources:");
    expect(markup).toContain("Architecture.pdf");
    expect(markup).toContain("Context Inspection Panel");
    expect(markup).toContain("100% Grounded");
  });

  it("renders dark infrastructure section and CLI command", () => {
    const markup = getMarkup();

    expect(markup).toContain("Private by architecture. Not by promise.");
    expect(markup).toContain("1. Client Endpoints");
    expect(markup).toContain("2. Ingress &amp; TLS 1.3 Termination");
    expect(markup).toContain("3. Stovo Daemon Orchestrator");
    expect(markup).toContain("4. Encrypted Storage Vault");
    expect(markup).toContain("5. Bare Metal / Enclave");
    expect(markup).toContain("docker compose up -d");
    expect(markup).toContain("Copy Command");
  });

  it("renders pricing taxonomy with community, cloud, and enterprise tiers", () => {
    const markup = getMarkup();

    expect(markup).toContain("Choose how you use Stovo");
    expect(markup).toContain("Self-Hosted Community");
    expect(markup).toContain("Stovo Cloud");
    expect(markup).toContain("Enterprise");
    expect(markup).toContain("/ Free Forever");
    expect(markup).toContain("/ user / mo");
  });

  it("renders FAQ section with questions and answers", () => {
    const markup = getMarkup();

    expect(markup).toContain("Frequently asked questions.");
    expect(markup).toContain("Is Stovo open source?");
    expect(markup).toContain("Source-Available license");
    expect(markup).toContain("Can I host Stovo myself without internet connectivity?");
    expect(markup).toContain("Does Stovo offer managed cloud hosting?");
  });

  it("renders footer brand block, links, and operational metadata", () => {
    const markup = getMarkup();

    expect(markup).toContain("Build your space with Stovo.");
    expect(markup).toContain("All systems operational");
    expect(markup).toContain("© 2026 Stovo Inc");
    expect(markup).toContain("MLS RFC 9420");
    expect(markup).toContain("v2.4-stable");
  });

  it("handles FAQ click toggling in the DOM", async () => {
    const { createRoot } = await import("react-dom/client");
    const { act } = await import("react");

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={["/landing"]}>
          <LandingPage />
        </MemoryRouter>
      );
    });

    const faqButtons = container.querySelectorAll<HTMLButtonElement>(".sl-faq-trigger");
    expect(faqButtons.length).toBeGreaterThan(0);

    // Click on the second question
    await act(async () => {
      faqButtons[1].click();
    });

    expect(container.textContent).toContain("air-gapped on local area networks");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
