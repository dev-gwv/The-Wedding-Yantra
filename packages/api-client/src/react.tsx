/**
 * TanStack Query hooks for every API call. Uses only React and TanStack Query, so the
 * mobile app (React Native) can import this file unchanged.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import type {
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
  return useQuery({ queryKey: queryKeys.lead(workspaceId, leadId), queryFn: () => api.leads.get(workspaceId, leadId) });
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
  return useQuery({ queryKey: queryKeys.client(workspaceId, clientId), queryFn: () => api.clients.get(workspaceId, clientId) });
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
