import type {
  ActivityPage,
  ActivityQuery,
  DailySummary,
  TeamScores,
  ChecklistItem,
  MyDay,
  SaveChecklistInput,
  SaveEventTeamInput,
  TaskInput,
  TaskItem,
  TaskListQuery,
  TeamMember,
  UpdateTaskInput,
  ExportFile,
  ExportKind,
  MonthReport,
  Expense,
  ExpenseInput,
  ExpenseListQuery,
  ExpenseMonth,
  ReviewExpenseInput,
  UpdateExpenseInput,
  UploadedFile,
  UploadFileInput,
  Bill,
  BillDraft,
  BillInput,
  BillSummary,
  EventMoney,
  MoneyOverview,
  Payment,
  PaymentInput,
  PublicBill,
  UpdateBillInput,
  UpdatePaymentInput,
  CalendarEntry,
  CatalogueItem,
  CatalogueItemInput,
  EventClash,
  EventInput,
  EventListQuery,
  EventSummary,
  PublicQuote,
  Quote,
  QuoteInput,
  QuoteStatus,
  QuoteSummary,
  UpdateCatalogueItemInput,
  UpdateEventInput,
  UpdateQuoteInput,
  WeddingEvent,
  AcceptedInvitation,
  AddActivityInput,
  Client,
  ClientInput,
  ClientSummary,
  CreateLeadInput,
  Lead,
  LeadFormSettings,
  LeadList,
  LeadListQuery,
  PipelineStage,
  PublicLeadForm,
  SaveStagesInput,
  SubmitLeadFormInput,
  TemplateInput,
  UpdateClientInput,
  UpdateLeadInput,
  WhatsAppTemplate,
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

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

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
  const qs = (params: Record<string, string | undefined>) => {
    const entries = Object.entries(params).filter((e): e is [string, string] => !!e[1]);
    return entries.length ? `?${new URLSearchParams(entries).toString()}` : "";
  };

  return {
    /** Full link for a file path the API returned (bill photos). Works in <img src>. */
    fileUrl: (path: string) => `${base}${path}`,
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
    leads: {
      list: (workspaceId: string, query: LeadListQuery = {}) =>
        request<LeadList>("GET", `${ws(workspaceId)}/leads${qs(query)}`),
      get: (workspaceId: string, id: string) => request<Lead>("GET", `${ws(workspaceId)}/leads/${encodeURIComponent(id)}`),
      create: (workspaceId: string, input: CreateLeadInput) => request<Lead>("POST", `${ws(workspaceId)}/leads`, input),
      update: (workspaceId: string, id: string, input: UpdateLeadInput) =>
        request<Lead>("PATCH", `${ws(workspaceId)}/leads/${encodeURIComponent(id)}`, input),
      remove: (workspaceId: string, id: string) =>
        request<{ deleted: true }>("DELETE", `${ws(workspaceId)}/leads/${encodeURIComponent(id)}`),
      addActivity: (workspaceId: string, id: string, input: AddActivityInput) =>
        request<Lead>("POST", `${ws(workspaceId)}/leads/${encodeURIComponent(id)}/activities`, input),
      saveStages: (workspaceId: string, input: SaveStagesInput) =>
        request<PipelineStage[]>("PUT", `${ws(workspaceId)}/pipeline-stages`, input),
    },
    clients: {
      list: (workspaceId: string, q?: string) => request<ClientSummary[]>("GET", `${ws(workspaceId)}/clients${qs({ q })}`),
      get: (workspaceId: string, id: string) => request<Client>("GET", `${ws(workspaceId)}/clients/${encodeURIComponent(id)}`),
      create: (workspaceId: string, input: ClientInput) => request<Client>("POST", `${ws(workspaceId)}/clients`, input),
      update: (workspaceId: string, id: string, input: UpdateClientInput) =>
        request<Client>("PATCH", `${ws(workspaceId)}/clients/${encodeURIComponent(id)}`, input),
    },
    templates: {
      list: (workspaceId: string) => request<WhatsAppTemplate[]>("GET", `${ws(workspaceId)}/whatsapp-templates`),
      create: (workspaceId: string, input: TemplateInput) =>
        request<WhatsAppTemplate>("POST", `${ws(workspaceId)}/whatsapp-templates`, input),
      update: (workspaceId: string, id: string, input: Partial<TemplateInput>) =>
        request<WhatsAppTemplate>("PATCH", `${ws(workspaceId)}/whatsapp-templates/${encodeURIComponent(id)}`, input),
      remove: (workspaceId: string, id: string) =>
        request<{ deleted: true }>("DELETE", `${ws(workspaceId)}/whatsapp-templates/${encodeURIComponent(id)}`),
    },
    leadForm: {
      get: (workspaceId: string) => request<LeadFormSettings>("GET", `${ws(workspaceId)}/lead-form`),
      setEnabled: (workspaceId: string, enabled: boolean) =>
        request<LeadFormSettings>("PATCH", `${ws(workspaceId)}/lead-form`, { enabled }),
      publicGet: (slug: string) => request<PublicLeadForm>("GET", `/public/forms/${encodeURIComponent(slug)}`),
      submit: (slug: string, input: SubmitLeadFormInput) =>
        request<{ received: true }>("POST", `/public/forms/${encodeURIComponent(slug)}`, input),
    },
    catalogue: {
      list: (workspaceId: string, all = false) =>
        request<CatalogueItem[]>("GET", `${ws(workspaceId)}/catalogue${all ? "?all=true" : ""}`),
      create: (workspaceId: string, input: CatalogueItemInput) =>
        request<CatalogueItem>("POST", `${ws(workspaceId)}/catalogue`, input),
      update: (workspaceId: string, id: string, input: UpdateCatalogueItemInput) =>
        request<CatalogueItem>("PATCH", `${ws(workspaceId)}/catalogue/${encodeURIComponent(id)}`, input),
    },
    quotes: {
      list: (workspaceId: string, query: { leadId?: string; clientId?: string; status?: QuoteStatus } = {}) =>
        request<QuoteSummary[]>("GET", `${ws(workspaceId)}/quotes${qs(query)}`),
      get: (workspaceId: string, id: string) => request<Quote>("GET", `${ws(workspaceId)}/quotes/${encodeURIComponent(id)}`),
      create: (workspaceId: string, input: QuoteInput) => request<Quote>("POST", `${ws(workspaceId)}/quotes`, input),
      update: (workspaceId: string, id: string, input: UpdateQuoteInput) =>
        request<Quote>("PATCH", `${ws(workspaceId)}/quotes/${encodeURIComponent(id)}`, input),
      remove: (workspaceId: string, id: string) =>
        request<{ deleted: true }>("DELETE", `${ws(workspaceId)}/quotes/${encodeURIComponent(id)}`),
      send: (workspaceId: string, id: string) => request<Quote>("POST", `${ws(workspaceId)}/quotes/${encodeURIComponent(id)}/send`),
      accept: (workspaceId: string, id: string) =>
        request<Quote>("POST", `${ws(workspaceId)}/quotes/${encodeURIComponent(id)}/accept`),
      decline: (workspaceId: string, id: string, reason?: string) =>
        request<Quote>("POST", `${ws(workspaceId)}/quotes/${encodeURIComponent(id)}/decline`, { reason }),
      publicGet: (token: string) => request<PublicQuote>("GET", `/public/quotes/${encodeURIComponent(token)}`),
      publicAccept: (token: string, name: string) =>
        request<PublicQuote>("POST", `/public/quotes/${encodeURIComponent(token)}/accept`, { name }),
      publicDecline: (token: string, reason?: string) =>
        request<PublicQuote>("POST", `/public/quotes/${encodeURIComponent(token)}/decline`, { reason }),
    },
    events: {
      list: (workspaceId: string, query: EventListQuery = {}) =>
        request<EventSummary[]>("GET", `${ws(workspaceId)}/events${qs(query)}`),
      get: (workspaceId: string, id: string) => request<WeddingEvent>("GET", `${ws(workspaceId)}/events/${encodeURIComponent(id)}`),
      create: (workspaceId: string, input: EventInput) => request<WeddingEvent>("POST", `${ws(workspaceId)}/events`, input),
      update: (workspaceId: string, id: string, input: UpdateEventInput) =>
        request<WeddingEvent>("PATCH", `${ws(workspaceId)}/events/${encodeURIComponent(id)}`, input),
      remove: (workspaceId: string, id: string) =>
        request<{ deleted: true }>("DELETE", `${ws(workspaceId)}/events/${encodeURIComponent(id)}`),
      clashes: (workspaceId: string, dates: string[], excludeEventId?: string) =>
        request<EventClash[]>("GET", `${ws(workspaceId)}/event-clashes${qs({ dates: dates.join(","), excludeEventId })}`),
      calendar: (workspaceId: string, month: string) =>
        request<CalendarEntry[]>("GET", `${ws(workspaceId)}/calendar${qs({ month })}`),
    },
    money: {
      overview: (workspaceId: string) => request<MoneyOverview>("GET", `${ws(workspaceId)}/money`),
      forEvent: (workspaceId: string, eventId: string) =>
        request<EventMoney>("GET", `${ws(workspaceId)}/events/${encodeURIComponent(eventId)}/money`),
    },
    bills: {
      list: (workspaceId: string, query: { clientId?: string; eventId?: string; status?: "open" | "paid" | "cancelled" } = {}) =>
        request<BillSummary[]>("GET", `${ws(workspaceId)}/bills${qs(query)}`),
      /** Starting values for a new bill, from an event, an accepted quote or a client */
      draft: (workspaceId: string, query: { eventId?: string; clientId?: string; quoteId?: string }) =>
        request<BillDraft>("GET", `${ws(workspaceId)}/bill-draft${qs(query)}`),
      get: (workspaceId: string, id: string) => request<Bill>("GET", `${ws(workspaceId)}/bills/${encodeURIComponent(id)}`),
      create: (workspaceId: string, input: BillInput) => request<Bill>("POST", `${ws(workspaceId)}/bills`, input),
      update: (workspaceId: string, id: string, input: UpdateBillInput) =>
        request<Bill>("PATCH", `${ws(workspaceId)}/bills/${encodeURIComponent(id)}`, input),
      cancel: (workspaceId: string, id: string, reason?: string) =>
        request<Bill>("POST", `${ws(workspaceId)}/bills/${encodeURIComponent(id)}/cancel`, { reason }),
      publicGet: (token: string) => request<PublicBill>("GET", `/public/bills/${encodeURIComponent(token)}`),
    },
    payments: {
      list: (workspaceId: string, query: { billId?: string; eventId?: string; clientId?: string; month?: string } = {}) =>
        request<Payment[]>("GET", `${ws(workspaceId)}/payments${qs(query)}`),
      create: (workspaceId: string, input: PaymentInput) => request<Payment>("POST", `${ws(workspaceId)}/payments`, input),
      update: (workspaceId: string, id: string, input: UpdatePaymentInput) =>
        request<Payment>("PATCH", `${ws(workspaceId)}/payments/${encodeURIComponent(id)}`, input),
      remove: (workspaceId: string, id: string) =>
        request<{ deleted: true }>("DELETE", `${ws(workspaceId)}/payments/${encodeURIComponent(id)}`),
    },
    files: {
      /** Upload a photo or PDF as base64. Shrink photos first: the API takes up to 5 MB. */
      upload: (workspaceId: string, input: UploadFileInput) => request<UploadedFile>("POST", `${ws(workspaceId)}/files`, input),
    },
    expenses: {
      list: (workspaceId: string, query: ExpenseListQuery = {}) =>
        request<Expense[]>("GET", `${ws(workspaceId)}/expenses${qs(query)}`),
      month: (workspaceId: string, month: string) => request<ExpenseMonth>("GET", `${ws(workspaceId)}/expense-month${qs({ month })}`),
      create: (workspaceId: string, input: ExpenseInput) => request<Expense>("POST", `${ws(workspaceId)}/expenses`, input),
      update: (workspaceId: string, id: string, input: UpdateExpenseInput) =>
        request<Expense>("PATCH", `${ws(workspaceId)}/expenses/${encodeURIComponent(id)}`, input),
      review: (workspaceId: string, id: string, input: ReviewExpenseInput) =>
        request<Expense>("POST", `${ws(workspaceId)}/expenses/${encodeURIComponent(id)}/review`, input),
      remove: (workspaceId: string, id: string) =>
        request<{ deleted: true }>("DELETE", `${ws(workspaceId)}/expenses/${encodeURIComponent(id)}`),
    },
    reports: {
      month: (workspaceId: string, month: string) => request<MonthReport>("GET", `${ws(workspaceId)}/reports/month${qs({ month })}`),
      /** A month's bills, payments or expenses as a spreadsheet (CSV) */
      export: (workspaceId: string, kind: ExportKind, month: string) =>
        request<ExportFile>("GET", `${ws(workspaceId)}/exports${qs({ kind, month })}`),
    },
    tasks: {
      list: (workspaceId: string, query: TaskListQuery = {}) => request<TaskItem[]>("GET", `${ws(workspaceId)}/tasks${qs(query)}`),
      create: (workspaceId: string, input: TaskInput) => request<TaskItem>("POST", `${ws(workspaceId)}/tasks`, input),
      update: (workspaceId: string, id: string, input: UpdateTaskInput) =>
        request<TaskItem>("PATCH", `${ws(workspaceId)}/tasks/${encodeURIComponent(id)}`, input),
      setDone: (workspaceId: string, id: string, done: boolean) =>
        request<TaskItem>("POST", `${ws(workspaceId)}/tasks/${encodeURIComponent(id)}/done`, { done }),
      remove: (workspaceId: string, id: string) =>
        request<{ deleted: true }>("DELETE", `${ws(workspaceId)}/tasks/${encodeURIComponent(id)}`),
      /** Your tasks for today and the week, and the events you're working */
      myDay: (workspaceId: string) => request<MyDay>("GET", `${ws(workspaceId)}/my-day`),
    },
    checklist: {
      get: (workspaceId: string) => request<ChecklistItem[]>("GET", `${ws(workspaceId)}/checklist`),
      save: (workspaceId: string, input: SaveChecklistInput) => request<ChecklistItem[]>("PUT", `${ws(workspaceId)}/checklist`, input),
      /** Adds the checklist to an event as dated tasks; steps already there are skipped */
      applyToEvent: (workspaceId: string, eventId: string) =>
        request<TaskItem[]>("POST", `${ws(workspaceId)}/events/${encodeURIComponent(eventId)}/checklist`),
    },
    eventTeam: {
      save: (workspaceId: string, eventId: string, input: SaveEventTeamInput) =>
        request<TeamMember[]>("PUT", `${ws(workspaceId)}/events/${encodeURIComponent(eventId)}/team`, input),
    },
    review: {
      /** Everyone's month for owners and managers; your own for everyone else */
      scores: (workspaceId: string, month: string) => request<TeamScores>("GET", `${ws(workspaceId)}/scores${qs({ month })}`),
      activity: (workspaceId: string, query: ActivityQuery = {}) =>
        request<ActivityPage>("GET", `${ws(workspaceId)}/activity${qs(query)}`),
      dailySummary: (workspaceId: string, date?: string) => request<DailySummary>("GET", `${ws(workspaceId)}/daily-summary${qs({ date })}`),
    },
    invitations: {
      preview: (token: string) => request<InvitationPreview>("GET", `/invitations/${encodeURIComponent(token)}`),
      accept: (token: string) =>
        request<AcceptedInvitation>("POST", `/invitations/${encodeURIComponent(token)}/accept`),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
