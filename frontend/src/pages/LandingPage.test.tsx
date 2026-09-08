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

  it("renders audience sections for Business, Gaming, and Families with commercial hints", () => {
    const markup = getMarkup();

    expect(markup).toContain("Stovo adapts to your world.");
    expect(markup).toContain("FOR BUSINESS");
    expect(markup).toContain("Stovo for Business");
    expect(markup).toContain("Plans based on team size");
    expect(markup).toContain("Corporate Knowledge Base");
    expect(markup).toContain("Okta SAML Active");

    expect(markup).toContain("FOR GAMING");
    expect(markup).toContain("Stovo for Gaming");
    expect(markup).toContain("Plans based on community size");
    expect(markup).toContain("Opus Voice Room");
    expect(markup).toContain("#Raid-Command-Alpha");

    expect(markup).toContain("FOR FAMILIES");
    expect(markup).toContain("Stovo for Families");
    expect(markup).toContain("Plans based on storage");
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

  it("renders pricing taxonomy v2 with dimension tabs, volume discounts, and managed infra", () => {
    const markup = getMarkup();

    // Pitch & core thesis
    expect(markup).toContain("Pricing built around how you use Stovo.");
    expect(markup).toContain("Companies scale by people. Communities scale by size. Families scale by storage.");

    // Dimension tabs
    expect(markup).toContain("Business");
    expect(markup).toContain("by organization size");
    expect(markup).toContain("Gaming");
    expect(markup).toContain("by community size");
    expect(markup).toContain("Family");
    expect(markup).toContain("by storage (max ~10 members)");

    // Default Business tier cards
    expect(markup).toContain("Business Starter");
    expect(markup).toContain("Business Team");
    expect(markup).toContain("Business Pro");
    expect(markup).toContain("Enterprise");
    expect(markup).toContain("SEAT VOLUME DISCOUNTS");
    expect(markup).toContain("Commercial licenses:");

    // Managed on Your Infrastructure pillar
    expect(markup).toContain("Managed on Your Infrastructure");
    expect(markup).toContain("Managed Small");
    expect(markup).toContain("Managed Business");
    expect(markup).toContain("Managed Enterprise");
    expect(markup).toContain("Assisted Installation");
    expect(markup).toContain("$299 one-time");
    expect(markup).toContain("Platform Migration");
    expect(markup).toContain("From $999");
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

  it("handles pricing dimension tab switching and billing toggles in the DOM", async () => {
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

    // Verify initial Business view
    expect(container.textContent).toContain("Business Starter");
    expect(container.textContent).toContain("Business Pro");
    expect(container.textContent).toContain("$8"); // annual price default for Team

    // Toggle billing to monthly
    const billingToggle = container.querySelector<HTMLButtonElement>('button[aria-label="Toggle annual or monthly billing"]');
    expect(billingToggle).not.toBeNull();

    await act(async () => {
      billingToggle?.click();
    });

    expect(container.textContent).toContain("$10"); // monthly price for Team
    expect(container.textContent).toContain("$18"); // monthly price for Pro

    const dimensionTabs = container.querySelectorAll<HTMLButtonElement>(".sl-pricing-tab");
    expect(dimensionTabs.length).toBe(3);

    // Switch to Gaming tab (index 1)
    await act(async () => {
      dimensionTabs[1].click();
    });

    expect(container.textContent).toContain("Gaming Free");
    expect(container.textContent).toContain("Gaming Core");
    expect(container.textContent).toContain("Gaming Pro");
    expect(container.textContent).toContain("Gaming Large");
    expect(container.textContent).toContain("Public Server Directory & Visibility");
    expect(container.textContent).toContain("Verified Server");

    // Switch to Family tab (index 2)
    await act(async () => {
      dimensionTabs[2].click();
    });

    expect(container.textContent).toContain("Family Free");
    expect(container.textContent).toContain("Family Plus");
    expect(container.textContent).toContain("Family Pro");
    expect(container.textContent).toContain("Family Max");
    expect(container.textContent).toContain("TRANSPARENT ADD-ONS");
    expect(container.textContent).toContain("+1 Family Member");
    expect(container.textContent).toContain("+250 GB Storage");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});

