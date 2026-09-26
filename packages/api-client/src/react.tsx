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
import { createContext, useContext, useEffect, type ReactNode } from "react";
import type {
  NotificationPrefs,
  RecogniseInput,
  SavePointSettingsInput,
  TaskRepeatInput,
  SaveCustomFieldsInput,
  BillListQuery,
  PaymentListQuery,
  BankAccountInput,
  CustomOption,
  OptionInput,
  SavedTextInput,
  UpdateBankAccountInput,
  UpdateOptionInput,
  UpdateSavedTextInput,
  BroadcastInput,
  BroadcastRecipientInput,
  BroadcastDetail,
  InventoryBookingInput,
  InventoryBookingListQuery,
  InventoryItemInput,
  InventoryListQuery,
  UpdateInventoryBookingInput,
  UpdateInventoryItemInput,
  PayoutInput,
  PayoutListQuery,
  PayPayoutInput,
  UpdatePayoutInput,
  UpdateVendorInput,
  VendorInput,
  DeliverableInput,
  DeliverableListQuery,
  UpdateDeliverableInput,
  CheckoutInput,
  SaveChecklistInput,
  SaveEventTeamInput,
  TaskInput,
  TaskListQuery,
  TimeOffInput,
  TimeOffQuery,
  UpdateTaskInput,
  ExpenseInput,
  ExpenseListQuery,
  ReimburseExpenseInput,
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
  CommentInput,
  MoveTaskInput,
  ReviewTaskInput,
  SnoozeTaskInput,
  SubmitTaskInput,
  UpdateStepInput,
  TaskDetail,
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
  publicForm: (slug: string, ref: string) => ["public-form", slug, ref] as const,
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
  billsSummary: (id: string, query: object) => ["workspace", id, "bookings", "bills-summary", query] as const,
  options: (id: string) => ["workspace", id, "options"] as const,
  savedTexts: (id: string) => ["workspace", id, "saved-texts"] as const,
  bankAccounts: (id: string) => ["workspace", id, "bank-accounts"] as const,
  bill: (id: string, billId: string) => ["workspace", id, "bookings", "bill", billId] as const,
  billDraft: (id: string, query: object) => ["workspace", id, "bookings", "bill-draft", query] as const,
  payments: (id: string, query: object) => ["workspace", id, "bookings", "payments", query] as const,
  publicBill: (token: string) => ["public-bill", token] as const,
  expenses: (id: string, query: object) => ["workspace", id, "bookings", "expenses", query] as const,
  expensesSummary: (id: string, query: object) => ["workspace", id, "bookings", "expenses-summary", query] as const,
  expenseMonth: (id: string, month: string) => ["workspace", id, "bookings", "expense-month", month] as const,
  monthReport: (id: string, month: string) => ["workspace", id, "bookings", "report", month] as const,
  /** Tasks and My Day; invalidate this after any task change. */
  work: (id: string) => ["workspace", id, "work"] as const,
  /** Alerts live under work too: any task change can make or read one. */
  alerts: (id: string) => ["workspace", id, "work", "alerts"] as const,
  alertList: (id: string, unread: boolean) => ["workspace", id, "work", "alerts", "list", unread] as const,
  alertCount: (id: string) => ["workspace", id, "work", "alerts", "count"] as const,
  alertPrefs: (id: string) => ["workspace", id, "alert-prefs"] as const,
  tasks: (id: string, query: object) => ["workspace", id, "work", "tasks", query] as const,
  myDay: (id: string) => ["workspace", id, "work", "my-day"] as const,
  task: (id: string, taskId: string) => ["workspace", id, "work", "task", taskId] as const,
  taskBoard: (id: string) => ["workspace", id, "work", "board"] as const,
  timeOff: (id: string, query: object) => ["workspace", id, "work", "time-off", query] as const,
  broadcasts: (id: string) => ["workspace", id, "broadcasts"] as const,
  broadcast: (id: string, broadcastId: string) => ["workspace", id, "broadcasts", broadcastId] as const,
  broadcastAudience: (id: string, audience: string) => ["workspace", id, "broadcasts", "audience", audience] as const,
  customFields: (id: string) => ["workspace", id, "custom-fields"] as const,
  taskRepeats: (id: string, scope: string) => ["workspace", id, "work", "repeats", scope] as const,
  checklist: (id: string) => ["workspace", id, "checklist"] as const,
  /** Scores, the activity log and the daily summary: read-only views over everything. */
  scores: (id: string, month: string) => ["workspace", id, "review", "scores", month] as const,
  /** Points live under work: finishing a task changes them. */
  leaderboard: (id: string, month: string) => ["workspace", id, "work", "points", "board", month] as const,
  ledger: (id: string, month: string, userId: string) => ["workspace", id, "work", "points", "ledger", month, userId] as const,
  pointRules: (id: string) => ["workspace", id, "point-rules"] as const,
  activity: (id: string, userId: string) => ["workspace", id, "review", "activity", userId] as const,
  dailySummary: (id: string, date: string) => ["workspace", id, "review", "daily-summary", date] as const,
  billing: (id: string) => ["workspace", id, "billing"] as const,
  /** Reviews to ask for and who refers work */
  grow: (id: string) => ["workspace", id, "grow"] as const,
  /** Deliverables live under work: Home and My Day count them. */
  deliverables: (id: string, query: object) => ["workspace", id, "work", "deliverables", query] as const,
  /** Vendors and payouts live under bookings: paying one changes an event's profit. */
  vendors: (id: string) => ["workspace", id, "bookings", "vendors"] as const,
  vendor: (id: string, vendorId: string) => ["workspace", id, "bookings", "vendor", vendorId] as const,
  payouts: (id: string, query: object) => ["workspace", id, "bookings", "payouts", query] as const,
  /** Stock and what events need of it. */
  inventory: (id: string) => ["workspace", id, "inventory"] as const,
  inventoryItems: (id: string, query: object) => ["workspace", id, "inventory", "items", query] as const,
  inventoryBookings: (id: string, query: object) => ["workspace", id, "inventory", "bookings", query] as const,
  portal: (token: string) => ["public-portal", token] as const,
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
    // Home sums up everything else, so it's checked again each time it's opened (the last
    // copy shows meanwhile, so it never waits on a spinner).
    refetchOnMount: "always",
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

/** `ref` is the code from a client's "recommend us" link. */
export function usePublicForm(slug: string, ref?: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.publicForm(slug, ref ?? ""), queryFn: () => api.leadForm.publicGet(slug, ref), retry: false });
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

export function useBills(workspaceId: string, query: BillListQuery = {}, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.bills(workspaceId, query),
    queryFn: () => api.bills.list(workspaceId, query),
    enabled,
    // Filters change often; keep showing the last list while the next loads.
    placeholderData: (previous) => previous,
  });
}

export function useBillsSummary(workspaceId: string, query: BillListQuery = {}, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.billsSummary(workspaceId, query),
    queryFn: () => api.bills.summary(workspaceId, query),
    enabled,
    placeholderData: (previous) => previous,
  });
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

export function usePayments(workspaceId: string, query: PaymentListQuery = {}, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.payments(workspaceId, query),
    queryFn: () => api.payments.list(workspaceId, query),
    enabled,
    placeholderData: (previous) => previous,
  });
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
  return useQuery({
    queryKey: queryKeys.expenses(workspaceId, query),
    queryFn: () => api.expenses.list(workspaceId, query),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useExpensesSummary(workspaceId: string, query: ExpenseListQuery = {}, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.expensesSummary(workspaceId, query),
    queryFn: () => api.expenses.summary(workspaceId, query),
    enabled,
    placeholderData: (previous) => previous,
  });
}

export function useReimburseExpense(workspaceId: string) {
  const api = useApi();
  return useBookingMutation(workspaceId, ({ id, ...input }: ReimburseExpenseInput & { id: string }) =>
    api.expenses.reimburse(workspaceId, id, input),
  );
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

/** One task in full: steps, comments, files, hand-ins and history. */
export function useTask(workspaceId: string, taskId: string | null) {
  const api = useApi();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.task(workspaceId, taskId ?? ""), queryFn: () => api.tasks.get(workspaceId, taskId!), enabled: !!taskId });
  // Opening a task reads its alerts on the server: bring the bell up to date.
  const loadedAt = query.dataUpdatedAt;
  useEffect(() => {
    if (loadedAt) void qc.invalidateQueries({ queryKey: queryKeys.alerts(workspaceId) });
  }, [loadedAt, qc, workspaceId]);
  return query;
}

export function usePeopleBoard(workspaceId: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.taskBoard(workspaceId), queryFn: () => api.tasks.board(workspaceId), enabled });
}

/** Changes to one task: the answer is the whole task, put straight into its cache. */
function useTaskDetailMutation<TInput>(workspaceId: string, taskId: string, fn: (input: TInput) => Promise<TaskDetail>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (detail) => {
      qc.setQueryData(queryKeys.task(workspaceId, taskId), detail);
      void qc.invalidateQueries({ queryKey: queryKeys.work(workspaceId), predicate: (q) => q.queryKey[3] !== "task" || q.queryKey[4] !== taskId });
      void qc.invalidateQueries({ queryKey: queryKeys.home(workspaceId) });
    },
  });
}

/** Moves any task by id: for dragging cards between columns. */
export function useMoveAnyTask(workspaceId: string) {
  const api = useApi();
  return useTaskMutation(workspaceId, ({ id, ...input }: MoveTaskInput & { id: string }) => api.tasks.move(workspaceId, id, input));
}

/** Moves any task to a later day by id: for "tomorrow" on a row. */
export function useSnoozeAnyTask(workspaceId: string) {
  const api = useApi();
  return useTaskMutation(workspaceId, ({ id, ...input }: SnoozeTaskInput & { id: string }) => api.tasks.snooze(workspaceId, id, input));
}

// ---- Alerts -------------------------------------------------------------------

/** The bell's count, asked every minute while the app is open. */
export function useUnreadAlerts(workspaceId: string) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.alertCount(workspaceId),
    queryFn: () => api.notifications.unread(workspaceId),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useAlerts(workspaceId: string, unread = false) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: queryKeys.alertList(workspaceId, unread),
    queryFn: ({ pageParam }) => api.notifications.list(workspaceId, { unread, before: pageParam ?? undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore,
  });
}

export function useMarkAlertsRead(workspaceId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ids: string[] } | { all: true }) => api.notifications.read(workspaceId, input),
    onSuccess: ({ unread }) => {
      qc.setQueryData(queryKeys.alertCount(workspaceId), { unread });
      void qc.invalidateQueries({ queryKey: queryKeys.alerts(workspaceId), predicate: (q) => q.queryKey[4] !== "count" });
    },
  });
}

export function useAlertPrefs(workspaceId: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.alertPrefs(workspaceId), queryFn: () => api.notifications.prefs(workspaceId) });
}

export function useSaveAlertPrefs(workspaceId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<NotificationPrefs, "devices">) => api.notifications.savePrefs(workspaceId, input),
    onSuccess: (prefs) => qc.setQueryData(queryKeys.alertPrefs(workspaceId), prefs),
  });
}

export function useTestAlert(workspaceId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.notifications.test(workspaceId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.alerts(workspaceId) }),
  });
}

export function useMoveTask(workspaceId: string, taskId: string) {
  const api = useApi();
  return useTaskDetailMutation(workspaceId, taskId, (input: MoveTaskInput) => api.tasks.move(workspaceId, taskId, input));
}
export function useSubmitTask(workspaceId: string, taskId: string) {
  const api = useApi();
  return useTaskDetailMutation(workspaceId, taskId, (input: SubmitTaskInput) => api.tasks.submit(workspaceId, taskId, input));
}
export function useReviewTask(workspaceId: string, taskId: string) {
  const api = useApi();
  return useTaskDetailMutation(workspaceId, taskId, (input: ReviewTaskInput) => api.tasks.review(workspaceId, taskId, input));
}
export function useSnoozeTask(workspaceId: string, taskId: string) {
  const api = useApi();
  return useTaskDetailMutation(workspaceId, taskId, (input: SnoozeTaskInput) => api.tasks.snooze(workspaceId, taskId, input));
}
export function useTaskSteps(workspaceId: string, taskId: string) {
  const api = useApi();
  return {
    add: useTaskDetailMutation(workspaceId, taskId, (title: string) => api.tasks.addStep(workspaceId, taskId, title)),
    update: useTaskDetailMutation(workspaceId, taskId, ({ stepId, ...input }: UpdateStepInput & { stepId: string }) =>
      api.tasks.updateStep(workspaceId, taskId, stepId, input),
    ),
    remove: useTaskDetailMutation(workspaceId, taskId, (stepId: string) => api.tasks.removeStep(workspaceId, taskId, stepId)),
  };
}
export function useTaskComments(workspaceId: string, taskId: string) {
  const api = useApi();
  return {
    add: useTaskDetailMutation(workspaceId, taskId, (input: CommentInput) => api.tasks.comment(workspaceId, taskId, input)),
    remove: useTaskDetailMutation(workspaceId, taskId, (commentId: string) => api.tasks.removeComment(workspaceId, taskId, commentId)),
  };
}
export function useTaskFiles(workspaceId: string, taskId: string) {
  const api = useApi();
  return {
    attach: useTaskDetailMutation(workspaceId, taskId, (fileId: string) => api.tasks.attach(workspaceId, taskId, fileId)),
    detach: useTaskDetailMutation(workspaceId, taskId, (fileId: string) => api.tasks.detach(workspaceId, taskId, fileId)),
  };
}

export function useTimeOff(workspaceId: string, query: TimeOffQuery = {}, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.timeOff(workspaceId, query), queryFn: () => api.timeOff.list(workspaceId, query), enabled });
}

export function useAddTimeOff(workspaceId: string) {
  const api = useApi();
  return useTaskMutation(workspaceId, (input: TimeOffInput) => api.timeOff.add(workspaceId, input));
}

export function useRemoveTimeOff(workspaceId: string) {
  const api = useApi();
  return useTaskMutation(workspaceId, (id: string) => api.timeOff.remove(workspaceId, id));
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

export function useLeaderboard(workspaceId: string, month: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.leaderboard(workspaceId, month), queryFn: () => api.review.leaderboard(workspaceId, month) });
}

/** Someone's points this month; leave `userId` empty for your own. */
export function useLedger(workspaceId: string, month: string, userId: string | null, enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.ledger(workspaceId, month, userId ?? "me"),
    queryFn: () => api.review.ledger(workspaceId, month, userId ?? undefined),
    enabled,
  });
}

export function usePointRules(workspaceId: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.pointRules(workspaceId), queryFn: () => api.review.pointRules(workspaceId) });
}

export function useSavePointRules(workspaceId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SavePointSettingsInput) => api.review.savePointRules(workspaceId, input),
    onSuccess: (settings) => {
      qc.setQueryData(queryKeys.pointRules(workspaceId), settings);
      void qc.invalidateQueries({ queryKey: queryKeys.work(workspaceId) });
    },
  });
}

export function useRecognise(workspaceId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RecogniseInput) => api.review.recognise(workspaceId, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.work(workspaceId) }),
  });
}

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

// ---- Plan and billing ---------------------------------------------------------------

export function useBilling(workspaceId: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.billing(workspaceId), queryFn: () => api.billing.get(workspaceId), enabled });
}

/** Starts paying online. The caller sends the owner to the returned url. */
export function useCheckout(workspaceId: string) {
  const api = useApi();
  return useMutation({ mutationFn: (input: CheckoutInput) => api.billing.checkout(workspaceId, input) });
}

// ---- Grow: the client's own page, reviews and referrals -----------------------------

/** Turns on a client's page and returns its link. */
export function useSharePortal(workspaceId: string) {
  const api = useApi();
  return useSalesMutation(workspaceId, (clientId: string) => api.grow.sharePortal(workspaceId, clientId));
}

/** Stops sharing a client's page; the old link stops working. */
export function useStopPortal(workspaceId: string) {
  const api = useApi();
  return useSalesMutation(workspaceId, (clientId: string) => api.grow.stopPortal(workspaceId, clientId));
}

/** The client's own page, as they see it. */
export function usePortal(token: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.portal(token), queryFn: () => api.grow.portal(token), retry: false });
}

/** Notes that a client was asked for a review of an event. */
export function useRequestReview(workspaceId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (eventId: string) => api.grow.requestReview(workspaceId, eventId),
    onSuccess: (event) => {
      qc.setQueryData(queryKeys.event(workspaceId, event.id), event);
      void qc.invalidateQueries({ queryKey: queryKeys.grow(workspaceId) });
    },
  });
}

export function useGrow(workspaceId: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.grow(workspaceId), queryFn: () => api.grow.summary(workspaceId), enabled });
}

// ---- Deliverables -------------------------------------------------------------------

export function useDeliverables(workspaceId: string, query: DeliverableListQuery = {}, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.deliverables(workspaceId, query), queryFn: () => api.deliverables.list(workspaceId, query), enabled });
}

/** Refreshes deliverable lists, Home and the client's page data after a change. */
function useDeliverableMutation<TInput, TResult>(workspaceId: string, fn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.work(workspaceId) });
      void qc.invalidateQueries({ queryKey: queryKeys.home(workspaceId) });
    },
  });
}

export function useCreateDeliverable(workspaceId: string) {
  const api = useApi();
  return useDeliverableMutation(workspaceId, (input: DeliverableInput) => api.deliverables.create(workspaceId, input));
}

export function useUpdateDeliverable(workspaceId: string) {
  const api = useApi();
  return useDeliverableMutation(workspaceId, ({ id, ...input }: UpdateDeliverableInput & { id: string }) => api.deliverables.update(workspaceId, id, input));
}

export function useDeleteDeliverable(workspaceId: string) {
  const api = useApi();
  return useDeliverableMutation(workspaceId, (id: string) => api.deliverables.remove(workspaceId, id));
}

// ---- Vendors and payouts ------------------------------------------------------------

export function useVendors(workspaceId: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.vendors(workspaceId), queryFn: () => api.vendors.list(workspaceId), enabled });
}

export function useVendor(workspaceId: string, vendorId: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.vendor(workspaceId, vendorId), queryFn: () => api.vendors.get(workspaceId, vendorId), enabled: !!vendorId });
}

export function usePayouts(workspaceId: string, query: PayoutListQuery = {}, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.payouts(workspaceId, query), queryFn: () => api.payouts.list(workspaceId, query), enabled });
}

/** Vendors, payouts, event profit and the Money page all move together. */
function useVendorMutation<TInput, TResult>(workspaceId: string, fn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.bookings(workspaceId) });
      void qc.invalidateQueries({ queryKey: queryKeys.home(workspaceId) });
    },
  });
}

export function useCreateVendor(workspaceId: string) {
  const api = useApi();
  return useVendorMutation(workspaceId, (input: VendorInput) => api.vendors.create(workspaceId, input));
}

export function useUpdateVendor(workspaceId: string) {
  const api = useApi();
  return useVendorMutation(workspaceId, ({ id, ...input }: UpdateVendorInput & { id: string }) => api.vendors.update(workspaceId, id, input));
}

export function useDeleteVendor(workspaceId: string) {
  const api = useApi();
  return useVendorMutation(workspaceId, (id: string) => api.vendors.remove(workspaceId, id));
}

export function useCreatePayout(workspaceId: string) {
  const api = useApi();
  return useVendorMutation(workspaceId, (input: PayoutInput) => api.payouts.create(workspaceId, input));
}

export function useUpdatePayout(workspaceId: string) {
  const api = useApi();
  return useVendorMutation(workspaceId, ({ id, ...input }: UpdatePayoutInput & { id: string }) => api.payouts.update(workspaceId, id, input));
}

export function usePayPayout(workspaceId: string) {
  const api = useApi();
  return useVendorMutation(workspaceId, ({ id, ...input }: PayPayoutInput & { id: string }) => api.payouts.pay(workspaceId, id, input));
}

export function useUnpayPayout(workspaceId: string) {
  const api = useApi();
  return useVendorMutation(workspaceId, (id: string) => api.payouts.unpay(workspaceId, id));
}

export function useDeletePayout(workspaceId: string) {
  const api = useApi();
  return useVendorMutation(workspaceId, (id: string) => api.payouts.remove(workspaceId, id));
}

// ---- Inventory ----------------------------------------------------------------------

export function useInventory(workspaceId: string, query: InventoryListQuery = {}, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.inventoryItems(workspaceId, query), queryFn: () => api.inventory.list(workspaceId, query), enabled });
}

export function useInventoryBookings(workspaceId: string, query: InventoryBookingListQuery = {}, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.inventoryBookings(workspaceId, query), queryFn: () => api.inventory.bookings(workspaceId, query), enabled });
}

function useInventoryMutation<TInput, TResult>(workspaceId: string, fn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.inventory(workspaceId) }) });
}

export function useCreateInventoryItem(workspaceId: string) {
  const api = useApi();
  return useInventoryMutation(workspaceId, (input: InventoryItemInput) => api.inventory.create(workspaceId, input));
}

export function useUpdateInventoryItem(workspaceId: string) {
  const api = useApi();
  return useInventoryMutation(workspaceId, ({ id, ...input }: UpdateInventoryItemInput & { id: string }) => api.inventory.update(workspaceId, id, input));
}

export function useDeleteInventoryItem(workspaceId: string) {
  const api = useApi();
  return useInventoryMutation(workspaceId, (id: string) => api.inventory.remove(workspaceId, id));
}

export function useBookInventory(workspaceId: string) {
  const api = useApi();
  return useInventoryMutation(workspaceId, (input: InventoryBookingInput) => api.inventory.book(workspaceId, input));
}

export function useUpdateInventoryBooking(workspaceId: string) {
  const api = useApi();
  return useInventoryMutation(workspaceId, ({ id, ...input }: UpdateInventoryBookingInput & { id: string }) =>
    api.inventory.updateBooking(workspaceId, id, input),
  );
}

export function useDeleteInventoryBooking(workspaceId: string) {
  const api = useApi();
  return useInventoryMutation(workspaceId, (id: string) => api.inventory.removeBooking(workspaceId, id));
}

// ---- Repeating tasks ----------------------------------------------------------------

export function useTaskRepeats(workspaceId: string, scope: "mine" | "team" = "mine", enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.taskRepeats(workspaceId, scope), queryFn: () => api.taskRepeats.list(workspaceId, scope), enabled });
}

function useWorkMutation<TInput, TResult>(workspaceId: string, fn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.work(workspaceId) });
      void qc.invalidateQueries({ queryKey: queryKeys.home(workspaceId) });
    },
  });
}

export function useCreateTaskRepeat(workspaceId: string) {
  const api = useApi();
  return useWorkMutation(workspaceId, (input: TaskRepeatInput) => api.taskRepeats.create(workspaceId, input));
}

export function useStopTaskRepeat(workspaceId: string) {
  const api = useApi();
  return useWorkMutation(workspaceId, (id: string) => api.taskRepeats.stop(workspaceId, id));
}

export function useCustomFields(workspaceId: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.customFields(workspaceId), queryFn: () => api.customFields.list(workspaceId), staleTime: 5 * 60_000 });
}

export function useSaveCustomFields(workspaceId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveCustomFieldsInput) => api.customFields.save(workspaceId, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.customFields(workspaceId) }),
  });
}

export function useBroadcasts(workspaceId: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.broadcasts(workspaceId), queryFn: () => api.broadcasts.list(workspaceId) });
}

export function useBroadcastAudience(workspaceId: string, audience: BroadcastInput["audience"] | null) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.broadcastAudience(workspaceId, audience ?? ""),
    queryFn: () => api.broadcasts.audience(workspaceId, audience!),
    enabled: !!audience,
  });
}

export function useBroadcast(workspaceId: string, id: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.broadcast(workspaceId, id), queryFn: () => api.broadcasts.get(workspaceId, id) });
}

export function useCreateBroadcast(workspaceId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BroadcastInput) => api.broadcasts.create(workspaceId, input),
    onSuccess: (made) => {
      qc.setQueryData(queryKeys.broadcast(workspaceId, made.id), made);
      void qc.invalidateQueries({ queryKey: queryKeys.broadcasts(workspaceId), exact: true });
    },
  });
}

export function useDeleteBroadcast(workspaceId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.broadcasts.remove(workspaceId, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: queryKeys.broadcasts(workspaceId) }),
  });
}

/** Ticks a person off; the list updates straight away so sending the next one is quick. */
export function useMarkBroadcastRecipient(workspaceId: string, broadcastId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ recipientId, ...input }: BroadcastRecipientInput & { recipientId: string }) => api.broadcasts.mark(workspaceId, broadcastId, recipientId, input),
    onSuccess: (r) => {
      qc.setQueryData<BroadcastDetail>(queryKeys.broadcast(workspaceId, broadcastId), (old) => {
        if (!old) return old;
        const recipients = old.recipients.map((x) => (x.id === r.id ? r : x));
        return {
          ...old,
          recipients,
          counts: { total: recipients.length, sent: recipients.filter((x) => x.sentAt).length, skipped: recipients.filter((x) => x.skippedAt).length },
        };
      });
      void qc.invalidateQueries({ queryKey: queryKeys.broadcasts(workspaceId), exact: true });
      void qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "broadcasts", "audience"] });
    },
  });
}

/** The business's own lists (payment modes, expense categories). Rarely change, so kept a while. */
export function useOptions(workspaceId: string) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.options(workspaceId), queryFn: () => api.options.list(workspaceId), staleTime: 5 * 60_000 });
}

function useOptionMutation<TInput>(workspaceId: string, fn: (input: TInput) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.options(workspaceId) });
      // Names show on payments and expenses, so those lists refresh too.
      void qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "bookings"] });
    },
  });
}

export function useAddOption(workspaceId: string) {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OptionInput) => api.options.add(workspaceId, input),
    onSuccess: (option) => {
      qc.setQueryData<CustomOption[]>(queryKeys.options(workspaceId), (old) =>
        old ? [...old.filter((o) => o.id !== option.id), option] : old,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.options(workspaceId) });
    },
  });
}

export function useUpdateOption(workspaceId: string) {
  const api = useApi();
  return useOptionMutation(workspaceId, ({ id, ...input }: UpdateOptionInput & { id: string }) => api.options.update(workspaceId, id, input));
}

export function useReorderOptions(workspaceId: string) {
  const api = useApi();
  return useOptionMutation(workspaceId, (input: { list: CustomOption["list"]; ids: string[] }) => api.options.reorder(workspaceId, input));
}

// ---- Invoice settings: saved notes and terms, bank accounts ------------------------

export function useSavedTexts(workspaceId: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.savedTexts(workspaceId), queryFn: () => api.savedTexts.list(workspaceId), enabled, staleTime: 5 * 60_000 });
}

function useInvoiceSettingsMutation<TInput, TResult>(workspaceId: string, key: readonly unknown[], fn: (input: TInput) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
      // A new invoice starts from the defaults.
      void qc.invalidateQueries({ queryKey: ["workspace", workspaceId, "bookings", "bill-draft"] });
    },
  });
}

export function useAddSavedText(workspaceId: string) {
  const api = useApi();
  return useInvoiceSettingsMutation(workspaceId, queryKeys.savedTexts(workspaceId), (input: SavedTextInput) => api.savedTexts.add(workspaceId, input));
}

export function useUpdateSavedText(workspaceId: string) {
  const api = useApi();
  return useInvoiceSettingsMutation(workspaceId, queryKeys.savedTexts(workspaceId), ({ id, ...input }: UpdateSavedTextInput & { id: string }) =>
    api.savedTexts.update(workspaceId, id, input),
  );
}

export function useDeleteSavedText(workspaceId: string) {
  const api = useApi();
  return useInvoiceSettingsMutation(workspaceId, queryKeys.savedTexts(workspaceId), (id: string) => api.savedTexts.remove(workspaceId, id));
}

export function useBankAccounts(workspaceId: string, enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.bankAccounts(workspaceId), queryFn: () => api.bankAccounts.list(workspaceId), enabled, staleTime: 5 * 60_000 });
}

export function useAddBankAccount(workspaceId: string) {
  const api = useApi();
  return useInvoiceSettingsMutation(workspaceId, queryKeys.bankAccounts(workspaceId), (input: BankAccountInput) => api.bankAccounts.add(workspaceId, input));
}

export function useUpdateBankAccount(workspaceId: string) {
  const api = useApi();
  return useInvoiceSettingsMutation(workspaceId, queryKeys.bankAccounts(workspaceId), ({ id, ...input }: UpdateBankAccountInput & { id: string }) =>
    api.bankAccounts.update(workspaceId, id, input),
  );
}
