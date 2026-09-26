/**
 * The business's logo is public: it's on every quote, bill and form clients open. Its
 * link names the file, so a new logo gets a new link and browsers can keep it for good.
 */
export const logoPath = (workspaceId: string, fileId: string | null): string | null =>
  fileId ? `/api/v1/public/logos/${workspaceId}/${fileId}` : null;
