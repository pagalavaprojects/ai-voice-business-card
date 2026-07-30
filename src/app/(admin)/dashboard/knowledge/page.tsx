"use client";

import React, { useState } from "react";
import { BookOpen, Plus, HelpCircle, ShoppingBag } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { useToast } from "@/shared/ui/toast";

export default function KnowledgeBasePage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<"products" | "faqs">("products");

  const handleAddItem = () => {
    showToast("Knowledge item editor coming soon — connect Supabase to enable.", "info");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 tracking-tight">Knowledge Base & RAG Engine</h1>
          <p className="text-xs text-slate-400">Manage company products, FAQs, and pgvector RAG embedding chunks.</p>
        </div>
        <Button variant="default" onClick={handleAddItem} className="flex items-center gap-2 text-xs">
          <Plus className="h-4 w-4" />
          Add Knowledge Item
        </Button>
      </div>

      <div className="flex gap-2 border-b border-white/[0.08] pb-3">
        <Button
          variant={activeTab === "products" ? "default" : "glass"}
          onClick={() => setActiveTab("products")}
          className="text-xs flex items-center gap-2"
        >
          <ShoppingBag className="h-4 w-4" />
          Products & Services (2)
        </Button>
        <Button
          variant={activeTab === "faqs" ? "default" : "glass"}
          onClick={() => setActiveTab("faqs")}
          className="text-xs flex items-center gap-2"
        >
          <HelpCircle className="h-4 w-4" />
          FAQs & Answers (3)
        </Button>
      </div>

      {activeTab === "products" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="glass-panel border-white/[0.08] p-5 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-slate-100 text-sm">Enterprise Voice AI Platform</h3>
                <p className="text-xs text-sky-400 font-mono">$49.00 / month</p>
              </div>
              <Badge variant="success">Active RAG</Badge>
            </div>
            <p className="text-xs text-slate-400">Autonomous digital twin employees for voice conversations and meeting booking.</p>
          </Card>

          <Card className="glass-panel border-white/[0.08] p-5 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-slate-100 text-sm">Custom AI Agent Fine-Tuning</h3>
                <p className="text-xs text-sky-400 font-mono">$299.00 / one-time</p>
              </div>
              <Badge variant="success">Active RAG</Badge>
            </div>
            <p className="text-xs text-slate-400">Custom voice clone model training and company knowledge base embedding.</p>
          </Card>
        </div>
      ) : (
        <div className="space-y-3">
          <Card className="glass-panel border-white/[0.08] p-4 space-y-1">
            <h4 className="font-bold text-slate-100 text-xs">Q: How does the AI voice assistant book meetings?</h4>
            <p className="text-xs text-slate-400">A: The AI assistant executes the book_appointment function tool during the call, querying Cal.com for real-time calendar availability.</p>
          </Card>
          <Card className="glass-panel border-white/[0.08] p-4 space-y-1">
            <h4 className="font-bold text-slate-100 text-xs">Q: Is visitor data secure and isolated?</h4>
            <p className="text-xs text-slate-400">A: Yes, all lead records are stored in PostgreSQL with company-isolated Row Level Security (RLS) policies.</p>
          </Card>
        </div>
      )}
    </div>
  );
}
