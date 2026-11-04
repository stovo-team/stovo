import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { getClusterPath } from "../api/client";
import {
  intelligenceBrowserSessionEndpoint,
  intelligenceConsentQuery,
  intelligenceOIDCAuthorizeURL,
  intelligenceSourceAuthorizeEndpoint,
  intelligenceSourceOfferEndpoint,
  type IntelligenceBrowserFlow,
  type IntelligenceConsentOffer,
  type IntelligenceConsentParameters,
  type IntelligenceGrant,
  type IntelligenceGrants,
} from "../api/intelligence";
import type { AppStrings } from "../config/strings";

const grantKeys: IntelligenceGrant[] = ["read", "process", "external_transfer", "export"];

interface IntelligenceConsentPageProps {
  strings: AppStrings;
}

interface ParsedConsentRequest {
  flow: IntelligenceBrowserFlow;
  parameters: IntelligenceConsentParameters;
}

function parseConsentRequest(search: string): ParsedConsentRequest | null {
  const query = new URLSearchParams(search);
  const flow = query.get("flow");
  if (flow !== "oidc" && flow !== "source_v2") return null;
  const expected = flow === "oidc"
    ? ["flow", "response_type", "client_id", "redirect_uri", "state", "nonce", "code_challenge", "code_challenge_method"]
    : ["flow", "response_type", "client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method"];
  if (query.size !== expected.length || expected.some((key) => query.getAll(key).length !== 1) || Array.from(query.keys()).some((key) => !expected.includes(key))) return null;
  const responseType = query.get("response_type");
  const challengeMethod = query.get("code_challenge_method");
  const clientID = query.get("client_id") ?? "";
  const redirectURI = query.get("redirect_uri") ?? "";
  const state = query.get("state") ?? "";
  const challenge = query.get("code_challenge") ?? "";
  const nonce = query.get("nonce") ?? undefined;
  if (responseType !== "code" || !clientID || !redirectURI || !state || !challenge || challengeMethod !== "S256" || (flow === "oidc" && !nonce)) return null;
  let callback: URL;
  try {
    callback = new URL(redirectURI);
  } catch {
    return null;
  }
  if (callback.protocol !== "https:" || callback.username || callback.password || callback.hash) return null;
  return {
    flow,
    parameters: {
      response_type: "code", client_id: clientID, redirect_uri: redirectURI,
      state, code_challenge: challenge, code_challenge_method: "S256", ...(nonce ? { nonce } : {}),
    },
  };
}

export function IntelligenceConsentPage({ strings }: IntelligenceConsentPageProps) {
  const { currentUser, authRequest } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const parsed = useMemo(() => parseConsentRequest(location.search), [location.search]);
  const [offer, setOffer] = useState<IntelligenceConsentOffer | null>(null);
  const [chatID, setChatID] = useState("");
  const [grants, setGrants] = useState<IntelligenceGrants>({ read: false, process: false, external_transfer: false, export: false });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!parsed || parsed.flow !== "source_v2" || !currentUser) return;
    let active = true;
    authRequest<IntelligenceConsentOffer>(intelligenceSourceOfferEndpoint(parsed.parameters), { method: "GET" })
      .then((result) => {
        if (!active) return;
        if (result.client_id !== parsed.parameters.client_id || result.redirect_uri !== parsed.parameters.redirect_uri || result.state !== parsed.parameters.state || !result.chats.length || !grantKeys.every((key) => result.grants?.[key] === false)) {
          throw new Error("invalid consent offer");
        }
        setOffer(result);
      })
      .catch(() => {
        if (active) setError(strings.intelligence.consentUnavailable);
      });
    return () => { active = false; };
  }, [authRequest, currentUser, parsed, strings.intelligence.consentUnavailable]);

  if (!currentUser) {
    return <Navigate to={getClusterPath("/login")} state={{ from: location }} replace />;
  }

  if (!parsed) {
    return <main className="app-shell"><section className="auth-panel"><h1>{strings.intelligence.consentTitle}</h1><p className="error-text" role="alert">{strings.intelligence.invalidConsentRequest}</p></section></main>;
  }
  const consent = parsed;

  async function createBrowserSession(body: Record<string, unknown>) {
    await authRequest<{ expires_in: number }>(intelligenceBrowserSessionEndpoint(), { method: "POST", body });
  }

  async function continueOIDC() {
    setError(null);
    setIsSubmitting(true);
    try {
      await createBrowserSession({ flow: "oidc", ...consent.parameters });
      window.location.assign(intelligenceOIDCAuthorizeURL(consent.parameters));
    } catch {
      setError(strings.intelligence.consentUnavailable);
      setIsSubmitting(false);
    }
  }

  async function handleSourceAuthorize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!offer || !chatID || !offer.chats.some((chat) => chat.id === chatID)) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await createBrowserSession({
        flow: "source_v2",
        ...consent.parameters,
        chat_id: chatID,
        grants,
      });
      formRef.current?.submit();
    } catch {
      setError(strings.intelligence.consentUnavailable);
      setIsSubmitting(false);
    }
  }

  if (parsed.flow === "oidc") {
    return <main className="app-shell"><section className="auth-panel intelligence-identity-panel">
      <h1>{strings.intelligence.identityTitle}</h1>
      <p className="intelligence-identity-description">{strings.intelligence.identityDescription}</p>
      <dl className="intelligence-identity-details">
        <div>
          <dt>{strings.intelligence.consentClient}</dt>
          <dd><code>{parsed.parameters.client_id}</code></dd>
        </div>
        <div>
          <dt>{strings.intelligence.consentCallback}</dt>
          <dd><code>{parsed.parameters.redirect_uri}</code></dd>
        </div>
      </dl>
      {error && <p role="alert" className="error-text">{error}</p>}
      <div className="intelligence-identity-actions">
        <button className="intelligence-identity-cancel" type="button" onClick={() => navigate("/")}>{strings.intelligence.cancelConsent}</button>
        <button className="intelligence-identity-continue" type="button" disabled={isSubmitting} onClick={() => void continueOIDC()}>{isSubmitting ? strings.intelligence.continuing : strings.intelligence.continueToIntelligence}</button>
      </div>
    </section></main>;
  }

  return <main className="app-shell"><section className="auth-panel intelligence-consent-panel">
    <h1>{strings.intelligence.consentTitle}</h1>
    {error && <p role="alert" className="error-text">{error}</p>}
    {!offer && !error && <p>{strings.intelligence.loadingConsent}</p>}
    {offer && <>
      <p>{strings.intelligence.consentClient}: <strong>{offer.client_id}</strong></p>
      <p className="intelligence-consent-callback">{strings.intelligence.consentCallback}: <code>{offer.redirect_uri}</code></p>
      <form ref={formRef} method="post" action={intelligenceSourceAuthorizeEndpoint()} onSubmit={(event) => void handleSourceAuthorize(event)}>
        <fieldset disabled={isSubmitting}>
          <legend>{strings.intelligence.chooseOneChat}</legend>
          {offer.chats.map((chat) => <label className="privacy-row" key={chat.id}>
            <input type="radio" name="chat_id" value={chat.id} checked={chatID === chat.id} onChange={() => setChatID(chat.id)} />
            <span>{chat.title || chat.id}</span>
          </label>)}
        </fieldset>
        <fieldset disabled={isSubmitting}>
          <legend>{strings.intelligence.chooseGrants}</legend>
          {grantKeys.map((grant) => <label className="privacy-row" key={grant}>
            <input type="checkbox" checked={grants[grant]} onChange={(event) => setGrants((current) => ({ ...current, [grant]: event.target.checked }))} />
            <span>{strings.intelligence.grants[grant]}</span>
          </label>)}
        </fieldset>
        {parsed.parameters.response_type && <input type="hidden" name="response_type" value={parsed.parameters.response_type} />}
        <input type="hidden" name="client_id" value={parsed.parameters.client_id} />
        <input type="hidden" name="redirect_uri" value={parsed.parameters.redirect_uri} />
        <input type="hidden" name="state" value={parsed.parameters.state} />
        <input type="hidden" name="code_challenge" value={parsed.parameters.code_challenge} />
        <input type="hidden" name="code_challenge_method" value={parsed.parameters.code_challenge_method} />
        {grantKeys.map((grant) => <input key={grant} type="hidden" name={grant} value={grants[grant] ? "true" : "false"} />)}
        <button type="submit" disabled={isSubmitting || !chatID}>{isSubmitting ? strings.intelligence.continuing : strings.intelligence.approveConsent}</button>
      </form>
    </>}
  </section></main>;
}
