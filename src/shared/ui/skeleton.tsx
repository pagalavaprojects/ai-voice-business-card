import React from "react";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/**
 * Enterprise-grade Skeleton component with glassmorphic styling and subtle shimmering animation.
 * Used to eliminate Layout Shift (CLS = 0) while content is loading.
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className = "", style, ...props }) => {
  return (
    <div
      className={`animate-pulse rounded-xl bg-white/[0.06] border border-white/[0.04] ${className}`}
      style={style}
      aria-hidden="true"
      {...props}
    />
  );
};
