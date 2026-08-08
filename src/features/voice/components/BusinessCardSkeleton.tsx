import React from "react";
import { Card } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";

/**
 * Enterprise loading skeleton for PublicBusinessCard.
 * Matches exact geometry of the rendered card to prevent any Cumulative Layout Shift (CLS = 0).
 */
export const BusinessCardSkeleton: React.FC = () => {
  return (
    <main id="main-content" className="min-h-screen bg-[#070b12] text-slate-100 py-6 px-4 sm:py-10">
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[34rem] h-[34rem] bg-sky-500/10 blur-[140px] rounded-full" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500/[0.07] blur-[130px] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-lg mx-auto space-y-4">
        {/* Main Identity & Voice Card Skeleton */}
        <Card className="relative glass-panel border-white/[0.08] shadow-2xl rounded-3xl p-6 sm:p-8 space-y-6">
          {/* Top Right Selector Skeleton */}
          <Skeleton className="absolute right-4 top-4 sm:right-5 sm:top-5 h-8 w-24 rounded-full" />

          {/* Logo Skeleton */}
          <div className="flex justify-center pt-2">
            <Skeleton className="h-10 w-36 rounded-2xl" />
          </div>

          {/* Profile & Avatar */}
          <div className="flex flex-col items-center text-center space-y-3">
            <Skeleton className="h-32 w-32 sm:h-36 sm:w-36 rounded-full" />
            <div className="space-y-2 flex flex-col items-center">
              <Skeleton className="h-7 w-48 rounded-lg" />
              <Skeleton className="h-4 w-36 rounded-md" />
              <Skeleton className="h-3 w-24 rounded-md" />
            </div>
            <Skeleton className="h-6 w-32 rounded-full" />
          </div>

          {/* Voice Mic Section Skeleton */}
          <div className="flex flex-col items-center pt-2 border-t border-white/[0.06] space-y-4">
            <Skeleton className="h-20 w-20 rounded-full mt-4" />
            <Skeleton className="h-4 w-44 rounded-md" />
            <Skeleton className="h-3 w-64 rounded-md" />
          </div>

          {/* Try Asking Section Skeleton */}
          <div className="border-t border-white/[0.06] pt-4 space-y-2">
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="h-9 w-full rounded-xl" />
            <Skeleton className="h-9 w-full rounded-xl" />
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
        </Card>

        {/* Actions Card Skeleton */}
        <Card className="glass-panel border-white/[0.08] rounded-3xl p-6 space-y-3">
          <Skeleton className="h-11 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-10 w-full rounded-xl" />
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Skeleton className="h-9 w-full rounded-xl" />
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
        </Card>

        {/* Tagline Skeleton */}
        <div className="flex justify-center pb-4">
          <Skeleton className="h-3 w-48 rounded" />
        </div>
      </div>
    </main>
  );
};
