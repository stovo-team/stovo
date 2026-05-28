import { getApiUrl } from "./client";

export type ServiceStatus = "loading" | "ok" | "error";

export interface HealthResult {
  name: string;
  endpoint: string;
  status: ServiceStatus;
  detail: string;
}

interface HealthPayload {
  status: string;
  service: string;
  environment?: string;
  version?: string;
}

async function fetchHealth(endpoint: string, name: string): Promise<HealthResult> {
  const url = `${getApiUrl()}${endpoint}`;

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return {
        name,
        endpoint,
        status: "error",
        detail: `${response.status} ${response.statusText}`
      };
    }

    const payload = (await response.json()) as HealthPayload;
    const extra = [payload.environment, payload.version].filter(Boolean).join(" / ");

    return {
      name,
      endpoint,
      status: payload.status === "ok" ? "ok" : "error",
      detail: extra || payload.service
    };
  } catch (error) {
    return {
      name,
      endpoint,
      status: "error",
      detail: error instanceof Error ? error.message : "Request failed"
    };
  }
}

export async function fetchFoundationHealth(): Promise<HealthResult[]> {
  return Promise.all([
    fetchHealth("/api/health", "Backend API"),
    fetchHealth("/api/health/db", "PostgreSQL"),
    fetchHealth("/api/health/redis", "Redis")
  ]);
}

export { getApiUrl };
