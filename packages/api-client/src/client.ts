import type {
  AcceptedInvitation,
  ApiError,
  ApiResponse,
  AuthSession,
  BusinessType,
  CreateInvitationInput,
  CreateWorkspaceInput,
  CreatedInvitation,
  HomeSummary,
  InvitationPreview,
  Me,
  OtpRequestInput,
  OtpRequestResult,
  OtpVerifyInput,
  Team,
  UpdateMeInput,
  UpdateMemberInput,
  UpdateWorkspaceInput,
  User,
  Workspace,
} from "@wedding-yantra/types";

/** Thrown for every failed call. `fields` holds per-field messages for forms. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = error.code;
    this.fields = error.fields ?? {};
  }
}

export interface ApiClientOptions {
  /** e.g. `https://api.weddingyantra.com` (no trailing slash needed) */
  baseUrl: string;
  /** Returns the saved session token, or null when signed out. */
  getToken: () => string | null | Promise<string | null>;
  /** Called when the server says the token is no longer valid. */
  onUnauthorized?: () => void;
  /** Override for tests or unusual runtimes. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

export function createApiClient(options: ApiClientOptions) {
  const base = options.baseUrl.replace(/\/$/, "");
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const token = await options.getToken();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await doFetch(`${base}/api/v1${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiRequestError(0, {
        code: "NETWORK_ERROR",
        message: "Can't reach Wedding Yantra. Check your internet and try again.",
      });
    }

    const payload = (await res.json().catch(() => null)) as ApiResponse<T> | null;
    if (!payload) {
      throw new ApiRequestError(res.status, { code: "BAD_RESPONSE", message: `Unexpected response (${res.status})` });
    }
    if (!payload.success) {
      if (res.status === 401 && token) options.onUnauthorized?.();
      throw new ApiRequestError(res.status, payload.error);
    }
    return payload.data;
  }

  const ws = (id: string) => `/workspaces/${encodeURIComponent(id)}`;

  return {
    auth: {
      requestOtp: (input: OtpRequestInput) => request<OtpRequestResult>("POST", "/auth/otp/request", input),
      verifyOtp: (input: OtpVerifyInput) => request<AuthSession>("POST", "/auth/otp/verify", input),
      me: () => request<Me>("GET", "/auth/me"),
      updateMe: (input: UpdateMeInput) => request<User>("PATCH", "/auth/me", input),
      logout: () => request<{ loggedOut: true }>("POST", "/auth/logout"),
    },
    businessTypes: {
      list: () => request<BusinessType[]>("GET", "/business-types"),
    },
    workspaces: {
      create: (input: CreateWorkspaceInput) => request<Workspace>("POST", "/workspaces", input),
      get: (id: string) => request<Workspace>("GET", ws(id)),
      update: (id: string, input: UpdateWorkspaceInput) => request<Workspace>("PATCH", ws(id), input),
      home: (id: string) => request<HomeSummary>("GET", `${ws(id)}/home`),
    },
    team: {
      get: (workspaceId: string) => request<Team>("GET", `${ws(workspaceId)}/team`),
      invite: (workspaceId: string, input: CreateInvitationInput) =>
        request<CreatedInvitation>("POST", `${ws(workspaceId)}/invitations`, input),
      revokeInvitation: (workspaceId: string, invitationId: string) =>
        request<{ revoked: true }>("DELETE", `${ws(workspaceId)}/invitations/${encodeURIComponent(invitationId)}`),
      updateMember: (workspaceId: string, memberId: string, input: UpdateMemberInput) =>
        request<{ updated: true }>("PATCH", `${ws(workspaceId)}/members/${encodeURIComponent(memberId)}`, input),
      removeMember: (workspaceId: string, memberId: string) =>
        request<{ removed: true }>("DELETE", `${ws(workspaceId)}/members/${encodeURIComponent(memberId)}`),
    },
    invitations: {
      preview: (token: string) => request<InvitationPreview>("GET", `/invitations/${encodeURIComponent(token)}`),
      accept: (token: string) =>
        request<AcceptedInvitation>("POST", `/invitations/${encodeURIComponent(token)}/accept`),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
