import { useCallback, useEffect, useState } from "react";

import {
  loadIntelligenceConnections,
  revokeIntelligenceConnection,
  type IntelligenceAuthRequest,
  type IntelligenceConnection,
  type IntelligenceGrant,
} from "../../api/intelligence";
import type { AppStrings } from "../../config/strings";

interface IntelligenceConnectionsSettingsProps {
  strings: AppStrings;
  authRequest: IntelligenceAuthRequest;
}

const grantKeys: IntelligenceGrant[] = ["read", "process", "external_transfer", "export", "codex", "reply"];

export function IntelligenceConnectionsSettings({ strings, authRequest }: IntelligenceConnectionsSettingsProps) {
  const [connections, setConnections] = useState<IntelligenceConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const result = await loadIntelligenceConnections(authRequest);
      setConnections(result.connections);
    } catch {
      setError(strings.intelligence.connectionsUnavailable);
    } finally {
      setIsLoading(false);
    }
  }, [authRequest, strings.intelligence.connectionsUnavailable]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function revoke(connectionID: string, grant: IntelligenceGrant | "connection") {
    const key = `${connectionID}:${grant}`;
    setRevoking(key);
    setError(null);
    try {
      await revokeIntelligenceConnection(authRequest, connectionID, grant);
      await refresh();
    } catch {
      setError(strings.intelligence.revokeFailed);
    } finally {
      setRevoking(null);
    }
  }

  return <section className="settings-toggle-groups" aria-labelledby="intelligence-connections-title">
    <h3 id="intelligence-connections-title">{strings.intelligence.connectionsTitle}</h3>
    <p className="muted-copy">{strings.intelligence.connectionsDescription}</p>
    {error && <p className="error-text" role="alert">{error}</p>}
    {isLoading ? <p>{strings.intelligence.loadingConnections}</p> : connections.length === 0 ? <p>{strings.intelligence.noConnections}</p> : connections.map((connection) => {
      const revoked = connection.revoked_at !== null;
      return <article className="settings-row intelligence-connection" key={connection.id}>
        <div className="intelligence-connection__details">
          <strong>{connection.chat_title || connection.chat_id}</strong>
          <small>{strings.intelligence.connectionCreated}: {new Date(connection.created_at).toLocaleDateString()}</small>
          <small>{strings.intelligence.connectionExpires}: {new Date(connection.expires_at).toLocaleDateString()}</small>
          {revoked && <small>{strings.intelligence.connectionRevoked}</small>}
        </div>
        <div className="intelligence-connection__grants">
          {grantKeys.filter((grant) => connection.grants[grant]).map((grant) => <button
            type="button"
            className="blocked-member-action"
            data-revoke-grant={grant}
            key={grant}
            disabled={revoked || revoking !== null}
            onClick={() => void revoke(connection.id, grant)}
          >{revoking === `${connection.id}:${grant}` ? strings.intelligence.revoking : strings.intelligence.revokeGrant.replace("{grant}", strings.intelligence.grants[grant])}</button>)}
        </div>
        <button
          type="button"
          className="blocked-member-action"
          data-revoke-grant="connection"
          disabled={revoked || revoking !== null}
          onClick={() => void revoke(connection.id, "connection")}
        >{revoking === `${connection.id}:connection` ? strings.intelligence.revoking : strings.intelligence.revokeConnection}</button>
      </article>;
    })}
  </section>;
}
