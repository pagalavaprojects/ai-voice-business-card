import React from "react";
import { UserCheck } from "lucide-react";
import { Card } from "@/shared/ui/card";

/**
 * What a brand-new account sees.
 *
 * Signing up creates an identity, not a membership: joining a workspace is
 * the workspace's decision, so a self-registered account deliberately owns
 * no company. Without this, that entirely normal state rendered as a red
 * "not linked to a company" API failure — an error message describing
 * something that is not an error.
 *
 * It shows no data and offers no action that could create a company, because
 * neither would be true for this account.
 */
export function UnlinkedAccountNotice({ email }: { email: string }) {
  return (
    <div className="max-w-xl mx-auto py-10">
      <Card className="glass-panel border-white/[0.08] p-8 rounded-2xl text-center space-y-4">
        <div className="h-12 w-12 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mx-auto">
          <UserCheck className="h-6 w-6 text-sky-400" aria-hidden="true" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-bold text-slate-100">You&apos;re signed in</h1>
          <p className="text-xs text-slate-400">
            Your account <span className="text-slate-200">{email}</span> isn&apos;t part of a workspace yet.
          </p>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Ask an owner or admin of your company to add you to their workspace. As soon as they do, your dashboard will
          show your own calls, leads and appointments here.
        </p>
      </Card>
    </div>
  );
}
