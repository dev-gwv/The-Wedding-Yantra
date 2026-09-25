"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApiResponse, Booking, BookingStatus, SystemHealth } from "@wedding-yantra/types";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const REFRESH_MS = 30_000;

type Loadable<T> =
  | { state: "loading" }
  | { state: "ready"; data: T }
  | { state: "error"; message: string };

async function fetchApi<T>(path: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { signal, cache: "no-store" });
  // Health returns 503 with a valid body when degraded, so parse before checking `ok`.
  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!body) throw new Error(`HTTP ${res.status} from ${path}`);
  if (!body.success) throw new Error(body.error.message);
  return body.data;
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const formatDate = (isoDate: string) =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function formatUptime(totalSeconds: number) {
  const d = Math.floor(totalSeconds / 86_400);
  const h = Math.floor((totalSeconds % 86_400) / 3_600);
  const m = Math.floor((totalSeconds % 3_600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const STATUS_STYLES: Record<BookingStatus, string> = {
  inquiry: "bg-amber-50 text-amber-800 ring-amber-600/20",
  confirmed: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  completed: "bg-sky-50 text-sky-800 ring-sky-600/20",
  cancelled: "bg-stone-100 text-stone-600 ring-stone-500/20",
};

export default function DashboardPage() {
  const [health, setHealth] = useState<Loadable<SystemHealth>>({ state: "loading" });
  const [bookings, setBookings] = useState<Loadable<Booking[]>>({ state: "loading" });
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const load = useCallback(async (signal: AbortSignal) => {
    const [h, b] = await Promise.allSettled([
      fetchApi<SystemHealth>("/api/health", signal),
      fetchApi<Booking[]>("/api/bookings", signal),
    ]);
    if (signal.aborted) return;

    setHealth(
      h.status === "fulfilled"
        ? { state: "ready", data: h.value }
        : { state: "error", message: (h.reason as Error).message },
    );
    setBookings(
      b.status === "fulfilled"
        ? { state: "ready", data: b.value }
        : { state: "error", message: (b.reason as Error).message },
    );
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    let controller = new AbortController();
    void load(controller.signal);
    const id = setInterval(() => {
      controller.abort();
      controller = new AbortController();
      void load(controller.signal);
    }, REFRESH_MS);
    return () => {
      clearInterval(id);
      controller.abort();
    };
  }, [load]);

  const refresh = () => void load(new AbortController().signal);

  const stats = useMemo(() => {
    if (bookings.state !== "ready") return null;
    const today = new Date().toISOString().slice(0, 10);
    const active = bookings.data.filter((b) => b.status !== "cancelled");
    const upcoming = active.filter((b) => b.eventDate >= today);
    return {
      total: bookings.data.length,
      confirmed: bookings.data.filter((b) => b.status === "confirmed").length,
      upcomingGuests: upcoming.reduce((sum, b) => sum + b.guestCount, 0),
      pipelineValue: active.reduce((sum, b) => sum + b.totalAmount, 0),
    };
  }, [bookings]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium tracking-wide text-brand-600 uppercase">Wedding Yantra</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Operations Dashboard</h1>
          <p className="mt-1 text-sm text-stone-500">
            API: <code className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{API_URL}</code>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-stone-500">
              Updated {lastUpdated.toLocaleTimeString("en-IN")}
            </span>
          )}
          <button
            type="button"
            onClick={refresh}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            Refresh
          </button>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <HealthCard health={health} />
        <div className="grid grid-cols-2 gap-4 lg:col-span-2">
          <StatCard label="Total bookings" value={stats?.total} />
          <StatCard label="Confirmed" value={stats?.confirmed} />
          <StatCard label="Upcoming guests" value={stats?.upcomingGuests.toLocaleString("en-IN")} />
          <StatCard
            label="Pipeline value"
            value={stats ? inr.format(stats.pipelineValue) : undefined}
          />
        </div>
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-6 py-4">
          <h2 className="text-lg font-semibold">Bookings</h2>
        </div>
        <BookingsTable bookings={bookings} />
      </section>
    </main>
  );
}

function HealthCard({ health }: { health: Loadable<SystemHealth> }) {
  const tone =
    health.state === "ready"
      ? health.data.status === "ok"
        ? { dot: "bg-emerald-500", label: "Operational", text: "text-emerald-700" }
        : { dot: "bg-amber-500", label: "Degraded", text: "text-amber-700" }
      : health.state === "error"
        ? { dot: "bg-red-500", label: "Unreachable", text: "text-red-700" }
        : { dot: "bg-stone-300 animate-pulse", label: "Checking…", text: "text-stone-500" };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-stone-500">Backend health</h2>
        <span className={`flex items-center gap-2 text-sm font-medium ${tone.text}`}>
          <span className={`h-2.5 w-2.5 rounded-full ${tone.dot}`} />
          {tone.label}
        </span>
      </div>

      {health.state === "error" && (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{health.message}</p>
      )}

      {health.state === "ready" && (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Detail label="Database" value={health.data.database.status === "up" ? "Connected" : "Down"} />
          <Detail
            label="DB latency"
            value={health.data.database.latencyMs !== null ? `${health.data.database.latencyMs} ms` : "—"}
          />
          <Detail label="Uptime" value={formatUptime(health.data.uptimeSeconds)} />
          <Detail label="Version" value={health.data.version.slice(0, 7)} />
          <Detail label="Environment" value={health.data.environment} />
          <Detail label="Service" value={health.data.service} />
        </dl>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-stone-500">{label}</dt>
      <dd className="mt-0.5 truncate font-medium text-stone-900">{value}</dd>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-stone-500">{label}</p>
      {value === undefined ? (
        <div className="mt-2 h-8 w-24 animate-pulse rounded bg-stone-100" />
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      )}
    </div>
  );
}

function BookingsTable({ bookings }: { bookings: Loadable<Booking[]> }) {
  if (bookings.state === "loading") {
    return <p className="px-6 py-10 text-center text-sm text-stone-500">Loading bookings…</p>;
  }
  if (bookings.state === "error") {
    return (
      <p className="px-6 py-10 text-center text-sm text-red-700">
        Could not load bookings: {bookings.message}
      </p>
    );
  }
  if (bookings.data.length === 0) {
    return <p className="px-6 py-10 text-center text-sm text-stone-500">No bookings yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-stone-200 text-sm">
        <thead className="bg-stone-50 text-left text-xs font-medium tracking-wide text-stone-500 uppercase">
          <tr>
            <th className="px-6 py-3">Client</th>
            <th className="px-6 py-3">Event date</th>
            <th className="px-6 py-3">Venue</th>
            <th className="px-6 py-3 text-right">Guests</th>
            <th className="px-6 py-3 text-right">Value</th>
            <th className="px-6 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {bookings.data.map((b) => (
            <tr key={b.id} className="hover:bg-stone-50">
              <td className="px-6 py-4 font-medium whitespace-nowrap">{b.clientName}</td>
              <td className="px-6 py-4 whitespace-nowrap text-stone-600">{formatDate(b.eventDate)}</td>
              <td className="px-6 py-4 text-stone-600">{b.venue}</td>
              <td className="px-6 py-4 text-right tabular-nums">{b.guestCount.toLocaleString("en-IN")}</td>
              <td className="px-6 py-4 text-right tabular-nums">{inr.format(b.totalAmount)}</td>
              <td className="px-6 py-4">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_STYLES[b.status]}`}
                >
                  {b.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
