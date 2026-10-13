import { Check, ChevronRight, CircleCheck, FlaskConical, Link2, Megaphone, Menu, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { GuidePictureKind } from "@/lib/facebook-guide";
import { cn } from "@/lib/cn";

/*
 * Small drawn phone screens for the Facebook guide. They're pictures, not screenshots, so they
 * never go out of date with an app update. The thing to tap is ringed in saffron with
 * "Tap here". Facebook's own screens are drawn plainly (no logo) and captioned as a likeness.
 */

const FB_BLUE = "bg-[#1b66d8]";

function Phone({ children, top, facebook }: { children: ReactNode; top: string; facebook?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-[290px] overflow-hidden rounded-[26px] border-[5px] border-ink/85 bg-surface shadow-soft" aria-hidden>
      <div className={cn("flex items-center gap-2 px-3 py-2 text-[11px] font-extrabold", facebook ? `${FB_BLUE} text-white` : "bg-cream text-brand-strong")}>
        <span className="truncate">{top}</span>
      </div>
      <div className="space-y-2 p-3 text-[12px] leading-snug text-ink">{children}</div>
    </div>
  );
}

/** The bit to tap: ringed, with a "Tap here" label. */
function Tap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative rounded-xl ring-[3px] ring-brand ring-offset-2 ring-offset-surface", className)}>
      <span className="absolute -top-2.5 right-2 z-10 rounded-full bg-brand px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-on-brand shadow-soft">
        Tap here
      </span>
      {children}
    </div>
  );
}

function Row({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-2", className)}>{children}</div>;
}

function Dot({ label, tone = "brand" }: { label: string; tone?: "brand" | "blue" | "ink" }) {
  return (
    <span
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-full text-[9px] font-extrabold",
        tone === "blue" ? `${FB_BLUE} text-white` : tone === "ink" ? "bg-ink/80 text-white" : "bg-gradient-primary text-on-brand",
      )}
    >
      {label}
    </span>
  );
}

function Box({ on }: { on: boolean }) {
  return (
    <span className={cn("grid size-4 shrink-0 place-items-center rounded border-2", on ? "border-[#1b66d8] bg-[#1b66d8] text-white" : "border-line-strong")}>
      {on && <Check className="size-3" strokeWidth={4} />}
    </span>
  );
}

function Toggle() {
  return (
    <span className={cn("relative ml-auto inline-flex h-4 w-7 shrink-0 rounded-full", FB_BLUE)}>
      <span className="absolute right-0.5 top-0.5 size-3 rounded-full bg-white" />
    </span>
  );
}

function FbButton({ children }: { children: ReactNode }) {
  return <div className={cn("rounded-lg py-2 text-center text-[12px] font-bold text-white", FB_BLUE)}>{children}</div>;
}

function WyButton({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1.5 rounded-lg py-2 text-center text-[12px] font-bold",
        light ? "border border-line bg-surface text-ink" : "bg-gradient-primary text-on-brand",
      )}
    >
      {children}
    </div>
  );
}

function Picture({ kind }: { kind: GuidePictureKind }) {
  switch (kind) {
    case "facebook-page":
      return (
        <Phone top="Facebook · Menu" facebook>
          <Row>
            <Dot label="RK" tone="ink" />
            <span className="font-bold">Riya Kapoor</span>
            <span className="ml-auto text-[10px] text-ink-muted">Your profile</span>
          </Row>
          <Tap>
            <Row className="font-bold">
              <Menu className="size-4" /> Pages <ChevronRight className="ml-auto size-4 text-ink-muted" />
            </Row>
          </Tap>
          <Row>
            <Dot label="SV" tone="blue" />
            <span>
              <span className="block font-bold">Shubh Vivah Weddings</span>
              <span className="text-[10px] text-ink-muted">Page · Wedding planner</span>
            </span>
          </Row>
        </Phone>
      );
    case "page-admin":
      return (
        <Phone top="business.facebook.com · Settings › Pages" facebook>
          <Row className="font-bold">
            <Dot label="SV" tone="blue" /> Shubh Vivah Weddings
          </Row>
          <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-ink-muted">People</p>
          <Tap>
            <Row>
              <Dot label="RK" tone="ink" />
              <span className="font-bold">Riya Kapoor</span>
              <span className="ml-auto rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">Full control</span>
            </Row>
          </Tap>
          <Row>
            <Dot label="AG" tone="ink" />
            <span>Ad agency</span>
            <span className="ml-auto text-[10px] text-ink-muted">Partial access</span>
          </Row>
        </Phone>
      );
    case "instagram-linked":
      return (
        <Phone top="Instagram · Accounts Centre">
          <p className="px-1 text-[10px] font-bold uppercase tracking-wide text-ink-muted">Accounts</p>
          <Row>
            <Dot label="IG" tone="ink" />
            <span className="font-bold">@shubhvivah</span>
            <span className="ml-auto text-[10px] text-ink-muted">Instagram</span>
          </Row>
          <div className="flex justify-center text-ink-muted">
            <Link2 className="size-4" />
          </div>
          <Tap>
            <Row>
              <Dot label="SV" tone="blue" />
              <span className="font-bold">Shubh Vivah Weddings</span>
              <span className="ml-auto text-[10px] text-ink-muted">Facebook</span>
            </Row>
          </Tap>
        </Phone>
      );
    case "lead-form":
      return (
        <Phone top="Your ad's form · Wedding enquiry" facebook>
          {["Full name", "Phone number", "City", "Wedding date"].map((f) => (
            <div key={f}>
              <span className="text-[10px] font-bold text-ink-muted">{f}</span>
              <div className="mt-0.5 h-6 rounded-md border border-line bg-cream/40" />
            </div>
          ))}
          <div>
            <span className="text-[10px] font-bold text-ink-muted">Budget</span>
            <div className="mt-1 flex flex-wrap gap-1">
              {["Under 5 lakh", "5–10 lakh", "10 lakh +"].map((b) => (
                <span key={b} className="rounded-full border border-line px-2 py-0.5 text-[10px]">
                  {b}
                </span>
              ))}
            </div>
          </div>
          <FbButton>Submit</FbButton>
        </Phone>
      );
    case "leads-card":
      return (
        <Phone top="Wedding Yantra · Leads">
          <p className="font-display text-[15px] font-extrabold">Leads</p>
          <div className="rounded-xl border border-sun-300/70 bg-cream p-2.5">
            <p className="flex items-center gap-1.5 font-bold">
              <Megaphone className="size-3.5 text-brand-strong" /> Get your Facebook & Instagram leads here
            </p>
            <p className="mt-0.5 text-[10px] text-ink-muted">5 easy steps, about 10 minutes</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <WyButton light>See how</WyButton>
              <Tap>
                <WyButton>Connect now</WyButton>
              </Tap>
            </div>
          </div>
        </Phone>
      );
    case "continue-button":
      return (
        <Phone top="Wedding Yantra · Facebook & Instagram leads">
          <p className="font-bold">Your lead ads, straight into Leads</p>
          <p className="text-[10px] text-ink-muted">Leads arrive here in seconds, with an alert.</p>
          <Tap className="mt-3">
            <WyButton>Continue with Facebook</WyButton>
          </Tap>
        </Phone>
      );
    case "facebook-login":
      return (
        <Phone top="Facebook" facebook>
          <div className="flex flex-col items-center gap-1.5 py-1 text-center">
            <Dot label="RK" tone="ink" />
            <p className="font-bold">Wedding Yantra is asking to connect to your Facebook</p>
            <p className="text-[10px] text-ink-muted">It can read leads from your lead forms. It can&apos;t post on your Page.</p>
          </div>
          <Tap>
            <FbButton>Continue as Riya</FbButton>
          </Tap>
          <p className="text-center text-[10px] font-bold text-ink-muted">Edit access</p>
        </Phone>
      );
    case "page-picker":
      return (
        <Phone top="Facebook · Choose Pages" facebook>
          <p className="font-bold">Which Pages can Wedding Yantra use?</p>
          <Tap>
            <Row>
              <Box on /> <span className="font-bold">Shubh Vivah Weddings</span>
            </Row>
          </Tap>
          <Row>
            <Box on={false} /> <span className="text-ink-muted">Riya&apos;s Kitchen</span>
          </Row>
          <p className="px-1 pt-1 text-[10px] font-bold uppercase tracking-wide text-ink-muted">Keep all of these ON</p>
          {["Read your Page's lead forms", "Manage your Page's lead forms", "Read leads"].map((p) => (
            <div key={p} className="flex items-center gap-2 px-1 text-[11px]">
              {p}
              <Toggle />
            </div>
          ))}
          <FbButton>Save</FbButton>
        </Phone>
      );
    case "switch-on":
      return (
        <Phone top="Wedding Yantra · Facebook & Instagram leads">
          <p className="font-bold">Which Pages run your lead ads?</p>
          <Row>
            <span className="grid size-4 shrink-0 place-items-center rounded-full bg-brand text-on-brand">
              <Check className="size-3" strokeWidth={4} />
            </span>
            <span className="font-bold">Shubh Vivah Weddings</span>
          </Row>
          <Tap>
            <WyButton>Switch on 1 Page</WyButton>
          </Tap>
          <div className="flex items-center gap-1.5 px-1 pt-1">
            <span className="font-bold">Shubh Vivah Weddings</span>
            <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-bold text-success">Receiving leads</span>
          </div>
        </Phone>
      );
    case "who-gets":
      return (
        <Phone top="Wedding Yantra · Who gets these leads">
          <Tap>
            <Row className="border-brand/50 bg-cream">
              <span className="grid size-4 shrink-0 place-items-center rounded-full border-[5px] border-brand bg-surface" />
              <span className="font-bold">Everyone with the Leads screen</span>
            </Row>
          </Tap>
          <Row>
            <span className="size-4 shrink-0 rounded-full border-2 border-line-strong" />
            <span>Only the people I pick</span>
          </Row>
          <div className="rounded-lg bg-cream px-2.5 py-2">
            <p className="flex items-center gap-1 text-[10px] font-bold text-ink-muted">
              <Users className="size-3" /> Leads go to
            </p>
            {[
              ["Kabir Mehta", "1 open lead"],
              ["Neha Joshi", "2 open leads"],
            ].map(([n, c]) => (
              <p key={n} className="mt-1 flex justify-between text-[11px]">
                <span className="font-bold">{n}</span>
                <span className="text-ink-muted">{c}</span>
              </p>
            ))}
          </div>
        </Phone>
      );
    case "test-lead":
      return (
        <Phone top="Wedding Yantra · Lead forms">
          <Row className="font-bold">Wedding enquiry</Row>
          <Tap>
            <WyButton light>
              <FlaskConical className="size-3.5" /> Send a test lead
            </WyButton>
          </Tap>
          <p className="flex items-center gap-1.5 rounded-lg bg-success-soft px-2.5 py-2 text-[11px] font-bold text-success">
            <CircleCheck className="size-3.5" /> Test lead received in 3 s · Open it
          </p>
        </Phone>
      );
  }
}

const FACEBOOK_SCREENS: GuidePictureKind[] = ["facebook-page", "page-admin", "instagram-linked", "lead-form", "facebook-login", "page-picker"];

/** One drawn screen with a short caption. */
export function GuidePicture({ kind }: { kind: GuidePictureKind }) {
  return (
    <figure className="w-full">
      <Picture kind={kind} />
      {FACEBOOK_SCREENS.includes(kind) && (
        <figcaption className="mt-2 text-center text-xs text-ink-muted">Facebook&apos;s screen looks like this. The words may differ a little.</figcaption>
      )}
    </figure>
  );
}
