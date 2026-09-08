import { useState } from "react";
import { Link } from "react-router-dom";
import VeloLogo from "../components/VeloLogo";
import "./LandingPage.css";

interface FAQItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FAQItem[] = [
  {
    question: "Is Stovo open source?",
    answer:
      "Stovo is published under a transparent Source-Available license. The code is completely public for auditing, testing, and non-commercial self-hosting. You have full inspection rights over cryptography, networking, and data isolation.",
  },
  {
    question: "Can I host Stovo myself without internet connectivity?",
    answer:
      "Yes. Stovo Self-Hosted can be completely air-gapped on local area networks (LANs). WebRTC voice relays and message sync function seamlessly across internal subnet ranges without dialing out to any third-party telemetry.",
  },
  {
    question: "Does Stovo offer managed cloud hosting?",
    answer:
      "Yes. Stovo Cloud provides dedicated, single-tenant isolated pods hosted in compliant European and US data centers with 99.99% availability SLAs, automated backups, and zero maintenance overhead.",
  },
  {
    question: "Can businesses use the Self-Hosted version?",
    answer:
      "Organizations can run the Community edition for small teams. For enterprise deployments requiring SAML/SSO directory sync, compliance audit logs, and priority SLA assistance, commercial self-hosted licenses are available.",
  },
  {
    question: "Can I move from Stovo Cloud to Self-Hosted later?",
    answer:
      "Absolutely. We believe in absolute digital sovereignty. You can generate a single cryptographic export archive containing all messages, threads, users, and object files and restore it into your own Docker cluster in under 10 minutes.",
  },
];

export default function LandingPage() {
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [solutionsDropdownOpen, setSolutionsDropdownOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [copiedDocker, setCopiedDocker] = useState(false);
  const [pricingDimension, setPricingDimension] = useState<"business" | "gaming" | "family">("business");
  const [annualBilling, setAnnualBilling] = useState(true);

  const handleCopyDocker = () => {
    void navigator.clipboard.writeText("docker compose up -d");
    setCopiedDocker(true);
    setTimeout(() => setCopiedDocker(false), 2200);
  };

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  return (
    <div className="stovo-landing">
      {/* ===================================================================
          STICKY NAVIGATION HEADER
         =================================================================== */}
      <header className="sl-header">
        <div className="sl-container sl-header-inner">
          <div className="sl-header-left">
            <Link to="/landing" className="sl-brand" aria-label="Stovo Home">
              <div className="sl-brand-logo">
                <VeloLogo size={30} />
              </div>
              <span className="sl-brand-text">Stovo</span>
            </Link>

            <nav className="sl-nav">
              {/* Product Dropdown */}
              <div
                className="sl-nav-item"
                onMouseEnter={() => setProductDropdownOpen(true)}
                onMouseLeave={() => setProductDropdownOpen(false)}
              >
                <button
                  type="button"
                  className="sl-nav-link"
                  onClick={() => setProductDropdownOpen(!productDropdownOpen)}
                  aria-expanded={productDropdownOpen}
                >
                  Product <span style={{ fontSize: "10px", opacity: 0.6 }}>▼</span>
                </button>
                {productDropdownOpen && (
                  <div className="sl-dropdown-menu">
                    <div className="sl-dropdown-card">
                      <a href="#deployments" className="sl-dropdown-item" onClick={() => setProductDropdownOpen(false)}>
                        Cloud &amp; Managed
                      </a>
                      <a href="#self-hosted" className="sl-dropdown-item" onClick={() => setProductDropdownOpen(false)}>
                        Self-Hosted Edition
                      </a>
                      <a href="#capabilities" className="sl-dropdown-item" onClick={() => setProductDropdownOpen(false)}>
                        Messaging &amp; Channels
                      </a>
                      <a href="#capabilities" className="sl-dropdown-item" onClick={() => setProductDropdownOpen(false)}>
                        Voice &amp; Video Mesh
                      </a>
                      <a href="#storage" className="sl-dropdown-item" onClick={() => setProductDropdownOpen(false)}>
                        Files &amp; Object Storage
                      </a>
                      <a href="#ai" className="sl-dropdown-item" onClick={() => setProductDropdownOpen(false)}>
                        Private AI &amp; Agents
                      </a>
                      <a href="#infrastructure" className="sl-dropdown-item" onClick={() => setProductDropdownOpen(false)}>
                        Integrations &amp; Webhooks
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Solutions Dropdown */}
              <div
                className="sl-nav-item"
                onMouseEnter={() => setSolutionsDropdownOpen(true)}
                onMouseLeave={() => setSolutionsDropdownOpen(false)}
              >
                <button
                  type="button"
                  className="sl-nav-link"
                  onClick={() => setSolutionsDropdownOpen(!solutionsDropdownOpen)}
                  aria-expanded={solutionsDropdownOpen}
                >
                  Solutions <span style={{ fontSize: "10px", opacity: 0.6 }}>▼</span>
                </button>
                {solutionsDropdownOpen && (
                  <div className="sl-dropdown-menu">
                    <div className="sl-dropdown-card">
                      <a href="#audience-business" className="sl-dropdown-item" onClick={() => setSolutionsDropdownOpen(false)}>
                        For Business &amp; Teams
                      </a>
                      <a href="#audience-gaming" className="sl-dropdown-item" onClick={() => setSolutionsDropdownOpen(false)}>
                        For Gaming Communities
                      </a>
                      <a href="#audience-family" className="sl-dropdown-item" onClick={() => setSolutionsDropdownOpen(false)}>
                        For Families &amp; Homes
                      </a>
                    </div>
                  </div>
                )}
              </div>

              <a href="#self-hosted" className="sl-nav-link">
                Self-Hosted
              </a>
              <a href="#pricing" className="sl-nav-link">
                Pricing
              </a>
              <a href="#infrastructure" className="sl-nav-link">
                Security
              </a>
            </nav>
          </div>

          <div className="sl-header-right">
            <Link to="/login" className="sl-btn-ghost">
              Sign In
            </Link>
            <a href="#self-hosted" className="sl-btn-secondary" style={{ display: "none" }}>
              Download
            </a>
            <Link to="/setup" className="sl-btn-primary">
              Get Stovo
            </Link>
          </div>
        </div>
      </header>

      {/* ===================================================================
          1. HERO SECTION & CANONICAL PRODUCT MOCKUP
         =================================================================== */}
      <section className="sl-hero">
        <div className="sl-ambient-glow-1" />
        <div className="sl-ambient-glow-2" />

        <div className="sl-container sl-hero-content">
          <div className="sl-pill-eyebrow">
            <span className="sl-pill-pulse" />
            MESSAGING • STORAGE • AI
          </div>

          <h1 className="sl-display-xl sl-hero-headline">
            Your conversations. Your files. <br />
            Your infrastructure.
          </h1>

          <p className="sl-body-lg sl-hero-subtitle">
            Private messaging, storage and AI for teams, communities and families. Hosted by Stovo or on your own server.
          </p>

          <div className="sl-hero-ctas">
            <Link to="/setup" className="sl-btn-primary" style={{ padding: "14px 28px", fontSize: "1.0625rem" }}>
              Get Stovo
            </Link>
            <a href="#self-hosted" className="sl-btn-secondary" style={{ padding: "14px 28px", fontSize: "1.0625rem" }}>
              Explore Self-Hosted <span className="sl-font-code">→</span>
            </a>
          </div>

          {/* Realistic Product UI Window */}
          <div className="sl-hero-preview-wrapper">
            {/* Floating Badges */}
            <div className="sl-floating-badge sl-badge-pos-1" style={{ color: "var(--sl-success)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>verified</span>
              <span>Message verified &amp; sent</span>
            </div>

            <div className="sl-floating-badge sl-badge-pos-2" style={{ color: "var(--sl-primary)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>lock</span>
              <span>File encrypted &amp; synced</span>
            </div>

            <div className="sl-floating-badge sl-badge-pos-3">
              <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--sl-gaming)" }}>smart_toy</span>
              <span>Stovo AI summarized #dev</span>
            </div>

            <div className="sl-floating-badge sl-badge-pos-4" style={{ color: "var(--sl-success)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>dns</span>
              <span>Storage node: Backed up locally</span>
            </div>

            {/* Window Chrome */}
            <div className="sl-product-window">
              <div className="sl-window-titlebar">
                <div className="sl-window-dots">
                  <span className="sl-dot sl-dot-red" />
                  <span className="sl-dot sl-dot-yellow" />
                  <span className="sl-dot sl-dot-green" />
                  <span className="sl-window-title">app.stovo.internal // cluster-eu-01</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "3px 10px",
                      borderRadius: "6px",
                      background: "var(--sl-surface)",
                      border: "1px solid var(--sl-border)",
                      fontFamily: "var(--sl-font-code)",
                      fontSize: "11px",
                      color: "var(--sl-success)",
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--sl-success)" }} />
                    mesh 12ms
                  </span>
                  <span className="material-symbols-outlined" style={{ color: "var(--sl-text-tertiary)", fontSize: "18px" }}>
                    tune
                  </span>
                </div>
              </div>

              {/* Interior Grid */}
              <div className="sl-window-interior">
                {/* Left Sidebar */}
                <div className="sl-window-sidebar">
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <div
                      style={{
                        padding: "10px 12px",
                        background: "var(--sl-surface)",
                        borderRadius: "12px",
                        border: "1px solid var(--sl-border)",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                      }}
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "8px",
                          background: "var(--sl-primary)",
                          color: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 700,
                          fontSize: "13px",
                        }}
                      >
                        K
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: "12px", color: "var(--sl-text-primary)" }}>Krypton Core</div>
                        <div style={{ fontSize: "10px", fontFamily: "var(--sl-font-code)", color: "var(--sl-text-tertiary)" }}>
                          self-hosted cluster
                        </div>
                      </div>
                      <span className="material-symbols-outlined" style={{ fontSize: "14px", color: "var(--sl-text-tertiary)" }}>
                        unfold_more
                      </span>
                    </div>

                    {/* Channels List */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span className="sl-label-caps" style={{ fontSize: "10px", color: "var(--sl-text-tertiary)", padding: "0 6px" }}>
                        Channels
                      </span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 12px",
                          borderRadius: "8px",
                          background: "var(--sl-surface)",
                          border: "1px solid var(--sl-border)",
                          fontWeight: 700,
                          fontSize: "12px",
                          color: "var(--sl-text-primary)",
                        }}
                      >
                        <span style={{ color: "var(--sl-primary)" }}>#</span> engineering
                        <span style={{ marginLeft: "auto", width: "6px", height: "6px", borderRadius: "50%", background: "var(--sl-primary)" }} />
                      </div>
                      {["design-system", "product-roadmap", "releases-v2", "security-audit"].map((ch) => (
                        <div
                          key={ch}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            fontSize: "12px",
                            color: "var(--sl-text-secondary)",
                          }}
                        >
                          <span style={{ color: "var(--sl-text-tertiary)" }}>#</span> {ch}
                        </div>
                      ))}
                    </div>

                    {/* Voice Mesh Room */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span className="sl-label-caps" style={{ fontSize: "10px", color: "var(--sl-text-tertiary)", padding: "0 6px" }}>
                        Voice Mesh
                      </span>
                      <div
                        style={{
                          padding: "12px",
                          borderRadius: "12px",
                          background: "var(--sl-surface)",
                          border: "1px solid var(--sl-border)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--sl-success)", fontSize: "11px", fontWeight: 600 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>mic</span> Standup • 4 active
                          </span>
                          <span style={{ fontFamily: "var(--sl-font-code)", fontSize: "10px", color: "var(--sl-text-tertiary)" }}>Opus 128k</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          {[
                            { name: "AL", bg: "var(--sl-primary)" },
                            { name: "MR", bg: "var(--sl-business)" },
                            { name: "TS", bg: "var(--sl-gaming)" },
                            { name: "+1", bg: "var(--sl-surface-container)" },
                          ].map((u) => (
                            <div
                              key={u.name}
                              style={{
                                width: "24px",
                                height: "24px",
                                borderRadius: "50%",
                                background: u.bg,
                                color: u.bg === "var(--sl-surface-container)" ? "var(--sl-text-secondary)" : "#ffffff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "9px",
                                fontWeight: 700,
                              }}
                            >
                              {u.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Storage Quota */}
                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "12px",
                      background: "var(--sl-surface)",
                      border: "1px solid var(--sl-border)",
                      marginTop: "16px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 600 }}>
                      <span style={{ color: "var(--sl-text-secondary)" }}>Node SSD Vault</span>
                      <span style={{ fontFamily: "var(--sl-font-code)", color: "var(--sl-text-primary)" }}>1.4TB / 4TB</span>
                    </div>
                    <div style={{ width: "100%", height: "6px", background: "var(--sl-surface-subtle)", borderRadius: "999px", marginTop: "8px", overflow: "hidden" }}>
                      <div style={{ width: "35%", height: "100%", background: "var(--sl-primary)", borderRadius: "999px" }} />
                    </div>
                  </div>
                </div>

                {/* Central Chat Stream */}
                <div className="sl-window-feed">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: "14px", borderBottom: "1px solid var(--sl-border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ color: "var(--sl-text-tertiary)", fontWeight: 700 }}>#</span>
                      <span style={{ fontWeight: 700, fontSize: "14px", color: "var(--sl-text-primary)" }}>engineering</span>
                      <span style={{ fontSize: "11px", color: "var(--sl-text-tertiary)", marginLeft: "8px" }}>
                        P2P Encrypted • Cluster node 01
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", color: "var(--sl-text-tertiary)" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "16px", cursor: "pointer" }}>push_pin</span>
                      <span className="material-symbols-outlined" style={{ fontSize: "16px", cursor: "pointer" }}>search</span>
                    </div>
                  </div>

                  {/* Messages Feed */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "18px", padding: "20px 0" }}>
                    {/* User Message */}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                      <div
                        style={{
                          width: "34px",
                          height: "34px",
                          borderRadius: "50%",
                          background: "var(--sl-business)",
                          color: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "11px",
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        MV
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontWeight: 700, fontSize: "12px", color: "var(--sl-text-primary)" }}>Marcus Vance</span>
                          <span style={{ fontSize: "10px", fontFamily: "var(--sl-font-code)", color: "var(--sl-text-tertiary)" }}>10:42 AM</span>
                        </div>
                        <p style={{ fontSize: "12px", color: "var(--sl-text-primary)", margin: 0 }}>
                          Uploaded the audited zero-trust migration plan for v2.4. Storage replica verified across MinIO targets.
                        </p>
                        <div
                          style={{
                            marginTop: "6px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "10px",
                            padding: "10px 14px",
                            borderRadius: "12px",
                            background: "var(--sl-surface-subtle)",
                            border: "1px solid var(--sl-border)",
                            maxWidth: "420px",
                          }}
                        >
                          <div
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "8px",
                              background: "var(--sl-surface)",
                              border: "1px solid var(--sl-border)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "var(--sl-primary)",
                            }}
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>description</span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                            <span style={{ fontWeight: 700, fontSize: "12px", color: "var(--sl-text-primary)" }}>stovo-sec-audit-2026.pdf</span>
                            <span style={{ fontFamily: "var(--sl-font-code)", fontSize: "10px", color: "var(--sl-text-tertiary)" }}>
                              4.2 MB • SHA-256 verified
                            </span>
                          </div>
                          <span className="material-symbols-outlined" style={{ marginLeft: "auto", fontSize: "16px", color: "var(--sl-text-tertiary)", cursor: "pointer" }}>
                            download
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Stovo AI Response */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "12px",
                        padding: "14px",
                        borderRadius: "16px",
                        background: "var(--sl-surface-subtle)",
                        border: "1px solid rgba(102, 87, 232, 0.25)",
                      }}
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "50%",
                          background: "var(--sl-primary)",
                          color: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>smart_toy</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontWeight: 700, color: "var(--sl-text-primary)" }}>Stovo AI</span>
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: "4px",
                              background: "rgba(102, 87, 232, 0.1)",
                              color: "var(--sl-primary)",
                              fontFamily: "var(--sl-font-code)",
                              fontSize: "9px",
                              fontWeight: 700,
                            }}
                          >
                            Grounded Engine
                          </span>
                        </div>
                        <p style={{ color: "var(--sl-text-secondary)", margin: 0, lineHeight: 1.5 }}>
                          Summary generated from audited document: Session token TTL adjusted to 30 minutes. Fallback to local hardware keys retained for self-hosted pods.
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px", fontSize: "10px", color: "var(--sl-text-tertiary)" }}>
                          <span className="material-symbols-outlined" style={{ fontSize: "14px", color: "var(--sl-success)" }}>check_circle</span>
                          <span>Verified against local Postgres memory node</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Input Box */}
                  <div
                    style={{
                      padding: "8px 12px",
                      borderRadius: "12px",
                      background: "var(--sl-surface-subtle)",
                      border: "1px solid var(--sl-border)",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--sl-text-tertiary)", cursor: "pointer" }}>
                      add_circle
                    </span>
                    <input
                      type="text"
                      readOnly
                      value="Message #engineering or ask @stovo..."
                      style={{
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        flex: 1,
                        fontSize: "12px",
                        color: "var(--sl-text-tertiary)",
                      }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--sl-text-tertiary)" }}>
                        sentiment_satisfied
                      </span>
                      <div
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "8px",
                          background: "var(--sl-primary)",
                          color: "#ffffff",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>arrow_upward</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Context Panel */}
                <div className="sl-window-context">
                  <div style={{ padding: "12px", borderRadius: "12px", background: "var(--sl-surface)", border: "1px solid var(--sl-border)" }}>
                    <span className="sl-label-caps" style={{ fontSize: "9px", color: "var(--sl-text-tertiary)" }}>Channel Details</span>
                    <div style={{ fontWeight: 700, fontSize: "12px", color: "var(--sl-text-primary)", marginTop: "4px" }}>#engineering</div>
                    <p style={{ fontSize: "11px", color: "var(--sl-text-secondary)", margin: "4px 0 0 0", lineHeight: 1.4 }}>
                      Core system architects, storage engineers and runtime contributors.
                    </p>
                  </div>

                  {/* Vault Assets */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <span className="sl-label-caps" style={{ fontSize: "9px", color: "var(--sl-text-tertiary)" }}>Channel Vault Assets</span>
                    <div style={{ padding: "10px 12px", borderRadius: "10px", background: "var(--sl-surface)", border: "1px solid var(--sl-border)", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--sl-business)" }}>folder_zip</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--sl-text-primary)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                          compose-v2.4.yml
                        </div>
                        <div style={{ fontSize: "9px", fontFamily: "var(--sl-font-code)", color: "var(--sl-text-tertiary)" }}>38 KB</div>
                      </div>
                    </div>

                    <div style={{ padding: "10px 12px", borderRadius: "10px", background: "var(--sl-surface)", border: "1px solid var(--sl-border)", display: "flex", alignItems: "center", gap: "8px" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--sl-family)" }}>image</span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--sl-text-primary)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                          mesh-topology.png
                        </div>
                        <div style={{ fontSize: "9px", fontFamily: "var(--sl-font-code)", color: "var(--sl-text-tertiary)" }}>1.8 MB</div>
                      </div>
                    </div>
                  </div>

                  {/* Security Posture */}
                  <div style={{ marginTop: "auto", padding: "12px", borderRadius: "12px", background: "var(--sl-surface)", border: "1px solid var(--sl-border)", display: "flex", flexDirection: "column", gap: "6px", fontSize: "11px" }}>
                    <span className="sl-label-caps" style={{ fontSize: "9px", color: "var(--sl-text-tertiary)" }}>Security Posture</span>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--sl-text-secondary)" }}>E2E Protocol</span>
                      <span style={{ fontFamily: "var(--sl-font-code)", color: "var(--sl-success)", fontWeight: 700 }}>MLS active</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--sl-text-secondary)" }}>Zero-Knowledge</span>
                      <span style={{ fontFamily: "var(--sl-font-code)", color: "var(--sl-primary)", fontWeight: 700 }}>Enforced</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          2. AUDIENCE SECTION ('Stovo adapts to your world')
         =================================================================== */}
      <section className="sl-section sl-section-audience" id="solutions">
        <div className="sl-container">
          <div style={{ maxWidth: "680px" }}>
            <span className="sl-pill-eyebrow" style={{ color: "var(--sl-primary)", background: "rgba(102, 87, 232, 0.1)" }}>
              Target Postures
            </span>
            <h2 className="sl-headline-lg" style={{ marginTop: "14px" }}>
              Stovo adapts to your world.
            </h2>
            <p className="sl-body-lg" style={{ marginTop: "12px" }}>
              One unified chassis powering corporate security, gaming communities, and private household memory archives.
            </p>
          </div>

          <div className="sl-audience-grid">
            {/* Card 1: Business */}
            <div className="sl-audience-card" id="audience-business">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <div className="sl-audience-badge" style={{ background: "rgba(82, 120, 244, 0.1)", color: "var(--sl-business)" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--sl-business)" }} />
                    FOR BUSINESS
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--sl-business)", background: "rgba(82, 120, 244, 0.08)", padding: "3px 8px", borderRadius: "6px" }}>
                    Plans based on team size
                  </span>
                </div>
                <h3 className="sl-headline-md" style={{ marginTop: "16px", color: "var(--sl-text-primary)" }}>
                  Stovo for Business
                </h3>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--sl-text-secondary)", marginTop: "4px" }}>
                  For organizations • Messaging · Company Brain · Identity · Administration
                </div>
                <p className="sl-body-md" style={{ fontSize: "0.875rem", marginTop: "8px" }}>
                  Bring your team, files, knowledge and AI into one private workspace.
                </p>

                {/* Business Widget */}
                <div className="sl-widget-preview">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", fontWeight: 700 }}>
                    <span>Corporate Knowledge Base</span>
                    <span style={{ color: "var(--sl-business)", fontFamily: "var(--sl-font-code)", fontSize: "10px" }}>98.4% match</span>
                  </div>
                  <div style={{ padding: "10px", borderRadius: "8px", background: "var(--sl-surface)", border: "1px solid var(--sl-border)", fontSize: "11px", color: "var(--sl-text-secondary)" }}>
                    "SOC2 Type II compliance audit packet verified across 1,420 files."
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", fontFamily: "var(--sl-font-code)", color: "var(--sl-text-tertiary)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "14px", color: "var(--sl-business)" }}>verified_user</span> Okta SAML Active
                    </span>
                    <span style={{ color: "var(--sl-success)", fontWeight: 700 }}>Synced</span>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "28px" }}>
                <a href="#pricing" onClick={() => setPricingDimension("business")} style={{ color: "var(--sl-business)", fontWeight: 700, fontSize: "0.875rem", textDecoration: "none" }}>
                  Explore Stovo Business →
                </a>
              </div>
            </div>

            {/* Card 2: Gaming */}
            <div className="sl-audience-card" id="audience-gaming">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <div className="sl-audience-badge" style={{ background: "rgba(138, 92, 246, 0.1)", color: "var(--sl-gaming)" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--sl-gaming)" }} />
                    FOR GAMING
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--sl-gaming)", background: "rgba(138, 92, 246, 0.08)", padding: "3px 8px", borderRadius: "6px" }}>
                    Plans based on community size
                  </span>
                </div>
                <h3 className="sl-headline-md" style={{ marginTop: "16px", color: "var(--sl-text-primary)" }}>
                  Stovo for Gaming
                </h3>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--sl-text-secondary)", marginTop: "4px" }}>
                  For communities • Voice · Servers · Bots · Discovery
                </div>
                <p className="sl-body-md" style={{ fontSize: "0.875rem", marginTop: "8px" }}>
                  Build your community around chat, voice, media and the games you play.
                </p>

                {/* Gaming Voice Widget */}
                <div className="sl-widget-preview">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", fontWeight: 700 }}>
                    <span>Opus Voice Room</span>
                    <span style={{ color: "var(--sl-gaming)", fontFamily: "var(--sl-font-code)", fontSize: "10px" }}>14ms latency</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px", borderRadius: "8px", background: "var(--sl-surface)", border: "1px solid var(--sl-border)", fontSize: "11px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--sl-success)" }} />
                      <span style={{ fontWeight: 600 }}>#Raid-Command-Alpha</span>
                    </div>
                    <span style={{ fontFamily: "var(--sl-font-code)", fontSize: "10px", color: "var(--sl-text-tertiary)" }}>48kHz HQ</span>
                  </div>
                  <div style={{ width: "100%", height: "6px", background: "var(--sl-surface-container)", borderRadius: "999px", overflow: "hidden" }}>
                    <div style={{ width: "82%", height: "100%", background: "var(--sl-gaming)", borderRadius: "999px" }} />
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "28px" }}>
                <a href="#pricing" onClick={() => setPricingDimension("gaming")} style={{ color: "var(--sl-gaming)", fontWeight: 700, fontSize: "0.875rem", textDecoration: "none" }}>
                  Explore Stovo Gaming →
                </a>
              </div>
            </div>

            {/* Card 3: Families */}
            <div className="sl-audience-card" id="audience-family">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <div className="sl-audience-badge" style={{ background: "rgba(229, 106, 137, 0.1)", color: "var(--sl-family)" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--sl-family)" }} />
                    FOR FAMILIES
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--sl-family)", background: "rgba(229, 106, 137, 0.08)", padding: "3px 8px", borderRadius: "6px" }}>
                    Plans based on storage
                  </span>
                </div>
                <h3 className="sl-headline-md" style={{ marginTop: "16px", color: "var(--sl-text-primary)" }}>
                  Stovo for Families
                </h3>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--sl-text-secondary)", marginTop: "4px" }}>
                  For households • Photos · Backups · Documents · Storage
                </div>
                <p className="sl-body-md" style={{ fontSize: "0.875rem", marginTop: "8px" }}>
                  Keep conversations, photos, documents and backups in one private family space.
                </p>

                {/* Family Media Vault Widget */}
                <div className="sl-widget-preview">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", fontWeight: 700 }}>
                    <span>Family Media &amp; Archive</span>
                    <span style={{ color: "var(--sl-family)", fontFamily: "var(--sl-font-code)", fontSize: "10px" }}>End-to-End Encrypted</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
                    <div style={{ height: "46px", borderRadius: "8px", background: "var(--sl-surface)", border: "1px solid var(--sl-border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--sl-family)" }}>photo</span>
                      <span style={{ fontFamily: "var(--sl-font-code)", fontSize: "9px", color: "var(--sl-text-tertiary)" }}>Vacation</span>
                    </div>
                    <div style={{ height: "46px", borderRadius: "8px", background: "var(--sl-surface)", border: "1px solid var(--sl-border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--sl-business)" }}>lock</span>
                      <span style={{ fontFamily: "var(--sl-font-code)", fontSize: "9px", color: "var(--sl-text-tertiary)" }}>Passports</span>
                    </div>
                    <div style={{ height: "46px", borderRadius: "8px", background: "rgba(229, 106, 137, 0.1)", border: "1px solid rgba(229, 106, 137, 0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--sl-family)", fontWeight: 700, fontSize: "12px" }}>
                      +340
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "28px" }}>
                <a href="#pricing" style={{ color: "var(--sl-family)", fontWeight: 700, fontSize: "0.875rem", textDecoration: "none" }}>
                  Explore Stovo Family →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          3. CLOUD VS SELF-HOSTED ('Your cloud. Or ours.')
         =================================================================== */}
      <section className="sl-section" id="deployments" style={{ background: "var(--sl-surface)" }}>
        <div className="sl-container">
          <div style={{ textAlign: "center", maxWidth: "680px", margin: "0 auto" }}>
            <span className="sl-pill-eyebrow">Autonomous Deployments</span>
            <h2 className="sl-headline-lg" style={{ marginTop: "14px" }}>
              Your cloud. Or ours.
            </h2>
            <p className="sl-body-lg" style={{ marginTop: "12px" }}>
              Zero vendor lock-in. Stovo provides pristine hosted managed clouds or a frictionless Docker container engine you run on your own metal.
            </p>
          </div>

          <div className="sl-deployments-grid" id="self-hosted">
            {/* Stovo Cloud Card */}
            <div className="sl-deploy-card">
              <div>
                <div className="sl-deploy-icon-box" style={{ background: "rgba(102, 87, 232, 0.1)", color: "var(--sl-primary)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>cloud_sync</span>
                </div>
                <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)" }}>Stovo Cloud</h3>
                <p className="sl-body-md" style={{ fontSize: "0.875rem", marginTop: "8px" }}>
                  Hosted by Stovo. No servers. No maintenance. Create your isolated instance in 30 seconds and start collaborating instantly.
                </p>

                <ul style={{ listStyle: "none", padding: 0, margin: "24px 0 0 0", display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.8125rem" }}>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "16px" }}>check_circle</span>
                    <span>Automatic zero-downtime version upgrades</span>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "16px" }}>check_circle</span>
                    <span>Daily automated snapshots &amp; recovery</span>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "16px" }}>check_circle</span>
                    <span>Managed global edge voice mesh relay</span>
                  </li>
                </ul>
              </div>

              <div style={{ marginTop: "32px" }}>
                <Link to="/setup" className="sl-btn-primary" style={{ width: "100%" }}>
                  Start with Stovo Cloud
                </Link>
              </div>
            </div>

            {/* Self-Hosted Engine Card */}
            <div className="sl-deploy-card">
              <div>
                <div className="sl-deploy-icon-box" style={{ background: "rgba(24, 121, 78, 0.1)", color: "var(--sl-success)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "28px" }}>terminal</span>
                </div>
                <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)" }}>Self-Hosted Engine</h3>
                <p className="sl-body-md" style={{ fontSize: "0.875rem", marginTop: "8px" }}>
                  Run Stovo on your own VPS, home lab, or private cloud. 1-command startup with complete sovereignty over your data and cryptographic keys.
                </p>

                <ul style={{ listStyle: "none", padding: 0, margin: "24px 0 0 0", display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.8125rem" }}>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "16px" }}>check_circle</span>
                    <span>100% data sovereignty; zero outbound telemetry</span>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "16px" }}>check_circle</span>
                    <span>Full Docker Compose &amp; Kubernetes Helm charts</span>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "16px" }}>check_circle</span>
                    <span>LAN air-gap mode with zero public internet needed</span>
                  </li>
                </ul>
              </div>

              <div style={{ marginTop: "32px" }}>
                <a href="#infrastructure" className="sl-btn-secondary" style={{ width: "100%" }}>
                  Explore Docker Setup
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          4. CORE CAPABILITIES (BENTO GRID: MESSAGING ANCHOR)
         =================================================================== */}
      <section className="sl-section" id="capabilities" style={{ background: "var(--sl-surface-subtle)", borderTop: "1px solid var(--sl-border)", borderBottom: "1px solid var(--sl-border)" }}>
        <div className="sl-container">
          <div style={{ maxWidth: "680px" }}>
            <span className="sl-pill-eyebrow">Full Ecosystem</span>
            <h2 className="sl-headline-lg" style={{ marginTop: "14px" }}>
              More than messaging.
            </h2>
            <p className="sl-body-lg" style={{ marginTop: "12px" }}>
              A deeply unified communication engine built to replace fragmented tools with cohesive, sovereign architecture.
            </p>
          </div>

          <div className="sl-bento-grid">
            {/* Anchor Card: Messaging */}
            <div className="sl-bento-card sl-bento-anchor">
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "14px",
                        background: "rgba(102, 87, 232, 0.1)",
                        color: "var(--sl-primary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: "26px" }}>forum</span>
                    </div>
                    <div>
                      <span className="sl-label-caps" style={{ color: "var(--sl-primary)", fontSize: "10px" }}>Core Chassis Primitive</span>
                      <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)", margin: 0 }}>Messaging &amp; Channels</h3>
                    </div>
                  </div>
                  <span style={{ padding: "4px 10px", borderRadius: "6px", background: "var(--sl-surface-subtle)", border: "1px solid var(--sl-border)", fontFamily: "var(--sl-font-code)", fontSize: "11px", color: "var(--sl-text-tertiary)" }}>
                    Real-time WebSocket • MLS
                  </span>
                </div>

                <p className="sl-body-md" style={{ marginTop: "20px", maxWidth: "620px" }}>
                  High-throughput group and direct communication protected by Messaging Layer Security (RFC 9420). Rich threaded discussions, instant reactions, full-text search, and cryptographic message provenance.
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "20px" }}>
                  {["End-to-End Encryption", "P2P WebSockets", "Cross-Platform Sync", "Message Threads", "Emoji Reactions"].map((feat) => (
                    <span
                      key={feat}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "8px",
                        background: "var(--sl-surface-subtle)",
                        border: "1px solid var(--sl-border)",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--sl-text-primary)",
                      }}
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Side Card: Voice & Video Mesh */}
            <div className="sl-bento-card sl-bento-side">
              <div>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    background: "rgba(82, 120, 244, 0.1)",
                    color: "var(--sl-business)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "16px",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>call</span>
                </div>
                <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)" }}>Voice &amp; Video Mesh</h3>
                <p className="sl-body-md" style={{ fontSize: "0.875rem", marginTop: "8px" }}>
                  Ultra low-latency WebRTC audio rooms and high-definition video conferencing with screen sharing and end-to-end peer encryption.
                </p>
              </div>
              <div style={{ marginTop: "20px", fontFamily: "var(--sl-font-code)", fontSize: "11px", color: "var(--sl-text-tertiary)" }}>
                Opus 128kbps • Adaptive Bitrate
              </div>
            </div>

            {/* Card 3: Storage Vaults */}
            <div className="sl-bento-card sl-bento-card-4">
              <div>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    background: "rgba(24, 121, 78, 0.1)",
                    color: "var(--sl-success)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "16px",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>inventory_2</span>
                </div>
                <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)" }}>Object Storage &amp; Vaults</h3>
                <p className="sl-body-md" style={{ fontSize: "0.875rem", marginTop: "8px" }}>
                  Store files, documents, backups and media. Mount your own AWS S3, Cloudflare R2, MinIO or local NAS disks with zero markup fees.
                </p>
              </div>
              <div style={{ marginTop: "20px", fontFamily: "var(--sl-font-code)", fontSize: "11px", color: "var(--sl-text-tertiary)" }}>
                S3-Compatible • Chunked AES-GCM
              </div>
            </div>

            {/* Card 4: Private AI Engine */}
            <div className="sl-bento-card sl-bento-card-4">
              <div>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    background: "rgba(138, 92, 246, 0.1)",
                    color: "var(--sl-gaming)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "16px",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>smart_toy</span>
                </div>
                <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)" }}>Private AI Engine</h3>
                <p className="sl-body-md" style={{ fontSize: "0.875rem", marginTop: "8px" }}>
                  Local retrieval-augmented generation (RAG) over all your messages and files. Citations are 100% verifiable; embeddings never leave your node.
                </p>
              </div>
              <div style={{ marginTop: "20px", fontFamily: "var(--sl-font-code)", fontSize: "11px", color: "var(--sl-text-tertiary)" }}>
                Postgres Vector • Local or BYO LLM
              </div>
            </div>

            {/* Card 5: Integrations & Bots */}
            <div className="sl-bento-card sl-bento-card-4">
              <div>
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "12px",
                    background: "rgba(152, 106, 0, 0.1)",
                    color: "var(--sl-warning)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: "16px",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "24px" }}>extension</span>
                </div>
                <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)" }}>Extensible Integrations</h3>
                <p className="sl-body-md" style={{ fontSize: "0.875rem", marginTop: "8px" }}>
                  Connect custom bots, webhooks, Model Context Protocol (MCP) servers, and CI/CD pipelines directly into your communication channels.
                </p>
              </div>
              <div style={{ marginTop: "20px", fontFamily: "var(--sl-font-code)", fontSize: "11px", color: "var(--sl-text-tertiary)" }}>
                MCP Connectors • REST &amp; Webhooks
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          5. SUPERCHARGED STORAGE SECTION
         =================================================================== */}
      <section className="sl-section-lg" id="storage" style={{ background: "var(--sl-surface)" }}>
        <div className="sl-container">
          <div className="sl-storage-grid">
            {/* Left: Text & Lifecycle Pipeline */}
            <div>
              <span className="sl-pill-eyebrow">Cohesive File Architecture</span>
              <h2 className="sl-headline-lg" style={{ marginTop: "14px", lineHeight: 1.15 }}>
                Messages and files belong in one connected workspace.
              </h2>
              <p className="sl-body-lg" style={{ marginTop: "16px" }}>
                Stop losing critical documents across fragmented cloud drives and message apps. Stovo treats storage as a native structural primitive of conversation channels.
              </p>

              {/* 4-Step Pipeline */}
              <div className="sl-lifecycle-pipeline">
                <span className="sl-label-caps" style={{ fontSize: "11px", color: "var(--sl-text-tertiary)" }}>
                  File Lifecycle in Stovo
                </span>
                <div className="sl-pipeline-step">
                  <span style={{ width: "26px", height: "26px", borderRadius: "6px", background: "rgba(102, 87, 232, 0.1)", color: "var(--sl-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>chat</span>
                  </span>
                  <span>Message in <span className="sl-font-code" style={{ color: "var(--sl-primary)" }}>#engineering</span></span>
                  <span style={{ marginLeft: "auto", color: "var(--sl-text-tertiary)" }}>→</span>
                </div>
                <div className="sl-pipeline-step">
                  <span style={{ width: "26px", height: "26px", borderRadius: "6px", background: "rgba(82, 120, 244, 0.1)", color: "var(--sl-business)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>attach_file</span>
                  </span>
                  <span>Attachment (<span className="sl-font-code">Architecture.pdf</span>)</span>
                  <span style={{ marginLeft: "auto", color: "var(--sl-text-tertiary)" }}>→</span>
                </div>
                <div className="sl-pipeline-step">
                  <span style={{ width: "26px", height: "26px", borderRadius: "6px", background: "rgba(138, 92, 246, 0.1)", color: "var(--sl-gaming)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>folder</span>
                  </span>
                  <span>Saved to <span className="sl-font-code" style={{ color: "var(--sl-gaming)" }}>/Projects/Docs</span></span>
                  <span style={{ marginLeft: "auto", color: "var(--sl-text-tertiary)" }}>→</span>
                </div>
                <div className="sl-pipeline-step">
                  <span style={{ width: "26px", height: "26px", borderRadius: "6px", background: "rgba(24, 121, 78, 0.1)", color: "var(--sl-success)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>security</span>
                  </span>
                  <span style={{ color: "var(--sl-success)" }}>Synced in Stovo Drive &amp; Encrypted Vault</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "28px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "var(--sl-surface-subtle)", border: "1px solid var(--sl-border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--sl-primary)", flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>link</span>
                  </div>
                  <div>
                    <h4 className="sl-headline-sm" style={{ fontSize: "0.9375rem", margin: 0 }}>Contextual Attachment</h4>
                    <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", margin: "2px 0 0 0" }}>
                      Files remain tied to thread decisions forever, never orphaned in siloed third-party cloud directories.
                    </p>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "var(--sl-surface-subtle)", border: "1px solid var(--sl-border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--sl-primary)", flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>cloud_done</span>
                  </div>
                  <div>
                    <h4 className="sl-headline-sm" style={{ fontSize: "0.9375rem", margin: 0 }}>BYO S3 Storage</h4>
                    <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", margin: "2px 0 0 0" }}>
                      Mount AWS S3, Cloudflare R2, MinIO, or Wasabi buckets with zero host markup fees.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Stovo Drive Mockup Window */}
            <div className="sl-drive-window">
              <div style={{ height: "52px", background: "var(--sl-surface-subtle)", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--sl-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "22px", color: "var(--sl-primary)" }}>folder_managed</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--sl-text-primary)" }}>Stovo Drive</div>
                    <div style={{ fontSize: "10px", fontFamily: "var(--sl-font-code)", color: "var(--sl-text-tertiary)" }}>Workspace Vault</div>
                  </div>
                </div>
                <span style={{ padding: "4px 10px", borderRadius: "6px", background: "var(--sl-surface)", border: "1px solid var(--sl-border)", fontFamily: "var(--sl-font-code)", fontSize: "11px", color: "var(--sl-success)", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--sl-success)" }} /> Encrypted S3 Node
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", minHeight: "380px" }}>
                <div style={{ background: "rgba(240, 242, 247, 0.4)", padding: "16px", borderRight: "1px solid var(--sl-border)", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span className="sl-label-caps" style={{ fontSize: "9px", color: "var(--sl-text-tertiary)", padding: "0 6px" }}>Locations</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "8px", background: "rgba(102, 87, 232, 0.1)", color: "var(--sl-primary)", fontWeight: 700, fontSize: "12px" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>folder</span> All Files
                  </div>
                  {["Photos", "Documents", "Database Dumps", "Archives"].map((loc) => (
                    <div key={loc} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "8px", fontSize: "12px", color: "var(--sl-text-secondary)" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--sl-text-tertiary)" }}>folder</span> {loc}
                    </div>
                  ))}
                </div>

                <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {[
                    { name: "stovo-sec-audit-2026.pdf", size: "4.2 MB", tag: "Audited", color: "var(--sl-primary)" },
                    { name: "mesh-topology-v2.4.png", size: "1.8 MB", tag: "Design", color: "var(--sl-family)" },
                    { name: "docker-compose.prod.yml", size: "38 KB", tag: "Config", color: "var(--sl-business)" },
                    { name: "cluster-keys-backup.enc", size: "12 KB", tag: "Encrypted", color: "var(--sl-success)" },
                  ].map((file) => (
                    <div
                      key={file.name}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "10px",
                        background: "var(--sl-surface)",
                        border: "1px solid var(--sl-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "12px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: "20px", color: file.color }}>description</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: "var(--sl-text-primary)" }}>{file.name}</div>
                          <div style={{ fontSize: "10px", fontFamily: "var(--sl-font-code)", color: "var(--sl-text-tertiary)" }}>{file.size}</div>
                        </div>
                      </div>
                      <span style={{ padding: "2px 8px", borderRadius: "4px", background: "var(--sl-surface-subtle)", border: "1px solid var(--sl-border)", fontFamily: "var(--sl-font-code)", fontSize: "10px", color: "var(--sl-text-secondary)" }}>
                        {file.tag}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          6. SUPERCHARGED STOVO AI SECTION
         =================================================================== */}
      <section className="sl-section-lg" id="ai" style={{ background: "var(--sl-surface-subtle)", borderTop: "1px solid var(--sl-border)", borderBottom: "1px solid var(--sl-border)" }}>
        <div className="sl-container">
          <div style={{ textAlign: "center", maxWidth: "680px", margin: "0 auto" }}>
            <span className="sl-pill-eyebrow">Private Semantic Intelligence</span>
            <h2 className="sl-headline-lg" style={{ marginTop: "14px" }}>
              AI that understands your workspace.
            </h2>
            <p className="sl-body-lg" style={{ marginTop: "12px" }}>
              No cloud scraping. Grounded strictly in your private files, messages, and meeting notes with transparent provenance citations.
            </p>
          </div>

          <div className="sl-ai-canvas-grid">
            {/* Left: Query + Answer + Centerpiece Sources */}
            <div style={{ background: "var(--sl-surface)", border: "1px solid var(--sl-border)", borderRadius: "20px", padding: "32px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 16px 40px -8px rgba(17, 19, 26, 0.08)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                {/* Query */}
                <div style={{ padding: "14px 18px", borderRadius: "14px", background: "var(--sl-surface-subtle)", border: "1px solid var(--sl-border)", display: "flex", alignItems: "center", gap: "12px" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "20px", color: "var(--sl-primary)" }}>search</span>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--sl-text-primary)", flex: 1 }}>
                    What did we decide about auth migration?
                  </span>
                  <span style={{ padding: "3px 8px", borderRadius: "4px", background: "var(--sl-surface)", border: "1px solid var(--sl-border)", fontFamily: "var(--sl-font-code)", fontSize: "10px", fontWeight: 700, color: "var(--sl-text-tertiary)" }}>
                    ENTER
                  </span>
                </div>

                {/* Grounded Answer */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "var(--sl-primary)", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>auto_awesome</span>
                      </div>
                      <span style={{ fontWeight: 700, fontSize: "14px" }}>Stovo Grounded Answer</span>
                    </div>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--sl-success)", fontFamily: "var(--sl-font-code)", fontSize: "11px", fontWeight: 700 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>verified</span> Verified with 3 sources
                    </span>
                  </div>

                  <p style={{ margin: 0, padding: "16px", borderRadius: "14px", background: "rgba(240, 242, 247, 0.6)", border: "1px solid var(--sl-border)", fontSize: "13px", lineHeight: 1.6, color: "var(--sl-text-primary)" }}>
                    The team approved transitioning all user identities to <strong>OpenID Connect (OIDC)</strong> with Passkey/WebAuthn support. The legacy session cookie store will be deprecated by <strong>October 15</strong>, with backward compatibility maintained for CLI agents.
                  </p>
                </div>

                {/* Centerpiece: Bold Verified Sources */}
                <div className="sl-source-citations">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className="sl-label-caps" style={{ color: "var(--sl-primary)", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "15px" }}>link</span> Verified Sources:
                    </span>
                    <span style={{ fontFamily: "var(--sl-font-code)", fontSize: "10px", color: "var(--sl-text-tertiary)" }}>
                      3 references matched
                    </span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                    <div className="sl-source-chip">
                      <span style={{ color: "var(--sl-primary)", fontWeight: 700 }}>#</span> backend
                      <span className="material-symbols-outlined" style={{ fontSize: "12px", color: "var(--sl-text-tertiary)" }}>open_in_new</span>
                    </div>
                    <div className="sl-source-chip">
                      <span className="material-symbols-outlined" style={{ fontSize: "14px", color: "var(--sl-danger)" }}>picture_as_pdf</span> Architecture.pdf
                      <span className="material-symbols-outlined" style={{ fontSize: "12px", color: "var(--sl-text-tertiary)" }}>open_in_new</span>
                    </div>
                    <div className="sl-source-chip">
                      <span className="material-symbols-outlined" style={{ fontSize: "14px", color: "var(--sl-business)" }}>calendar_today</span> Meeting · Aug 21
                      <span className="material-symbols-outlined" style={{ fontSize: "12px", color: "var(--sl-text-tertiary)" }}>open_in_new</span>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--sl-border)", fontFamily: "var(--sl-font-code)", fontSize: "11px", color: "var(--sl-text-tertiary)" }}>
                <span>Latency: 280ms • Local RAG Engine</span>
                <span>Zero External LLM Calls</span>
              </div>
            </div>

            {/* Right: Context Inspection Panel */}
            <div style={{ background: "var(--sl-surface)", border: "1px solid var(--sl-border)", borderRadius: "20px", padding: "28px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "12px", borderBottom: "1px solid var(--sl-border)" }}>
                  <span className="sl-label-caps" style={{ fontSize: "11px", color: "var(--sl-text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--sl-primary)" }}>find_in_page</span> Context Inspection Panel
                  </span>
                  <span style={{ fontFamily: "var(--sl-font-code)", fontSize: "11px", color: "var(--sl-success)", fontWeight: 700 }}>100% Grounded</span>
                </div>

                <div style={{ padding: "12px 14px", borderRadius: "12px", background: "var(--sl-surface-subtle)", border: "1px solid var(--sl-border)", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ color: "var(--sl-primary)" }}>#</span> backend
                    </span>
                    <span style={{ fontFamily: "var(--sl-font-code)", fontSize: "10px", color: "var(--sl-text-tertiary)" }}>Score: 0.96</span>
                  </div>
                  <p style={{ fontFamily: "var(--sl-font-code)", fontSize: "11px", color: "var(--sl-text-secondary)", margin: 0, lineHeight: 1.4 }}>
                    "...let's settle on OIDC for auth. We will cutover auth pods by mid-October..."
                  </p>
                </div>

                <div style={{ padding: "12px 14px", borderRadius: "12px", background: "var(--sl-surface-subtle)", border: "1px solid var(--sl-border)", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "14px", color: "var(--sl-danger)" }}>picture_as_pdf</span> Architecture.pdf (Page 14)
                    </span>
                    <span style={{ fontFamily: "var(--sl-font-code)", fontSize: "10px", color: "var(--sl-text-tertiary)" }}>Score: 0.94</span>
                  </div>
                  <p style={{ fontFamily: "var(--sl-font-code)", fontSize: "11px", color: "var(--sl-text-secondary)", margin: 0, lineHeight: 1.4 }}>
                    "Session tokens expire at 30 mins; Passkey WebAuthn enabled as fallback."
                  </p>
                </div>

                <div style={{ padding: "12px 14px", borderRadius: "12px", background: "var(--sl-surface-subtle)", border: "1px solid var(--sl-border)", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: 700 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span className="material-symbols-outlined" style={{ fontSize: "14px", color: "var(--sl-business)" }}>calendar_today</span> Meeting Transcript · Aug 21
                    </span>
                    <span style={{ fontFamily: "var(--sl-font-code)", fontSize: "10px", color: "var(--sl-text-tertiary)" }}>Score: 0.91</span>
                  </div>
                  <p style={{ fontFamily: "var(--sl-font-code)", fontSize: "11px", color: "var(--sl-text-secondary)", margin: 0, lineHeight: 1.4 }}>
                    "Action item assigned to security team: finalize deprecation notice for legacy cookie store."
                  </p>
                </div>
              </div>

              <div style={{ marginTop: "20px", paddingTop: "14px", borderTop: "1px solid var(--sl-border)", fontSize: "11px", color: "var(--sl-text-secondary)", lineHeight: 1.5 }}>
                All context chunks stay resident inside your local PostgreSQL vector store. No embeddings leave your designated perimeter.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          7. INFRASTRUCTURE & PRIVACY (DARK MODE #090B10 CONTAINER)
         =================================================================== */}
      <section className="sl-section-lg sl-section-dark" id="infrastructure">
        <div className="sl-dark-glow" />

        <div className="sl-container" style={{ position: "relative", zIndex: 2 }}>
          <div style={{ textAlign: "center", maxWidth: "680px", margin: "0 auto" }}>
            <span className="sl-pill-eyebrow" style={{ background: "rgba(102, 87, 232, 0.2)", color: "#c6c0ff" }}>
              Sovereignty by Design
            </span>
            <h2 className="sl-headline-lg" style={{ marginTop: "16px", color: "var(--sl-dark-text-primary)" }}>
              Private by architecture. Not by promise.
            </h2>
            <p className="sl-body-lg" style={{ marginTop: "14px", color: "var(--sl-dark-text-secondary)" }}>
              Traditional platforms claim privacy while retaining server decryption keys. Stovo's topology isolates compute, keys, and storage on nodes you select.
            </p>
          </div>

          {/* Node Topology Pipeline */}
          <div className="sl-node-pipeline">
            {[
              {
                icon: "devices",
                name: "1. Client Endpoints",
                detail: "Web, iOS, Android, macOS, Linux with local MLS cryptographic keystores",
                status: "E2E Verified",
              },
              {
                icon: "lock",
                name: "2. Ingress & TLS 1.3 Termination",
                detail: "Custom domains, automated Let's Encrypt certificates, reverse proxy isolation",
                status: "Zero Plaintext",
              },
              {
                icon: "memory",
                name: "3. Stovo Daemon Orchestrator",
                detail: "High-concurrency Go engine managing state, WebRTC routing, and indexing",
                status: "Self-Contained",
              },
              {
                icon: "dns",
                name: "4. Encrypted Storage Vault",
                detail: "AES-256-GCM chunked object stores on local NVMe or private S3 buckets",
                status: "At-Rest Enforced",
              },
              {
                icon: "terminal",
                name: "5. Bare Metal / Enclave",
                detail: "Runs on your hardware: Raspberry Pi 5 to multi-node enterprise server racks",
                status: "Air-Gapped Ready",
              },
            ].map((node) => (
              <div key={node.name} className="sl-node-card">
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <div
                    style={{
                      width: "44px",
                      height: "44px",
                      borderRadius: "12px",
                      background: "var(--sl-dark-surface-elevated)",
                      color: "#c6c0ff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: "22px" }}>{node.icon}</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--sl-dark-text-primary)" }}>{node.name}</div>
                    <div style={{ fontSize: "12px", color: "var(--sl-dark-text-secondary)", marginTop: "2px" }}>{node.detail}</div>
                  </div>
                </div>
                <span
                  style={{
                    padding: "4px 12px",
                    borderRadius: "999px",
                    background: "rgba(24, 121, 78, 0.15)",
                    border: "1px solid rgba(24, 121, 78, 0.3)",
                    color: "var(--sl-success)",
                    fontFamily: "var(--sl-font-code)",
                    fontSize: "11px",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {node.status}
                </span>
              </div>
            ))}
          </div>

          {/* Docker 1-Liner Box */}
          <div className="sl-cli-box">
            <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
              <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "22px" }}>terminal</span>
              <div style={{ minWidth: 0 }}>
                <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--sl-dark-text-secondary)", fontWeight: 700 }}>
                  Quick Start CLI
                </span>
                <div className="sl-font-code" style={{ fontSize: "14px", color: "var(--sl-dark-text-primary)", fontWeight: 600, marginTop: "2px" }}>
                  docker compose up -d
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCopyDocker}
              className="sl-btn-primary"
              style={{ padding: "8px 16px", fontSize: "0.8125rem", flexShrink: 0 }}
            >
              {copiedDocker ? "Copied!" : "Copy Command"}
            </button>
          </div>
        </div>
      </section>

      {/* ===================================================================
          8. PRICING TAXONOMY (STOVO PRICING MODEL V2)
         =================================================================== */}
      <section className="sl-section" id="pricing" style={{ background: "var(--sl-surface)" }}>
        <div className="sl-container">
          <div style={{ textAlign: "center", maxWidth: "720px", margin: "0 auto" }}>
            <span className="sl-pill-eyebrow">Pricing Model v2</span>
            <h2 className="sl-headline-lg" style={{ marginTop: "14px" }}>
              Pricing built around how you use Stovo.
            </h2>
            <p className="sl-body-lg" style={{ marginTop: "12px", color: "var(--sl-text-secondary)" }}>
              Companies scale by people. Communities scale by size. Families scale by storage.
            </p>

            {/* 3-Way Dimensional Tabs */}
            <div className="sl-pricing-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={pricingDimension === "business"}
                className={`sl-pricing-tab ${pricingDimension === "business" ? "sl-pricing-tab-active" : ""}`}
                onClick={() => setPricingDimension("business")}
              >
                <div className="sl-pricing-tab-title">
                  <span className="material-symbols-outlined" style={{ color: "var(--sl-business)", fontSize: "20px" }}>business_center</span>
                  Business
                </div>
                <div className="sl-pricing-tab-sub">by organization size</div>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={pricingDimension === "gaming"}
                className={`sl-pricing-tab ${pricingDimension === "gaming" ? "sl-pricing-tab-active" : ""}`}
                onClick={() => setPricingDimension("gaming")}
              >
                <div className="sl-pricing-tab-title">
                  <span className="material-symbols-outlined" style={{ color: "var(--sl-gaming)", fontSize: "20px" }}>sports_esports</span>
                  Gaming
                </div>
                <div className="sl-pricing-tab-sub">by community size</div>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={pricingDimension === "family"}
                className={`sl-pricing-tab ${pricingDimension === "family" ? "sl-pricing-tab-active" : ""}`}
                onClick={() => setPricingDimension("family")}
              >
                <div className="sl-pricing-tab-title">
                  <span className="material-symbols-outlined" style={{ color: "var(--sl-family)", fontSize: "20px" }}>family_restroom</span>
                  Family
                </div>
                <div className="sl-pricing-tab-sub">by storage (max ~10 members)</div>
              </button>
            </div>
          </div>

          {/* =================================================================
              DIMENSION 1: BUSINESS PRICING (BY SEATS)
             ================================================================= */}
          {pricingDimension === "business" && (
            <div style={{ marginTop: "32px" }}>
              {/* Annual / Monthly Billing Toggle */}
              <div style={{ display: "flex", justifyContent: "center" }}>
                <div className="sl-billing-toggle">
                  <span style={{ color: !annualBilling ? "var(--sl-text-primary)" : "var(--sl-text-tertiary)" }}>
                    Billed Monthly
                  </span>
                  <button
                    type="button"
                    onClick={() => setAnnualBilling(!annualBilling)}
                    style={{
                      width: "44px",
                      height: "24px",
                      borderRadius: "999px",
                      background: annualBilling ? "var(--sl-primary)" : "var(--sl-border-strong)",
                      border: "none",
                      cursor: "pointer",
                      position: "relative",
                      transition: "background 0.2s ease",
                      padding: 0,
                    }}
                    aria-label="Toggle annual or monthly billing"
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: "2px",
                        left: annualBilling ? "22px" : "2px",
                        width: "20px",
                        height: "20px",
                        borderRadius: "50%",
                        background: "#ffffff",
                        transition: "left 0.2s ease",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      }}
                    />
                  </button>
                  <span style={{ color: annualBilling ? "var(--sl-text-primary)" : "var(--sl-text-tertiary)", display: "flex", alignItems: "center", gap: "6px" }}>
                    Billed Annually
                    <span style={{ padding: "2px 6px", borderRadius: "4px", background: "rgba(24, 121, 78, 0.1)", color: "var(--sl-success)", fontSize: "10px", fontWeight: 700 }}>
                      SAVE 20%
                    </span>
                  </span>
                </div>
              </div>

              {/* Business 4 Tiers */}
              <div className="sl-pricing-grid-4">
                {/* Business Starter */}
                <div className="sl-pricing-card">
                  <div>
                    <span className="sl-label-caps" style={{ color: "var(--sl-text-tertiary)", fontSize: "10px" }}>GET STARTED</span>
                    <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)", marginTop: "6px" }}>Business Starter</h3>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "4px", margin: "14px 0 10px 0" }}>
                      <span className="sl-display-lg" style={{ fontSize: "2.25rem", fontWeight: 800 }}>$0</span>
                      <span style={{ fontSize: "12px", color: "var(--sl-text-secondary)" }}>/ Up to 5 users</span>
                    </div>
                    <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", lineHeight: 1.4 }}>
                      Perfect for evaluating Stovo or small founding teams getting started.
                    </p>
                    <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.75rem" }}>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "14px" }}>check</span>
                        <span>Messaging &amp; voice calls</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "14px" }}>check</span>
                        <span>10 GB team storage</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "14px" }}>check</span>
                        <span>Basic role permissions</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "14px" }}>check</span>
                        <span>Standard search &amp; basic AI</span>
                      </li>
                    </ul>
                  </div>
                  <div style={{ marginTop: "28px" }}>
                    <Link to="/setup" className="sl-btn-secondary" style={{ width: "100%", fontSize: "0.8125rem", padding: "10px 16px" }}>
                      Start Free
                    </Link>
                  </div>
                </div>

                {/* Business Team */}
                <div className="sl-pricing-card">
                  <div>
                    <span className="sl-label-caps" style={{ color: "var(--sl-business)", fontSize: "10px" }}>GROWING TEAMS</span>
                    <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)", marginTop: "6px" }}>Business Team</h3>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "4px", margin: "14px 0 10px 0" }}>
                      <span className="sl-display-lg" style={{ fontSize: "2.25rem", fontWeight: 800 }}>
                        {annualBilling ? "$8" : "$10"}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--sl-text-secondary)" }}>/ user / mo</span>
                    </div>
                    <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", lineHeight: 1.4 }}>
                      Complete messaging, voice, storage, and shared Company Brain for organizations.
                    </p>
                    <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.75rem" }}>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-business)", fontSize: "14px" }}>check</span>
                        <span>Unlimited channels &amp; history</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-business)", fontSize: "14px" }}>check</span>
                        <span>100 GB storage per user</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-business)", fontSize: "14px" }}>check</span>
                        <span>Standard AI &amp; Company Brain</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-business)", fontSize: "14px" }}>check</span>
                        <span>Webhooks &amp; MCP connectors</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-business)", fontSize: "14px" }}>check</span>
                        <span>Team admin workspace console</span>
                      </li>
                    </ul>
                  </div>
                  <div style={{ marginTop: "28px" }}>
                    <Link to="/setup" className="sl-btn-secondary" style={{ width: "100%", fontSize: "0.8125rem", padding: "10px 16px" }}>
                      Choose Team
                    </Link>
                  </div>
                </div>

                {/* Business Pro (Featured) */}
                <div className="sl-pricing-card sl-pricing-featured">
                  <div className="sl-featured-pill">RECOMMENDED FOR TEAMS</div>
                  <div>
                    <span className="sl-label-caps" style={{ color: "var(--sl-primary)", fontSize: "10px" }}>COMPREHENSIVE</span>
                    <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)", marginTop: "6px" }}>Business Pro</h3>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "4px", margin: "14px 0 10px 0" }}>
                      <span className="sl-display-lg" style={{ fontSize: "2.25rem", fontWeight: 800, color: "var(--sl-primary)" }}>
                        {annualBilling ? "$15" : "$18"}
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--sl-text-secondary)" }}>/ user / mo</span>
                    </div>
                    <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", lineHeight: 1.4 }}>
                      Advanced knowledge intelligence, compliance retention, audit trails, and priority SLA.
                    </p>
                    <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.75rem" }}>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "14px" }}>check</span>
                        <span>Advanced Company Brain &amp; Grounded RAG</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "14px" }}>check</span>
                        <span>1 TB pooled storage per user</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "14px" }}>check</span>
                        <span>Enterprise SAML/SSO (Okta, Google, OIDC)</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "14px" }}>check</span>
                        <span>Audit logs, legal retention, version lock</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "14px" }}>check</span>
                        <span>Priority 24/7 support response</span>
                      </li>
                    </ul>
                  </div>
                  <div style={{ marginTop: "28px" }}>
                    <Link to="/setup" className="sl-btn-primary" style={{ width: "100%", fontSize: "0.8125rem", padding: "10px 16px" }}>
                      Start Pro Trial
                    </Link>
                  </div>
                </div>

                {/* Business Enterprise */}
                <div className="sl-pricing-card">
                  <div>
                    <span className="sl-label-caps" style={{ color: "var(--sl-text-primary)", fontSize: "10px" }}>DEDICATED SCALE</span>
                    <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)", marginTop: "6px" }}>Enterprise</h3>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "4px", margin: "14px 0 10px 0" }}>
                      <span className="sl-display-lg" style={{ fontSize: "2.25rem", fontWeight: 800 }}>Custom</span>
                    </div>
                    <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", lineHeight: 1.4 }}>
                      Dedicated infrastructure pods, custom compliance DPAs, multi-region failover, and named architects.
                    </p>
                    <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.75rem" }}>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "14px" }}>check</span>
                        <span>Dedicated single-tenant VPC/pod</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "14px" }}>check</span>
                        <span>Custom SLA guarantees &amp; 99.99% uptime</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "14px" }}>check</span>
                        <span>Custom compliance &amp; legal contracts</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "14px" }}>check</span>
                        <span>Dedicated solution architect team</span>
                      </li>
                    </ul>
                  </div>
                  <div style={{ marginTop: "28px" }}>
                    <a href="mailto:enterprise@stovo.internal" className="sl-btn-secondary" style={{ width: "100%", fontSize: "0.8125rem", padding: "10px 16px" }}>
                      Contact Sales
                    </a>
                  </div>
                </div>
              </div>

              {/* Volume Discounts & Self-Hosted Commercial License callout */}
              <div className="sl-addons-card">
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
                  <div>
                    <span className="sl-label-caps" style={{ color: "var(--sl-business)", fontSize: "11px" }}>SEAT VOLUME DISCOUNTS</span>
                    <h4 className="sl-headline-sm" style={{ margin: "4px 0 0 0" }}>Designed to scale with your organization</h4>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", fontSize: "12px", fontFamily: "var(--sl-font-code)" }}>
                    <span style={{ padding: "6px 12px", borderRadius: "8px", background: "var(--sl-surface)", border: "1px solid var(--sl-border)" }}>
                      1–25 seats: $10/mo
                    </span>
                    <span style={{ padding: "6px 12px", borderRadius: "8px", background: "var(--sl-surface)", border: "1px solid var(--sl-border)" }}>
                      26–100 seats: $9/mo
                    </span>
                    <span style={{ padding: "6px 12px", borderRadius: "8px", background: "var(--sl-surface)", border: "1px solid var(--sl-border)" }}>
                      101–500 seats: $8/mo
                    </span>
                    <span style={{ padding: "6px 12px", borderRadius: "8px", background: "rgba(82, 120, 244, 0.1)", border: "1px solid rgba(82, 120, 244, 0.3)", color: "var(--sl-business)", fontWeight: 700 }}>
                      500+ seats: Custom
                    </span>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--sl-border)", paddingTop: "18px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "12px", fontSize: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "20px" }}>terminal</span>
                    <span>
                      <strong>Prefer to self-host on your own servers?</strong> Commercial licenses: <strong>Team: $5/user/mo</strong> • <strong>Pro: $10/user/mo</strong> (Annual subscription, customer provides servers &amp; bandwidth).
                    </span>
                  </div>
                  <a href="#managed-infra" style={{ color: "var(--sl-primary)", fontWeight: 700, textDecoration: "none" }}>
                    Explore Managed on Your Infra →
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              DIMENSION 2: GAMING PRICING (BY COMMUNITY SIZE)
             ================================================================= */}
          {pricingDimension === "gaming" && (
            <div style={{ marginTop: "32px" }}>
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <span style={{ padding: "4px 14px", borderRadius: "999px", background: "rgba(138, 92, 246, 0.08)", color: "var(--sl-gaming)", fontFamily: "var(--sl-font-code)", fontSize: "12px", fontWeight: 700 }}>
                  Metric: Active Community Members (users active within the last 30 days)
                </span>
              </div>

              {/* Gaming 4 Tiers */}
              <div className="sl-pricing-grid-4">
                {/* Gaming Free */}
                <div className="sl-pricing-card">
                  <div>
                    <span className="sl-label-caps" style={{ color: "var(--sl-text-tertiary)", fontSize: "10px" }}>GUILDS &amp; SQUADS</span>
                    <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)", marginTop: "6px" }}>Gaming Free</h3>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "4px", margin: "14px 0 10px 0" }}>
                      <span className="sl-display-lg" style={{ fontSize: "2.25rem", fontWeight: 800 }}>$0</span>
                    </div>
                    <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", lineHeight: 1.4 }}>
                      Up to 100 active members. Ideal for friend circles, raid squads, and Minecraft servers.
                    </p>
                    <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.75rem" }}>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "14px" }}>check</span>
                        <span>Chat channels &amp; custom roles</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "14px" }}>check</span>
                        <span>Basic voice mesh &amp; bots</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "14px" }}>check</span>
                        <span>10 GB community storage</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "14px" }}>check</span>
                        <span>Standard moderation controls</span>
                      </li>
                    </ul>
                  </div>
                  <div style={{ marginTop: "28px" }}>
                    <Link to="/setup" className="sl-btn-secondary" style={{ width: "100%", fontSize: "0.8125rem", padding: "10px 16px" }}>
                      Create Free Server
                    </Link>
                  </div>
                </div>

                {/* Gaming Core */}
                <div className="sl-pricing-card">
                  <div>
                    <span className="sl-label-caps" style={{ color: "var(--sl-gaming)", fontSize: "10px" }}>EXPANDING COMMUNITY</span>
                    <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)", marginTop: "6px" }}>Gaming Core</h3>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "4px", margin: "14px 0 10px 0" }}>
                      <span className="sl-display-lg" style={{ fontSize: "2.25rem", fontWeight: 800 }}>$9.99</span>
                      <span style={{ fontSize: "12px", color: "var(--sl-text-secondary)" }}>/ server / mo</span>
                    </div>
                    <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", lineHeight: 1.4 }}>
                      Up to 500 active members. Enhanced voice channels and higher file upload caps.
                    </p>
                    <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.75rem" }}>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-gaming)", fontSize: "14px" }}>check</span>
                        <span>Enhanced Opus voice quality (64k–128k)</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-gaming)", fontSize: "14px" }}>check</span>
                        <span>50 GB media storage</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-gaming)", fontSize: "14px" }}>check</span>
                        <span>Larger upload limits (100 MB / file)</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-gaming)", fontSize: "14px" }}>check</span>
                        <span>Basic server analytics &amp; audit</span>
                      </li>
                    </ul>
                  </div>
                  <div style={{ marginTop: "28px" }}>
                    <Link to="/setup" className="sl-btn-secondary" style={{ width: "100%", fontSize: "0.8125rem", padding: "10px 16px" }}>
                      Choose Core
                    </Link>
                  </div>
                </div>

                {/* Gaming Pro (Featured) */}
                <div className="sl-pricing-card sl-pricing-featured">
                  <div className="sl-featured-pill">MOST POPULAR COMMUNITY</div>
                  <div>
                    <span className="sl-label-caps" style={{ color: "var(--sl-primary)", fontSize: "10px" }}>HIGH CONCURRENCY</span>
                    <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)", marginTop: "6px" }}>Gaming Pro</h3>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "4px", margin: "14px 0 10px 0" }}>
                      <span className="sl-display-lg" style={{ fontSize: "2.25rem", fontWeight: 800, color: "var(--sl-primary)" }}>$24.99</span>
                      <span style={{ fontSize: "12px", color: "var(--sl-text-secondary)" }}>/ server / mo</span>
                    </div>
                    <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", lineHeight: 1.4 }}>
                      Up to 2,500 active members. Pro studio audio, custom server branding, and advanced bot engines.
                    </p>
                    <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.75rem" }}>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "14px" }}>check</span>
                        <span>High-quality 48kHz studio audio</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "14px" }}>check</span>
                        <span>250 GB community media storage</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "14px" }}>check</span>
                        <span>Advanced moderation automations &amp; bots</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "14px" }}>check</span>
                        <span>Custom server vanity URL &amp; branding</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "14px" }}>check</span>
                        <span>Official Stovo directory listing included</span>
                      </li>
                    </ul>
                  </div>
                  <div style={{ marginTop: "28px" }}>
                    <Link to="/setup" className="sl-btn-primary" style={{ width: "100%", fontSize: "0.8125rem", padding: "10px 16px" }}>
                      Upgrade to Pro
                    </Link>
                  </div>
                </div>

                {/* Gaming Large */}
                <div className="sl-pricing-card">
                  <div>
                    <span className="sl-label-caps" style={{ color: "var(--sl-gaming)", fontSize: "10px" }}>LARGE NETWORK</span>
                    <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)", marginTop: "6px" }}>Gaming Large</h3>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "4px", margin: "14px 0 10px 0" }}>
                      <span className="sl-display-lg" style={{ fontSize: "2.25rem", fontWeight: 800 }}>$59.99</span>
                      <span style={{ fontSize: "12px", color: "var(--sl-text-secondary)" }}>/ server / mo</span>
                    </div>
                    <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", lineHeight: 1.4 }}>
                      Up to 10,000 active members. High concurrent voice pipelines, 1 TB media storage, and priority routing.
                    </p>
                    <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.75rem" }}>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-gaming)", fontSize: "14px" }}>check</span>
                        <span>1 TB media &amp; replay storage</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-gaming)", fontSize: "14px" }}>check</span>
                        <span>Increased concurrent voice channels</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-gaming)", fontSize: "14px" }}>check</span>
                        <span>Multi-region voice relay mesh</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-gaming)", fontSize: "14px" }}>check</span>
                        <span>Priority support response</span>
                      </li>
                    </ul>
                  </div>
                  <div style={{ marginTop: "28px" }}>
                    <Link to="/setup" className="sl-btn-secondary" style={{ width: "100%", fontSize: "0.8125rem", padding: "10px 16px" }}>
                      Choose Large
                    </Link>
                  </div>
                </div>
              </div>

              {/* Public Directory Promotion Box */}
              <div className="sl-addons-card">
                <div>
                  <span className="sl-label-caps" style={{ color: "var(--sl-gaming)", fontSize: "11px" }}>STOVO DISCOVERY &amp; PROMOTION</span>
                  <h4 className="sl-headline-sm" style={{ margin: "4px 0 6px 0" }}>Public Server Directory &amp; Visibility</h4>
                  <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", margin: 0 }}>
                    Directory listing is free for qualifying servers. Monetize discovery through verified credentials and featured community placement.
                  </p>
                </div>

                <div className="sl-addons-grid">
                  <div className="sl-addon-item">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "13px" }}>Directory Listing</div>
                      <div style={{ fontSize: "11px", color: "var(--sl-text-secondary)" }}>Free for qualifying public communities</div>
                    </div>
                    <span style={{ fontWeight: 800, fontSize: "14px", color: "var(--sl-success)" }}>Free</span>
                  </div>

                  <div className="sl-addon-item">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "13px" }}>Verified Server</div>
                      <div style={{ fontSize: "11px", color: "var(--sl-text-secondary)" }}>Badge &amp; category placement</div>
                    </div>
                    <span style={{ fontWeight: 800, fontSize: "14px", color: "var(--sl-gaming)" }}>$7.99/mo</span>
                  </div>

                  <div className="sl-addon-item">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "13px" }}>Featured Server</div>
                      <div style={{ fontSize: "11px", color: "var(--sl-text-secondary)" }}>Ranked in Featured Communities</div>
                    </div>
                    <span style={{ fontWeight: 800, fontSize: "14px", color: "var(--sl-gaming)" }}>$24.99/mo</span>
                  </div>

                  <div className="sl-addon-item">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "13px" }}>Featured Plus</div>
                      <div style={{ fontSize: "11px", color: "var(--sl-text-secondary)" }}>Top discovery spotlight &amp; carousel</div>
                    </div>
                    <span style={{ fontWeight: 800, fontSize: "14px", color: "var(--sl-gaming)" }}>$49.99/mo</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              DIMENSION 3: FAMILY PRICING (BY STORAGE)
             ================================================================= */}
          {pricingDimension === "family" && (
            <div style={{ marginTop: "32px" }}>
              <div style={{ textAlign: "center", marginBottom: "20px" }}>
                <span style={{ padding: "4px 14px", borderRadius: "999px", background: "rgba(229, 106, 137, 0.08)", color: "var(--sl-family)", fontFamily: "var(--sl-font-code)", fontSize: "12px", fontWeight: 700 }}>
                  All paid tiers include up to 10 family members by default (No per-user plan gates)
                </span>
              </div>

              {/* Family 4 Tiers */}
              <div className="sl-pricing-grid-4">
                {/* Family Free */}
                <div className="sl-pricing-card">
                  <div>
                    <span className="sl-label-caps" style={{ color: "var(--sl-text-tertiary)", fontSize: "10px" }}>BASIC HOUSEHOLD</span>
                    <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)", marginTop: "6px" }}>Family Free</h3>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "4px", margin: "14px 0 10px 0" }}>
                      <span className="sl-display-lg" style={{ fontSize: "2.25rem", fontWeight: 800 }}>$0</span>
                      <span style={{ fontSize: "12px", color: "var(--sl-text-secondary)" }}>/ 10 GB</span>
                    </div>
                    <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", lineHeight: 1.4 }}>
                      Up to 5 members. Clean messaging, voice calls, and lightweight photo sharing.
                    </p>
                    <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.75rem" }}>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "14px" }}>check</span>
                        <span>Private family messaging</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "14px" }}>check</span>
                        <span>Voice &amp; video calls</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "14px" }}>check</span>
                        <span>10 GB shared storage</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "14px" }}>check</span>
                        <span>Basic photo sharing</span>
                      </li>
                    </ul>
                  </div>
                  <div style={{ marginTop: "28px" }}>
                    <Link to="/setup" className="sl-btn-secondary" style={{ width: "100%", fontSize: "0.8125rem", padding: "10px 16px" }}>
                      Create Family Space
                    </Link>
                  </div>
                </div>

                {/* Family Plus */}
                <div className="sl-pricing-card">
                  <div>
                    <span className="sl-label-caps" style={{ color: "var(--sl-family)", fontSize: "10px" }}>CONNECTED HOME</span>
                    <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)", marginTop: "6px" }}>Family Plus</h3>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "4px", margin: "14px 0 10px 0" }}>
                      <span className="sl-display-lg" style={{ fontSize: "2.25rem", fontWeight: 800 }}>$7.99</span>
                      <span style={{ fontSize: "12px", color: "var(--sl-text-secondary)" }}>/ mo • 250 GB</span>
                    </div>
                    <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", lineHeight: 1.4 }}>
                      Up to 10 members. Automatic camera uploads, shared albums, and family document vaults.
                    </p>
                    <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.75rem" }}>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-family)", fontSize: "14px" }}>check</span>
                        <span>Automatic photo upload from phones</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-family)", fontSize: "14px" }}>check</span>
                        <span>Shared photo albums &amp; memory stream</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-family)", fontSize: "14px" }}>check</span>
                        <span>Family document &amp; passport vault</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-family)", fontSize: "14px" }}>check</span>
                        <span>30-day file version history</span>
                      </li>
                    </ul>
                  </div>
                  <div style={{ marginTop: "28px" }}>
                    <Link to="/setup" className="sl-btn-secondary" style={{ width: "100%", fontSize: "0.8125rem", padding: "10px 16px" }}>
                      Choose Plus
                    </Link>
                  </div>
                </div>

                {/* Family Pro (Featured) */}
                <div className="sl-pricing-card sl-pricing-featured">
                  <div className="sl-featured-pill">BEST VALUE FOR FAMILIES</div>
                  <div>
                    <span className="sl-label-caps" style={{ color: "var(--sl-primary)", fontSize: "10px" }}>COMPLETE BACKUP</span>
                    <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)", marginTop: "6px" }}>Family Pro</h3>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "4px", margin: "14px 0 10px 0" }}>
                      <span className="sl-display-lg" style={{ fontSize: "2.25rem", fontWeight: 800, color: "var(--sl-primary)" }}>$14.99</span>
                      <span style={{ fontSize: "12px", color: "var(--sl-text-secondary)" }}>/ mo • 1 TB</span>
                    </div>
                    <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", lineHeight: 1.4 }}>
                      Up to 10 members. Full device backups, AI memory search, and 1 Terabyte of verified storage.
                    </p>
                    <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.75rem" }}>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "14px" }}>check</span>
                        <span>Full phone backup (iOS &amp; Android)</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "14px" }}>check</span>
                        <span>1 TB pooled family storage</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "14px" }}>check</span>
                        <span>Family AI search across photos &amp; notes</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "14px" }}>check</span>
                        <span>1-year version history &amp; recovery</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "14px" }}>check</span>
                        <span>Priority restore assistance</span>
                      </li>
                    </ul>
                  </div>
                  <div style={{ marginTop: "28px" }}>
                    <Link to="/setup" className="sl-btn-primary" style={{ width: "100%", fontSize: "0.8125rem", padding: "10px 16px" }}>
                      Get Family Pro
                    </Link>
                  </div>
                </div>

                {/* Family Max */}
                <div className="sl-pricing-card">
                  <div>
                    <span className="sl-label-caps" style={{ color: "var(--sl-family)", fontSize: "10px" }}>HERITAGE ARCHIVE</span>
                    <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)", marginTop: "6px" }}>Family Max</h3>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "4px", margin: "14px 0 10px 0" }}>
                      <span className="sl-display-lg" style={{ fontSize: "2.25rem", fontWeight: 800 }}>$24.99</span>
                      <span style={{ fontSize: "12px", color: "var(--sl-text-secondary)" }}>/ mo • 3 TB</span>
                    </div>
                    <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", lineHeight: 1.4 }}>
                      Up to 10 members. 3 TB archive for multi-device households, raw camera footage, and lifetime memories.
                    </p>
                    <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.75rem" }}>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-family)", fontSize: "14px" }}>check</span>
                        <span>3 TB massive household storage</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-family)", fontSize: "14px" }}>check</span>
                        <span>Unlimited device backup slots</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-family)", fontSize: "14px" }}>check</span>
                        <span>Extended version history</span>
                      </li>
                      <li style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span className="material-symbols-outlined" style={{ color: "var(--sl-family)", fontSize: "14px" }}>check</span>
                        <span>Premium recovery &amp; media handling</span>
                      </li>
                    </ul>
                  </div>
                  <div style={{ marginTop: "28px" }}>
                    <Link to="/setup" className="sl-btn-secondary" style={{ width: "100%", fontSize: "0.8125rem", padding: "10px 16px" }}>
                      Choose Max
                    </Link>
                  </div>
                </div>
              </div>

              {/* Family Add-ons Box */}
              <div className="sl-addons-card">
                <div>
                  <span className="sl-label-caps" style={{ color: "var(--sl-family)", fontSize: "11px" }}>TRANSPARENT ADD-ONS</span>
                  <h4 className="sl-headline-sm" style={{ margin: "4px 0 6px 0" }}>Add extra capacity when your family grows</h4>
                  <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", margin: 0 }}>
                    Monetized strictly around actual compute, storage, and backup costs without charging for tiny features.
                  </p>
                </div>

                <div className="sl-addons-grid">
                  <div className="sl-addon-item">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "13px" }}>+1 Family Member</div>
                      <div style={{ fontSize: "11px", color: "var(--sl-text-secondary)" }}>Up to 20 total members</div>
                    </div>
                    <span style={{ fontWeight: 800, fontSize: "14px", color: "var(--sl-family)" }}>$1.50/mo</span>
                  </div>

                  <div className="sl-addon-item">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "13px" }}>+250 GB Storage</div>
                      <div style={{ fontSize: "11px", color: "var(--sl-text-secondary)" }}>Extra pooled cloud vault</div>
                    </div>
                    <span style={{ fontWeight: 800, fontSize: "14px", color: "var(--sl-family)" }}>$2.99/mo</span>
                  </div>

                  <div className="sl-addon-item">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "13px" }}>+1 TB Storage</div>
                      <div style={{ fontSize: "11px", color: "var(--sl-text-secondary)" }}>Bulk high-capacity drive</div>
                    </div>
                    <span style={{ fontWeight: 800, fontSize: "14px", color: "var(--sl-family)" }}>$7.99/mo</span>
                  </div>

                  <div className="sl-addon-item">
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "13px" }}>Extended History</div>
                      <div style={{ fontSize: "11px", color: "var(--sl-text-secondary)" }}>Permanent version archives</div>
                    </div>
                    <span style={{ fontWeight: 800, fontSize: "14px", color: "var(--sl-family)" }}>$2.99/mo</span>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--sl-border)", paddingTop: "16px", fontSize: "12px", color: "var(--sl-text-secondary)" }}>
                  <strong>Self-Hosting for Family?</strong> Community edition is 100% Free on your own hardware. Or unlock <strong>Family Pro Self-Hosted</strong> ($49–$79/year) for proprietary device backup &amp; photo intelligence modules.
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ===================================================================
          MANAGED ON YOUR INFRASTRUCTURE (THE 3RD DEPLOYMENT PILLAR)
         =================================================================== */}
      <section className="sl-section" id="managed-infra" style={{ background: "var(--sl-surface-subtle)", borderTop: "1px solid var(--sl-border)", borderBottom: "1px solid var(--sl-border)" }}>
        <div className="sl-container">
          <div style={{ textAlign: "center", maxWidth: "720px", margin: "0 auto" }}>
            <span className="sl-pill-eyebrow" style={{ background: "rgba(24, 121, 78, 0.1)", color: "var(--sl-success)" }}>
              The Sovereign Alternative
            </span>
            <h2 className="sl-headline-lg" style={{ marginTop: "14px" }}>
              Managed on Your Infrastructure.
            </h2>
            <p className="sl-body-lg" style={{ marginTop: "12px" }}>
              You own the servers. Your data never leaves your perimeter. Our engineers handle installation, upgrades, and 24/7 reliability.
            </p>
          </div>

          <div className="sl-pricing-grid" style={{ marginTop: "48px" }}>
            {/* Managed Small */}
            <div className="sl-managed-card">
              <div>
                <span className="sl-label-caps" style={{ color: "var(--sl-text-tertiary)", fontSize: "11px" }}>1–25 USERS</span>
                <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)", marginTop: "6px" }}>Managed Small</h3>
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px", margin: "14px 0 10px 0" }}>
                  <span className="sl-display-lg" style={{ fontSize: "2.5rem", fontWeight: 800 }}>$149</span>
                  <span style={{ fontSize: "13px", color: "var(--sl-text-secondary)" }}>/ mo + license</span>
                </div>
                <p style={{ fontSize: "0.875rem", color: "var(--sl-text-secondary)", lineHeight: 1.5 }}>
                  Turnkey operations for startups and private practices on your chosen VPS or bare metal.
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.8125rem" }}>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "16px" }}>check_circle</span>
                    <span>Installation &amp; domain TLS setup</span>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "16px" }}>check_circle</span>
                    <span>Zero-downtime release upgrades</span>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "16px" }}>check_circle</span>
                    <span>Automated local backup configuration</span>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-success)", fontSize: "16px" }}>check_circle</span>
                    <span>Monthly cluster health checks</span>
                  </li>
                </ul>
              </div>
              <div style={{ marginTop: "32px" }}>
                <a href="mailto:managed@stovo.internal" className="sl-btn-secondary" style={{ width: "100%" }}>
                  Deploy Managed Small
                </a>
              </div>
            </div>

            {/* Managed Business */}
            <div className="sl-managed-card" style={{ border: "2px solid var(--sl-primary)", position: "relative" }}>
              <div className="sl-featured-pill">POPULAR FOR ENTERPRISE VPS</div>
              <div>
                <span className="sl-label-caps" style={{ color: "var(--sl-primary)", fontSize: "11px" }}>25–150 USERS</span>
                <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)", marginTop: "6px" }}>Managed Business</h3>
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px", margin: "14px 0 10px 0" }}>
                  <span className="sl-display-lg" style={{ fontSize: "2.5rem", fontWeight: 800, color: "var(--sl-primary)" }}>$399</span>
                  <span style={{ fontSize: "13px", color: "var(--sl-text-secondary)" }}>/ mo + license</span>
                </div>
                <p style={{ fontSize: "0.875rem", color: "var(--sl-text-secondary)", lineHeight: 1.5 }}>
                  Proactive monitoring and engineering management for business clusters and high-trust organizations.
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.8125rem" }}>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "16px" }}>check_circle</span>
                    <span>Proactive 24/7 uptime &amp; latency monitoring</span>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "16px" }}>check_circle</span>
                    <span>Scheduled maintenance &amp; upgrade management</span>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "16px" }}>check_circle</span>
                    <span>Automated disaster recovery verification</span>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-primary)", fontSize: "16px" }}>check_circle</span>
                    <span>Priority incident escalation &amp; resolution</span>
                  </li>
                </ul>
              </div>
              <div style={{ marginTop: "32px" }}>
                <a href="mailto:managed@stovo.internal" className="sl-btn-primary" style={{ width: "100%" }}>
                  Deploy Managed Business
                </a>
              </div>
            </div>

            {/* Managed Enterprise */}
            <div className="sl-managed-card">
              <div>
                <span className="sl-label-caps" style={{ color: "var(--sl-business)", fontSize: "11px" }}>HIGH AVAILABILITY</span>
                <h3 className="sl-headline-md" style={{ color: "var(--sl-text-primary)", marginTop: "6px" }}>Managed Enterprise</h3>
                <div style={{ display: "flex", alignItems: "baseline", gap: "6px", margin: "14px 0 10px 0" }}>
                  <span className="sl-display-lg" style={{ fontSize: "2.5rem", fontWeight: 800 }}>From $999</span>
                  <span style={{ fontSize: "13px", color: "var(--sl-text-secondary)" }}>/ mo + license</span>
                </div>
                <p style={{ fontSize: "0.875rem", color: "var(--sl-text-secondary)", lineHeight: 1.5 }}>
                  Multi-node Kubernetes, bare-metal clusters, strict legal compliance, and dedicated SRE support.
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0 0", display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.8125rem" }}>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-business)", fontSize: "16px" }}>check_circle</span>
                    <span>High-Availability multi-node orchestration</span>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-business)", fontSize: "16px" }}>check_circle</span>
                    <span>Strict air-gap / GovCloud compatibility</span>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-business)", fontSize: "16px" }}>check_circle</span>
                    <span>Dedicated site reliability engineer (SRE)</span>
                  </li>
                  <li style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span className="material-symbols-outlined" style={{ color: "var(--sl-business)", fontSize: "16px" }}>check_circle</span>
                    <span>Guaranteed 1-hour critical response SLA</span>
                  </li>
                </ul>
              </div>
              <div style={{ marginTop: "32px" }}>
                <a href="mailto:enterprise@stovo.internal" className="sl-btn-secondary" style={{ width: "100%" }}>
                  Contact SRE Team
                </a>
              </div>
            </div>
          </div>

          {/* Professional Setup & Migration Services Box */}
          <div className="sl-addons-card" style={{ background: "var(--sl-surface)", marginTop: "40px" }}>
            <div>
              <span className="sl-label-caps" style={{ color: "var(--sl-primary)", fontSize: "11px" }}>PROFESSIONAL SERVICES</span>
              <h4 className="sl-headline-sm" style={{ margin: "4px 0 6px 0" }}>Turnkey Setup &amp; Zero-Downtime Migration</h4>
              <p style={{ fontSize: "0.8125rem", color: "var(--sl-text-secondary)", margin: 0 }}>
                Let Stovo engineers inspect your server infrastructure, configure security headers, and migrate entire communication archives.
              </p>
            </div>

            <div className="sl-addons-grid">
              <div className="sl-addon-item">
                <div>
                  <div style={{ fontWeight: 700, fontSize: "13px" }}>Assisted Installation</div>
                  <div style={{ fontSize: "11px", color: "var(--sl-text-secondary)" }}>Domain, TLS, reverse proxy, storage setup</div>
                </div>
                <span style={{ fontWeight: 800, fontSize: "14px", color: "var(--sl-text-primary)" }}>$299 one-time</span>
              </div>

              <div className="sl-addon-item">
                <div>
                  <div style={{ fontWeight: 700, fontSize: "13px" }}>Platform Migration</div>
                  <div style={{ fontSize: "11px", color: "var(--sl-text-secondary)" }}>From Slack, Discord, Teams, Mattermost</div>
                </div>
                <span style={{ fontWeight: 800, fontSize: "14px", color: "var(--sl-primary)" }}>From $999</span>
              </div>

              <div className="sl-addon-item">
                <div>
                  <div style={{ fontWeight: 700, fontSize: "13px" }}>Enterprise Deployment</div>
                  <div style={{ fontSize: "11px", color: "var(--sl-text-secondary)" }}>Custom multi-region &amp; HA topology</div>
                </div>
                <span style={{ fontWeight: 800, fontSize: "14px", color: "var(--sl-business)" }}>$2,500+</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          9. FAQ ACCORDION
         =================================================================== */}
      <section className="sl-section" id="faq" style={{ background: "var(--sl-surface-subtle)", borderTop: "1px solid var(--sl-border)", borderBottom: "1px solid var(--sl-border)" }}>
        <div className="sl-container">
          <div style={{ textAlign: "center", maxWidth: "680px", margin: "0 auto" }}>
            <span className="sl-pill-eyebrow">Clarifications</span>
            <h2 className="sl-headline-lg" style={{ marginTop: "14px" }}>
              Frequently asked questions.
            </h2>
          </div>

          <div className="sl-faq-wrapper">
            {FAQ_ITEMS.map((item, idx) => (
              <div key={item.question} className="sl-faq-item">
                <button
                  type="button"
                  className="sl-faq-trigger"
                  onClick={() => toggleFaq(idx)}
                  aria-expanded={openFaqIndex === idx}
                >
                  <span>{item.question}</span>
                  <span
                    className="material-symbols-outlined"
                    style={{
                      transform: openFaqIndex === idx ? "rotate(180deg)" : "none",
                      transition: "transform 0.2s ease",
                      color: "var(--sl-text-tertiary)",
                    }}
                  >
                    expand_more
                  </span>
                </button>
                {openFaqIndex === idx && (
                  <div className="sl-faq-content">
                    {item.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===================================================================
          10. FINAL MINIMALIST CTA
         =================================================================== */}
      <section className="sl-section-lg sl-cta-section">
        <div className="sl-container">
          <div style={{ maxWidth: "680px", margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ marginBottom: "24px" }}>
              <VeloLogo size={48} />
            </div>
            <h2 className="sl-display-lg" style={{ margin: 0 }}>
              Build your space with Stovo.
            </h2>
            <p className="sl-body-lg" style={{ marginTop: "16px" }}>
              For your company. For your community. For your family.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", marginTop: "36px", justifyContent: "center" }}>
              <Link to="/setup" className="sl-btn-primary" style={{ padding: "14px 28px", fontSize: "1.0625rem" }}>
                Get Stovo
              </Link>
              <a href="#self-hosted" className="sl-btn-secondary" style={{ padding: "14px 28px", fontSize: "1.0625rem" }}>
                Explore Documentation
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          11. POLISHED ENLARGED FOOTER WITH BRAND BLOCK
         =================================================================== */}
      <footer className="sl-footer">
        <div className="sl-container">
          <div className="sl-footer-grid">
            {/* Left Brand Block */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <VeloLogo size={32} />
                <span style={{ fontFamily: "var(--sl-font-display)", fontWeight: 800, fontSize: "1.5rem", color: "var(--sl-text-primary)", letterSpacing: "-0.03em" }}>
                  Stovo
                </span>
              </div>
              <p style={{ fontWeight: 700, fontSize: "14px", color: "var(--sl-text-primary)", margin: 0 }}>
                Your conversations. Your files. Your infrastructure.
              </p>
              <p style={{ fontSize: "13px", color: "var(--sl-text-secondary)", margin: 0, maxWidth: "380px", lineHeight: 1.6 }}>
                Private communication, storage and AI platform. Built for teams that demand absolute sovereignty and beautiful design.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--sl-success)" }} />
                <span style={{ fontFamily: "var(--sl-font-code)", fontSize: "12px", color: "var(--sl-text-tertiary)" }}>
                  All systems operational
                </span>
              </div>
            </div>

            {/* 4 Link Columns */}
            <div className="sl-footer-links-grid">
              <div className="sl-footer-col">
                <span className="sl-label-caps" style={{ color: "var(--sl-text-primary)", fontSize: "11px" }}>Product</span>
                <a href="#deployments" className="sl-footer-link">Cloud Deployment</a>
                <a href="#self-hosted" className="sl-footer-link">Self-Hosted Engine</a>
                <a href="#capabilities" className="sl-footer-link">Messaging &amp; Voice</a>
                <a href="#storage" className="sl-footer-link">Files &amp; Vaults</a>
                <a href="#ai" className="sl-footer-link">Private AI Runtime</a>
                <Link to="/login" className="sl-footer-link">Web App</Link>
              </div>

              <div className="sl-footer-col">
                <span className="sl-label-caps" style={{ color: "var(--sl-text-primary)", fontSize: "11px" }}>Solutions</span>
                <a href="#audience-business" className="sl-footer-link">Business &amp; Enterprise</a>
                <a href="#audience-gaming" className="sl-footer-link">Gaming &amp; Guilds</a>
                <a href="#audience-family" className="sl-footer-link">Families &amp; Collectives</a>
                <a href="#pricing" className="sl-footer-link">Community Tier</a>
              </div>

              <div className="sl-footer-col">
                <span className="sl-label-caps" style={{ color: "var(--sl-text-primary)", fontSize: "11px" }}>Resources</span>
                <a href="#infrastructure" className="sl-footer-link">Documentation</a>
                <a href="#infrastructure" className="sl-footer-link">Docker &amp; Helm Charts</a>
                <a href="#infrastructure" className="sl-footer-link">Security Architecture</a>
                <a href="#faq" className="sl-footer-link">FAQ</a>
              </div>

              <div className="sl-footer-col">
                <span className="sl-label-caps" style={{ color: "var(--sl-text-primary)", fontSize: "11px" }}>Company &amp; Legal</span>
                <Link to="/landing" className="sl-footer-link">About Stovo</Link>
                <a href="#infrastructure" className="sl-footer-link">Privacy Policy</a>
                <a href="#infrastructure" className="sl-footer-link">Terms of Service</a>
                <a href="#infrastructure" className="sl-footer-link">DPA &amp; Compliance</a>
              </div>
            </div>
          </div>

          <div className="sl-footer-bottom">
            <div>
              © 2026 Stovo Inc. Source-available Self-Hosted software. Your conversations. Your files. Your infrastructure.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "20px", fontFamily: "var(--sl-font-code)", fontSize: "12px", color: "var(--sl-text-tertiary)" }}>
              <span>v2.4-stable</span>
              <span>MLS RFC 9420</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
