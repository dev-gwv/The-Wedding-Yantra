"use client";

import { useApi } from "@wedding-yantra/api-client/react";
import type { LeadExportQuery } from "@wedding-yantra/types";
import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import { useCurrentWorkspace } from "@/components/app/workspace-context";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/errors";

function save(base64: string, contentType: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * "Excel" and "CSV" downloads of the leads that match: one partner's QR code, a source, or
 * all of them. Google Sheets opens either: File, Import, Upload.
 */
export function LeadExportButtons({ query = {}, size = "sm" }: { query?: Omit<LeadExportQuery, "format">; size?: "sm" | "md" }) {
  const { workspace } = useCurrentWorkspace();
  const api = useApi();
  const toast = useToast();
  const [busy, setBusy] = useState<"xlsx" | "csv" | null>(null);

  async function run(format: "xlsx" | "csv") {
    setBusy(format);
    try {
      const file = await api.leads.export(workspace.id, { ...query, format });
      if (file.rows === 0) return toast("No leads to download yet", "error");
      save(file.data, file.contentType, file.filename);
      toast(`${file.rows} lead${file.rows === 1 ? "" : "s"} downloaded`);
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size={size} variant="secondary" loading={busy === "xlsx"} disabled={!!busy} onClick={() => void run("xlsx")}>
        <FileSpreadsheet className="size-4" /> Excel
      </Button>
      <Button size={size} variant="secondary" loading={busy === "csv"} disabled={!!busy} onClick={() => void run("csv")}>
        CSV
      </Button>
    </div>
  );
}
