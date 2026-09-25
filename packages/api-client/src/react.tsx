/**
 * TanStack Query hooks for every API call. Uses only React and TanStack Query, so the
 * mobile app (React Native) can import this file unchanged.
 */
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import type {
  SaveChecklistInput,
  SaveEventTeamInput,
  TaskInput,
  TaskListQuery,
  UpdateTaskInput,
  ExpenseInput,
  ExpenseListQuery,
  ReviewExpenseInput,
  UpdateExpenseInput,
  UploadFileInput,
  BillInput,
  PaymentInput,
  UpdateBillInput,
  UpdatePaymentInput,
  CatalogueItemInput,
  EventInput,
  EventListQuery,
  QuoteInput,
  QuoteStatus,
  UpdateCatalogueItemInput,
  UpdateEventInput,
  UpdateQuoteInput,
  AddActivityInput,
  ClientInput,
  CreateLeadInput,
  LeadListQuery,
  SaveStagesInput,
  SubmitLeadFormInput,
  TemplateInput,
  UpdateClientInput,
  UpdateLeadInput,
  CreateInvitationInput,
  CreateWorkspaceInput,
  OtpRequestInput,
  OtpVerifyInput,
  UpdateMeInput,
  UpdateMemberInput,
  UpdateWorkspaceInput,
} from "@wedding-yantra/types";
import type { ApiClient } from "./client.js";

const ApiContext = createContext<ApiClient | null>(null);

export function ApiClientProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error("useApi must be used inside <ApiClientProvider>");
  return client;
}

/** Query keys, exported so screens can refresh data after changes. */
export const queryKeys = {
  me: ["me"] as const,
  businessTypes: ["business-types"] as const,
  workspace: (id: string) => ["workspace", id] as const,
  home: (id: string) => ["workspace", id, "home"] as const,
  team: (id: string) => ["workspace", id, "team"] as const,
  invitation: (token: string) => ["invitation", token] as const,
  /** Everything about leads in one business; invalidate this after any lead change. */
  sales: (id: string) => ["workspace", id, "sales"] as const,
  leads: (id: string, query: LeadListQuery) => ["workspace", id, "sales", "leads", query] as const,
  lead: (id: string, leadId: string) => ["workspace", id, "sales", "lead", leadId] as const,
  clients: (id: string, q: string) => ["workspace", id, "sales", "clients", q] as const,
  client: (id: string, clientId: string) => ["workspace", id, "sales", "client", clientId] as const,
  templates: (id: string) => ["workspace", id, "templates"] as const,
  leadForm: (id: string) => ["workspace", id, "lead-form"] as const,
  publicForm: (slug: string) => ["public-form", slug] as const,
  catalogue: (id: string, all: boolean) => ["workspace", id, "catalogue", all] as const,
  /** Quotes, events and the calendar; invalidate this after any booking change. */
  bookings: (id: string) => ["workspace", id, "bookings"] as const,
  quotes: (id: string, query: object) => ["workspace", id, "bookings", "quotes", query] as const,
  quote: (id: string, quoteId: string) => ["workspace", id, "bookings", "quote", quoteId] as const,
  events: (id: string, query: object) => ["workspace", id, "bookings", "events", query] as const,
  event: (id: string, eventId: string) => ["workspace", id, "bookings", "event", eventId] as const,
  calendar: (id: string, month: string) => ["workspace", id, "bookings", "calendar", month] as const,
  clashes: (id: string, dates: string, exclude: string) => ["workspace", id, "bookings", "clashes", dates, exclude] as const,
  publicQuote: (token: string) => ["public-quote", token] as const,
  /** Money lives under bookings too: a change to an event or a quote can change what's due. */
  moneyOverview: (id: string) => ["workspace", id, "bookings", "money"] as const,
  eventMoney: (id: string, eventId: string) => ["workspace", id, "bookings", "event-money", eventId] as const,
  bills: (id: string, query: object) => ["workspace", id, "bookings", "bills", query] as const,
  bill: (id: string, billId: string) => ["workspace", id, "bookings", "bill", billId] as const,
  billDraft: (id: string, query: object) => ["workspace", id, "bookings", "bill-draft", query] as const,
  payments: (id: string, query: object) => ["workspace", id, "bookings", "payments", query] as const,
  publicBill: (token: string) => ["public-bill", token] as const,
  expenses: (id: string, query: object) => ["workspace", id, "bookings", "expenses", query] as const,
  expenseMonth: (id: string, month: string) => ["workspace", id, "bookings", "expense-month", month] as const,
  monthReport: (id: string, month: string) => ["workspace", id, "bookings", "report", month] as const,
  /** Tasks and My Day; invalidate this after any task change. */
  work: (id: string) => ["workspace", id, "work"] as const,
  tasks: (id: string, query: object) => ["workspace", id, "work", "tasks", query] as const,
  myDay: (id: string) => ["workspace", id, "work", "my-day"] as const,
  checklist: (id: string) => ["workspace", id, "checklist"] as const,
  /** Scores, the activity log and the daily summary: read-only views over everything. */
  scores: (id: string, month: string) => ["workspace", id, "review", "scores", month] as const,
  activity: (id: string, userId: string) => ["workspace", id, "review", "activity", userId] as const,
  dailySummary: (id: string, date: string) => ["workspace", id, "review", "daily-summary", date] as const,
};

interface QueryOpts {
  enabled?: boolean;
  retry?: boolean | number;
}

// ---- Auth -------------------------------------------------------------------

export function useMe(opts: QueryOpts = {}) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.me, queryFn: api.auth.me, ...opts });
}

export function useRequestOtp() {
  const api = useApi();
  return useMutation({ mutationFn: (input: OtpRequestInput) => api.auth.requestOtp(input) });
}

export function useVerifyOtp() {
  const api = useApi();
  return useMutation({ mutationFn: (input: OtpVerifyInput) => api.auth.verifyOtp(input) });
}

export function useUpdateMe() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMeInput) => api.auth.updateMe(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me }),
  });
}

export function useLogout() {
  const api = useApi();
  return useMutation({ mutationFn: () => api.auth.logout() });
}

// ---- Business setup ---------------------------------------------------------

export function useBusinessTypes() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.businessTypes, queryFn: api.businessTypes.list, staleTime: Infinity });
}

export function useCreateWorkspace() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => api.workspaces.create(input),
    // Wait for the fresh business list, even if no screen is showing it right now.
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me, refetchType: "all" }),
  });
}

export function useWorkspace(id: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.workspace(id ?? ""),
    queryFn: () => api.workspaces.get(id!),
    enabled: !!id,
  });
}

export function useUpdateWorkspace(id: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWorkspaceInput) => api.workspaces.update(id, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.workspace(id) });
      void qc.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

export function useHome(id: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.home(id ?? ""),
    queryFn: () => api.workspaces.home(id!),
    enabled: !!id,
  });
}

// ---- Team -------------------------------------------------------------------

export function useTeam(workspaceId: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.team(workspaceId ?? ""),
    queryFn: () => api.team.get(workspaceId!),
    enabled: !!workspaceId,
  });
}

function useTeamMutation<TInput, TResult>(workspaceId: string, fn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.team(workspaceId) });
      void qc.invalidateQueries({ queryKey: queryKeys.home(workspaceId) });
    },
  });
}

export function useInviteMember(workspaceId: string) {
  const api = useApi();
  return useTeamMutation(workspaceId, (input: CreateInvitationInput) => api.team.invite(workspaceId, input));
}

export function useRevokeInvitation(workspaceId: string) {
  const api = useApi();
  return useTeamMutation(workspaceId, (invitationId: string) => api.team.revokeInvitation(workspaceId, invitationId));
}

export function useUpdateMember(workspaceId: string) {
  const api = useApi();
  return useTeamMutation(workspaceId, ({ memberId, ...input }: UpdateMemberInput & { memberId: string }) =>
    api.team.updateMember(workspaceId, memberId, input),
  );
}

export function useRemoveMember(workspaceId: string) {
  const api = useApi();
  return useTeamMutation(workspaceId, (memberId: string) => api.team.removeMember(workspaceId, memberId));
}

// ---- Invitations ------------------------------------------------------------

export function useInvitationPreview(token: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.invitation(token),
    queryFn: () => api.invitations.preview(token),
    retry: false,
  });
}

export function useAcceptInvitation() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.invitations.accept(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.me, refetchType: "all" }),
  });
}

// ---- Sales ------------------------------------------------------------------

/** Refreshes lead lists, lead pages, clients and Home after something changes. */
function useSalesMutation<TInput, TResult>(workspaceId: string, fn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.sales(workspaceId) });
      void qc.invalidateQueries({ queryKey: queryKeys.home(workspaceId) });
    },
  });
}

export function useLeads(workspaceId: string, query: LeadListQuery = {}) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.leads(workspaceId, query),
    queryFn: () => api.leads.list(workspaceId, query),
  });
}

export function useLead(workspaceId: string, leadId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.lead(workspaceId, leadId),
    queryFn: () => api.leads.get(workspaceId, leadId),
    enabled: !!leadId,
  });
}

export function useCreateLead(workspaceId: string) {
  const api = useApi();
  return useSalesMutation(workspaceId, (input: CreateLeadInput) => api.leads.create(workspaceId, input));
}

export function useUpdateLead(workspaceId: string, leadId: string) {
  const api = useApi();
  return useSalesMutation(workspaceId, (input: UpdateLeadInput) => api.leads.update(workspaceId, leadId, input));
}

export function useDeleteLead(workspaceId: string) {
  const api = useApi();
  return useSalesMutation(workspaceId, (leadId: string) => api.leads.remove(workspaceId, leadId));
}

export function useAddLeadActivity(workspaceId: string, leadId: string) {
  const api = useApi();
  return useSalesMutation(workspaceId, (input: AddActivityInput) => api.leads.addActivity(workspaceId, leadId, input));
}

export function useSaveStages(workspaceId: string) {
  const api = useApi();
  return useSalesMutation(workspaceId, (input: SaveStagesInput) => api.leads.saveStages(workspaceId, input));
}

export function useClients(workspaceId: string, q = "") {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.clients(workspaceId, q), queryFn: () => api.clients.list(workspaceId, q || undefined) });
}

export function useClient(workspaceId: string, clientId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.client(workspaceId, clientId),
    queryFn: () => api.clients.get(workspaceId, clientId),
    enabled: !!clientId,
  });
}

export function useCreateClient(workspaceId: string) {
  const api = useApi();
  return useSalesMutation(workspaceId, (input: ClientInput) => api.clients.create(workspaceId, input));
}

export function useUpdateClient(workspaceId: string, clientId: string) {
  const api = useApi();
  return useSalesMutation(workspaceId, (input: UpdateClientInput) => api.clients.update(workspaceId, clientId, input));
}

export function useTemplates(workspaceId: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.templates(workspaceId), queryFn: () => api.templates.list(workspaceId) });
}

function useTemplateMutation<TInput, TResult>(workspaceId: string, fn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.templates(workspaceId) }),
  });
}

export function useCreateTemplate(workspaceId: string) {
  const api = useApi();
  return useTemplateMutation(workspaceId, (input: TemplateInput) => api.templates.create(workspaceId, input));
}

export function useUpdateTemplate(workspaceId: string) {
  const api = useApi();
  return useTemplateMutation(workspaceId, ({ id, ...input }: Partial<TemplateInput> & { id: string }) =>
    api.templates.update(workspaceId, id, input),
  );
}

export function useDeleteTemplate(workspaceId: string) {
  const api = useApi();
  return useTemplateMutation(workspaceId, (id: string) => api.templates.remove(workspaceId, id));
}

export function useLeadForm(workspaceId: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.leadForm(workspaceId), queryFn: () => api.leadForm.get(workspaceId) });
}

export function useSetLeadFormEnabled(workspaceId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => api.leadForm.setEnabled(workspaceId, enabled),
    onSuccess: (data) => qc.setQueryData(queryKeys.leadForm(workspaceId), data),
  });
}

export function usePublicForm(slug: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.publicForm(slug), queryFn: () => api.leadForm.publicGet(slug), retry: false });
}

export function useSubmitPublicForm(slug: string) {
  const api = useApi();
  return useMutation({ mutationFn: (input: SubmitLeadFormInput) => api.leadForm.submit(slug, input) });
}

// ---- Price list, quotes, events ---------------------------------------------

export function useCatalogue(workspaceId: string, all = false) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.catalogue(workspaceId, all), queryFn: () => api.catalogue.list(workspaceId, all) });
}

function useCatalogueMutation<TInput, TResult>(workspaceId: string, fn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "catalogue"] }),
  });
}

export function useCreateCatalogueItem(workspaceId: string) {
  const api = useApi();
  return useCatalogueMutation(workspaceId, (input: CatalogueItemInput) => api.catalogue.create(workspaceId, input));
}

export function useUpdateCatalogueItem(workspaceId: string) {
  const api = useApi();
  return useCatalogueMutation(workspaceId, ({ id, ...input }: UpdateCatalogueItemInput & { id: string }) =>
    api.catalogue.update(workspaceId, id, input),
  );
}

/** Refreshes quotes, events, calendar, leads and Home after a booking change. */
function useBookingMutation<TInput, TResult>(workspaceId: string, fn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.bookings(workspaceId) });
      void qc.invalidateQueries({ queryKey: queryKeys.sales(workspaceId) });
      void qc.invalidateQueries({ queryKey: queryKeys.home(workspaceId) });
    },
  });
}

export function useQuotes(workspaceId: string, query: { leadId?: string; clientId?: string; status?: QuoteStatus } = {}, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.quotes(workspaceId, query), queryFn: () => api.quotes.list(workspaceId, query), enabled });
}

export function useQuote(workspaceId: string, quoteId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.quote(workspaceId, quoteId),
    queryFn: () => api.quotes.get(workspaceId, quoteId),
    enabled: !!quoteId,
  });
}

export function useCreateQuote(workspaceId: string) {
  const api = useApi();
  return useBookingMutation(workspaceId, (input: QuoteInput) => api.quotes.create(workspaceId, input));
}

export function useUpdateQuote(workspaceId: string, quoteId: string) {
  const api = useApi();
  return useBookingMutation(workspaceId, (input: UpdateQuoteInput) => api.quotes.update(workspaceId, quoteId, input));
}

export function useQuoteAction(workspaceId: string, quoteId: string) {
  const api = useApi();
type QuoteAction = { kind: "send" } | { kind: "accept" } | { kind: "decline"; reason?: string } | { kind: "delete" };
  return useBookingMutation(workspaceId, (action: QuoteAction): Promise<unknown> => {
    switch (action.kind) {
      case "send":
        return api.quotes.send(workspaceId, quoteId);
      case "accept":
        return api.quotes.accept(workspaceId, quoteId);
      case "decline":
        return api.quotes.decline(workspaceId, quoteId, action.reason);
      case "delete":
        return api.quotes.remove(workspaceId, quoteId);
    }
  });
}

export function usePublicQuote(token: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.publicQuote(token), queryFn: () => api.quotes.publicGet(token), retry: false });
}

export function usePublicQuoteAnswer(token: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answer: { accept: true; name: string } | { accept: false; reason?: string }) =>
      answer.accept ? api.quotes.publicAccept(token, answer.name) : api.quotes.publicDecline(token, answer.reason),
    onSuccess: (data) => qc.setQueryData(queryKeys.publicQuote(token), data),
  });
}

export function useEvents(workspaceId: string, query: EventListQuery = {}, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.events(workspaceId, query), queryFn: () => api.events.list(workspaceId, query), enabled });
}

export function useEvent(workspaceId: string, eventId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.event(workspaceId, eventId),
    queryFn: () => api.events.get(workspaceId, eventId),
    enabled: !!eventId,
  });
}

export function useCreateEvent(workspaceId: string) {
  const api = useApi();
  return useBookingMutation(workspaceId, (input: EventInput) => api.events.create(workspaceId, input));
}

export function useUpdateEvent(workspaceId: string, eventId: string) {
  const api = useApi();
  return useBookingMutation(workspaceId, (input: UpdateEventInput) => api.events.update(workspaceId, eventId, input));
}

export function useDeleteEvent(workspaceId: string) {
  const api = useApi();
  return useBookingMutation(workspaceId, (eventId: string) => api.events.remove(workspaceId, eventId));
}

export function useCalendar(workspaceId: string, month: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.calendar(workspaceId, month), queryFn: () => api.events.calendar(workspaceId, month), enabled });
}

/** Other events already on these dates. Re-checks as the dates change. */
export function useClashes(workspaceId: string, dates: string[], excludeEventId?: string) {
  const api = useApi();
  const key = [...new Set(dates)].sort().join(",");
  return useQuery({
    queryKey: queryKeys.clashes(workspaceId, key, excludeEventId ?? ""),
    queryFn: () => api.events.clashes(workspaceId, key.split(","), excludeEventId),
    enabled: key.length > 0,
  });
}

// ---------------------------------------------------------------------------
// Money: bills, payments and what's due
// ---------------------------------------------------------------------------

export function useMoneyOverview(workspaceId: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.moneyOverview(workspaceId), queryFn: () => api.money.overview(workspaceId), enabled });
}

export function useEventMoney(workspaceId: string, eventId: string, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.eventMoney(workspaceId, eventId),
    queryFn: () => api.money.forEvent(workspaceId, eventId),
    enabled: enabled && !!eventId,
  });
}

export function useBills(
  workspaceId: string,
  query: { clientId?: string; eventId?: string; status?: "open" | "paid" | "cancelled" } = {},
  enabled = true,
) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.bills(workspaceId, query), queryFn: () => api.bills.list(workspaceId, query), enabled });
}

export function useBill(workspaceId: string, billId: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.bill(workspaceId, billId), queryFn: () => api.bills.get(workspaceId, billId), enabled: !!billId });
}

/** Starting values for a new bill. Always fetched fresh. */
export function useBillDraft(workspaceId: string, query: { eventId?: string; clientId?: string; quoteId?: string }, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.billDraft(workspaceId, query),
    queryFn: () => api.bills.draft(workspaceId, query),
    enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useCreateBill(workspaceId: string) {
  const api = useApi();
  return useBookingMutation(workspaceId, (input: BillInput) => api.bills.create(workspaceId, input));
}

export function useUpdateBill(workspaceId: string, billId: string) {
  const api = useApi();
  return useBookingMutation(workspaceId, (input: UpdateBillInput) => api.bills.update(workspaceId, billId, input));
}

export function useCancelBill(workspaceId: string, billId: string) {
  const api = useApi();
  return useBookingMutation(workspaceId, (reason?: string) => api.bills.cancel(workspaceId, billId, reason));
}

export function usePublicBill(token: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.publicBill(token), queryFn: () => api.bills.publicGet(token), retry: false });
}

export function usePayments(
  workspaceId: string,
  query: { billId?: string; eventId?: string; clientId?: string; month?: string } = {},
  enabled = true,
) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.payments(workspaceId, query), queryFn: () => api.payments.list(workspaceId, query), enabled });
}

export function useRecordPayment(workspaceId: string) {
  const api = useApi();
  return useBookingMutation(workspaceId, (input: PaymentInput) => api.payments.create(workspaceId, input));
}

export function useUpdatePayment(workspaceId: string) {
  const api = useApi();
  return useBookingMutation(workspaceId, ({ id, ...input }: UpdatePaymentInput & { id: string }) =>
    api.payments.update(workspaceId, id, input),
  );
}

export function useDeletePayment(workspaceId: string) {
  const api = useApi();
  return useBookingMutation(workspaceId, (id: string) => api.payments.remove(workspaceId, id));
}

// ---------------------------------------------------------------------------
// Expenses and bill photos
// ---------------------------------------------------------------------------

/** Uploads a photo; attach the returned id to an expense. */
export function useUploadFile(workspaceId: string) {
  const api = useApi();
  return useMutation({ mutationFn: (input: UploadFileInput) => api.files.upload(workspaceId, input) });
}

export function useExpenses(workspaceId: string, query: ExpenseListQuery = {}, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.expenses(workspaceId, query), queryFn: () => api.expenses.list(workspaceId, query), enabled });
}

export function useExpenseMonth(workspaceId: string, month: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.expenseMonth(workspaceId, month), queryFn: () => api.expenses.month(workspaceId, month), enabled });
}

export function useCreateExpense(workspaceId: string) {
  const api = useApi();
  return useBookingMutation(workspaceId, (input: ExpenseInput) => api.expenses.create(workspaceId, input));
}

export function useUpdateExpense(workspaceId: string) {
  const api = useApi();
  return useBookingMutation(workspaceId, ({ id, ...input }: UpdateExpenseInput & { id: string }) =>
    api.expenses.update(workspaceId, id, input),
  );
}

export function useReviewExpense(workspaceId: string) {
  const api = useApi();
  return useBookingMutation(workspaceId, ({ id, ...input }: ReviewExpenseInput & { id: string }) =>
    api.expenses.review(workspaceId, id, input),
  );
}

export function useDeleteExpense(workspaceId: string) {
  const api = useApi();
  return useBookingMutation(workspaceId, (id: string) => api.expenses.remove(workspaceId, id));
}

export function useMonthReport(workspaceId: string, month: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.monthReport(workspaceId, month), queryFn: () => api.reports.month(workspaceId, month), enabled });
}

// ---- Tasks, checklist and event team ---------------------------------------------

export function useTasks(workspaceId: string, query: TaskListQuery = {}, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.tasks(workspaceId, query), queryFn: () => api.tasks.list(workspaceId, query), enabled });
}

export function useMyDay(workspaceId: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.myDay(workspaceId), queryFn: () => api.tasks.myDay(workspaceId), enabled });
}

/** Refreshes task lists, My Day and Home's counts after a task change. */
function useTaskMutation<TInput, TResult>(workspaceId: string, fn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.work(workspaceId) });
      void qc.invalidateQueries({ queryKey: queryKeys.home(workspaceId) });
    },
  });
}

export function useCreateTask(workspaceId: string) {
  const api = useApi();
  return useTaskMutation(workspaceId, (input: TaskInput) => api.tasks.create(workspaceId, input));
}

export function useUpdateTask(workspaceId: string) {
  const api = useApi();
  return useTaskMutation(workspaceId, ({ id, ...input }: UpdateTaskInput & { id: string }) => api.tasks.update(workspaceId, id, input));
}

export function useSetTaskDone(workspaceId: string) {
  const api = useApi();
  return useTaskMutation(workspaceId, ({ id, done }: { id: string; done: boolean }) => api.tasks.setDone(workspaceId, id, done));
}

export function useDeleteTask(workspaceId: string) {
  const api = useApi();
  return useTaskMutation(workspaceId, (id: string) => api.tasks.remove(workspaceId, id));
}

export function useChecklist(workspaceId: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.checklist(workspaceId), queryFn: () => api.checklist.get(workspaceId), enabled });
}

export function useSaveChecklist(workspaceId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveChecklistInput) => api.checklist.save(workspaceId, input),
    onSuccess: (data) => qc.setQueryData(queryKeys.checklist(workspaceId), data),
  });
}

export function useApplyChecklist(workspaceId: string) {
  const api = useApi();
  return useTaskMutation(workspaceId, (eventId: string) => api.checklist.applyToEvent(workspaceId, eventId));
}

/** Who works an event. Changes what freelancers see, so events and My Day refresh too. */
export function useSaveEventTeam(workspaceId: string, eventId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveEventTeamInput) => api.eventTeam.save(workspaceId, eventId, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.bookings(workspaceId) });
      void qc.invalidateQueries({ queryKey: queryKeys.work(workspaceId) });
      void qc.invalidateQueries({ queryKey: queryKeys.home(workspaceId) });
    },
  });
}

// ---- Scores, activity log and the daily summary -----------------------------------

export function useScores(workspaceId: string, month: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.scores(workspaceId, month), queryFn: () => api.review.scores(workspaceId, month), enabled });
}

/** The activity log, a page at a time, newest first. */
export function useActivity(workspaceId: string, userId?: string, enabled = true) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: queryKeys.activity(workspaceId, userId ?? ""),
    queryFn: ({ pageParam }) => api.review.activity(workspaceId, { before: pageParam, userId }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next ?? undefined,
    enabled,
  });
}

export function useDailySummary(workspaceId: string, date: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.dailySummary(workspaceId, date), queryFn: () => api.review.dailySummary(workspaceId, date), enabled });
}
