"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ENQUIRY_FORM_PATH } from "@/components/app/lead-sections";
import { Splash } from "@/components/ui/spinner";

/** The enquiry form moved under Leads; old links still land there. */
export default function OldEnquiryFormPage() {
  const router = useRouter();
  useEffect(() => router.replace(ENQUIRY_FORM_PATH), [router]);
  return <Splash />;
}
