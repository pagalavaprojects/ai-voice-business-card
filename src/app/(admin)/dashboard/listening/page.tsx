"use client";

import React from "react";
import { ListeningAnalytics } from "@/features/dashboard/components/ListeningAnalytics";

/**
 * Item 14 — ONE simple page: per-user listening (Introduction, Replay,
 * Elevator, Service, Why Us, Smart AI Lead), unique listeners today / 7 days,
 * a compact visual, and per-user data points DP1–DP6. Nothing else lives
 * here; the operational numbers stay on Overview and Analytics.
 *
 * Authorization is server-side (the analytics endpoint scopes every row to
 * the signed-in user's company, or their own employee for staff); this page
 * only renders what that endpoint returns.
 */
export default function ListeningAnalyticsPage() {
  return (
    <div className="space-y-6">
      <ListeningAnalytics variant="full" />
    </div>
  );
}
