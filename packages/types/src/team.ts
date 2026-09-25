import { z } from "zod";
import { phone, personName } from "./auth.js";
import { role } from "./workspaces.js";

export interface Member {
  id: string;
  userId: string;
  name: string | null;
  phone: string;
  role: z.infer<typeof role>;
  joinedAt: string;
  isYou: boolean;
}

export interface Invitation {
  id: string;
  name: string;
  phone: string;
  role: z.infer<typeof role>;
  invitedByName: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface Team {
  members: Member[];
  /** Only returned to people who can invite. */
  invitations: Invitation[];
}

export const createInvitationInput = z.object({
  name: personName,
  phone,
  role,
});
export type CreateInvitationInput = z.input<typeof createInvitationInput>;

export interface CreatedInvitation {
  invitation: Invitation;
  /** Shown once. The app turns it into a link to share on WhatsApp. */
  token: string;
}

export const updateMemberInput = z.object({ role });
export type UpdateMemberInput = z.input<typeof updateMemberInput>;

export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export interface InvitationPreview {
  workspaceName: string;
  businessTypeName: string;
  invitedByName: string | null;
  inviteeName: string;
  role: z.infer<typeof role>;
  phoneMasked: string;
  status: InvitationStatus;
}

export interface AcceptedInvitation {
  workspaceId: string;
}
