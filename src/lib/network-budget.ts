const nativeFetch = globalThis.fetch.bind(globalThis);

const GRAPH_HOPPER_HOST = "graphhopper.com";
const ORS_HOST = "api.openrouteservice.org";

export function getExternalFetchTimeoutMs(url: string): number | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith(GRAPH_HOPPER_HOST)) {
      return parsed.pathname.includes("/geocode") ? 6_000 : 12_000;
    }
    if (parsed.hostname === ORS_HOST) return 12_000;
    return null;
  } catch {
    return null;
  }
}

export function tuneGraphHopperRequestBody(url: string, body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (typeof body !== "string") return body;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return body;
  }
  if (!parsedUrl.hostname.endsWith(GRAPH_HOPPER_HOST) || !parsedUrl.pathname.includes("/route")) {
    return body;
  }

  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    if (json.algorithm !== "alternative_route") return body;
    const current = Number(json["alternative_route.max_paths"] ?? 1);
    if (Number.isFinite(current) && current > 2) {
      json["alternative_route.max_paths"] = 2;
    }
    return JSON.stringify(json);
  } catch {
    return body;
  }
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function withTimeoutSignal(existing: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort(existing?.reason);
  if (existing) {
    if (existing.aborted) controller.abort(existing.reason);
    else existing.addEventListener("abort", onAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException(`External request exceeded ${timeoutMs}ms`, "TimeoutError"));
  }, timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      existing?.removeEventListener("abort", onAbort);
    },
    timedOut: () => timedOut,
  };
}

// Installed once, before TanStack's server entry is imported. This prevents a
// slow routing provider from holding the whole analysis screen for minutes.
if (!(globalThis as typeof globalThis & { __yourWayNetworkBudgetInstalled?: boolean }).__yourWayNetworkBudgetInstalled) {
  (globalThis as typeof globalThis & { __yourWayNetworkBudgetInstalled?: boolean }).__yourWayNetworkBudgetInstalled = true;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    const timeoutMs = getExternalFetchTimeoutMs(url);
    if (!timeoutMs) return nativeFetch(input, init);

    const existingSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const timeout = withTimeoutSignal(existingSignal, timeoutMs);
    const body = tuneGraphHopperRequestBody(url, init?.body);

    try {
      return await nativeFetch(input, { ...init, body, signal: timeout.signal });
    } finally {
      timeout.cleanup();
    }
  };
}
