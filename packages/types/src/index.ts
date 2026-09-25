/**
 * Shared API contracts between @wedding-yantra/api and @wedding-yantra/web.
 * Anything that crosses the network boundary belongs here.
 */

// ---------------------------------------------------------------------------
// Generic response envelope
// ---------------------------------------------------------------------------

export interface ApiError {
  code: string;
  message: string;
}

export type ApiResponse<T> =
  | { success: true; data: T; timestamp: string }
  | { success: false; error: ApiError; timestamp: string };

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export type HealthStatus = "ok" | "degraded";

export interface SystemHealth {
  status: HealthStatus;
  service: string;
  version: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  database: {
    status: "up" | "down";
    latencyMs: number | null;
  };
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export const BOOKING_STATUSES = ["inquiry", "confirmed", "completed", "cancelled"] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export interface Booking {
  id: string;
  clientName: string;
  /** Calendar date of the event, `YYYY-MM-DD` (no timezone). */
  eventDate: string;
  venue: string;
  guestCount: number;
  status: BookingStatus;
  /** Contract value in INR. */
  totalAmount: number;
  /** ISO-8601 timestamp. */
  createdAt: string;
}
