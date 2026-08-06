import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Mic, Users, Calendar, Shield, ArrowRight, Zap } from "lucide-react";
import { DEMO_COMPANY_ID, DEMO_EMPLOYEE_ID } from "@/shared/lib/demoCard";

export const metadata: Metadata = {
  title: "AI Voice Business Card — Enterprise AI Employee Platform",
  description:
    "Replace static business cards with autonomous AI voice employees that qualify leads, book meetings, and grow your pipeline 24/7.",
};

const features = [
  {
    icon: Mic,
    title: "Live Voice AI",
    description: "WebRTC-powered real-time voice conversations with your AI digital twin.",
    color: "text-sky-400",
    bg: "bg-sky-500/10 border-sky-500/20",
  },
  {
    icon: Users,
    title: "Lead Qualification",
    description: "AI scores and qualifies every visitor automatically using your business criteria.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  },
  {
    icon: Calendar,
    title: "Auto Booking",
    description: "Visitors book real meetings via Cal.com directly through the voice conversation.",
    color: "text-indigo-400",
    bg: "bg-indigo-500/10 border-indigo-500/20",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Row-level database security, RBAC, CSRF protection, and full OWASP compliance.",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
  },
];

const stats = [
  { value: "< 1s", label: "Voice response latency" },
  { value: "24/7", label: "Always-on AI availability" },
  { value: "99.9%", label: "Target SLA uptime" },
  { value: "100%", label: "Lead data captured" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#090d16] text-slate-100 relative overflow-hidden">
      {/* Glow Background */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-sky-500/5 blur-[150px] rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-indigo-500/5 blur-[120px] rounded-full" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 border-b border-white/[0.06] bg-[#090d16]/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-sky-500/30">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-bold text-slate-100 tracking-tight">VoiceCard AI</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="text-xs font-medium text-slate-400 hover:text-slate-100 transition-colors px-3 py-1.5"
            >
              Dashboard
            </Link>
            <Link
              href={`/${DEMO_COMPANY_ID}/${DEMO_EMPLOYEE_ID}`}
              className="glass-button px-4 py-2 rounded-xl text-xs font-semibold text-sky-400 flex items-center gap-1.5"
            >
              <Zap className="h-3.5 w-3.5" />
              Try Demo
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-400 text-[11px] font-semibold tracking-wide mb-8">
          <div className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse" />
          Enterprise AI Voice Platform — v1.0
        </div>

        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-6 leading-[1.1]">
          Your Business Card,{" "}
          <span className="bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">
            Now Speaks Back
          </span>
        </h1>

        <p className="text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Replace static QR codes with autonomous AI voice employees. Qualify leads, book meetings, and grow your
          pipeline — 24 hours a day, in any language.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href={`/${DEMO_COMPANY_ID}/${DEMO_EMPLOYEE_ID}`}
            className="inline-flex items-center gap-2 bg-sky-700 hover:bg-sky-800 text-white px-7 py-3.5 rounded-2xl text-sm font-semibold shadow-xl shadow-sky-500/25 transition-all active:scale-[0.98]"
          >
            <Mic className="h-4 w-4" />
            Talk to Demo AI Twin
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 glass-button px-7 py-3.5 rounded-2xl text-sm font-semibold text-slate-200"
          >
            Open Admin Dashboard
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section className="relative z-10 max-w-5xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="glass-panel rounded-2xl p-5 text-center"
            >
              <div className="text-3xl font-extrabold text-sky-400 font-mono">{stat.value}</div>
              <div className="text-xs text-slate-400 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pb-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold text-slate-100 mb-3">Enterprise-Grade by Default</h2>
          <p className="text-sm text-slate-400 max-w-lg mx-auto">
            Every feature built for reliability, security, and scale from day one.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feat) => {
            const Icon = feat.icon;
            return (
              <div key={feat.title} className="glass-panel rounded-2xl p-6 space-y-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${feat.bg}`}>
                  <Icon className={`h-5 w-5 ${feat.color}`} />
                </div>
                <h3 className="font-bold text-sm text-slate-100">{feat.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{feat.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] py-6">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-400">
          <span>&copy; {new Date().getFullYear()} AI Voice Business Card Platform. All rights reserved.</span>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="hover:text-slate-300 transition-colors">Admin</Link>
            <Link href={`/${DEMO_COMPANY_ID}/${DEMO_EMPLOYEE_ID}`} className="hover:text-slate-300 transition-colors">Demo</Link>
            <a href="/api/health" className="hover:text-slate-300 transition-colors">Health</a>
          </div>
        </div>
      </footer>
    </main>
  );
}
