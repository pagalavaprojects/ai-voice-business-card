"use client";

import React from "react";
import Image from "next/image";
import { Mail, Phone, Globe, MapPin, Clock } from "lucide-react";
import { Badge } from "@/shared/ui/badge";

interface EmployeeHeaderProps {
  name: string;
  designation: string;
  companyName: string;
  email: string;
  phone: string;
  website?: string;
  office?: string;
  workingHours?: string;
  avatarUrl?: string;
}

export const BusinessCardHeader: React.FC<EmployeeHeaderProps> = ({
  name,
  designation,
  companyName,
  email,
  phone,
  website,
  office,
  workingHours,
  avatarUrl,
}) => {
  return (
    <div className="flex flex-col items-center text-center space-y-3">
      {/* Avatar with Glow Ring */}
      <div className="relative">
        <div className="h-24 w-24 rounded-full border-2 border-sky-400/50 p-1 bg-gradient-to-br from-sky-500/20 to-indigo-500/20 shadow-lg shadow-sky-500/20">
          <div className="h-full w-full rounded-full bg-slate-800 flex items-center justify-center text-2xl font-bold text-sky-400 overflow-hidden">
            {avatarUrl ? (
              <Image src={avatarUrl} alt={name} width={96} height={96} className="h-full w-full object-cover" />
            ) : (
              name.split(" ").map((n) => n[0]).join("")
            )}
          </div>
        </div>
        <div className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-emerald-500 border-2 border-slate-900 shadow-md" />
      </div>

      {/* Name & Title */}
      <div>
        <h1 className="text-2xl font-extrabold text-slate-50 tracking-tight">{name}</h1>
        <p className="text-sm font-medium text-sky-400">{designation}</p>
        <p className="text-xs text-slate-400 font-medium mt-0.5">{companyName}</p>
      </div>

      {/* Badges for Working Hours / Location */}
      <div className="flex flex-wrap justify-center gap-2 pt-1">
        {office && (
          <Badge variant="outline" className="flex items-center gap-1 text-[11px]">
            <MapPin className="h-3 w-3 text-sky-400" />
            {office}
          </Badge>
        )}
        {workingHours && (
          <Badge variant="outline" className="flex items-center gap-1 text-[11px]">
            <Clock className="h-3 w-3 text-sky-400" />
            {workingHours}
          </Badge>
        )}
      </div>

      {/* Contact Quick Icons */}
      <div className="flex gap-3 pt-2">
        <a
          href={`mailto:${email}`}
          aria-label="Email Employee"
          className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 hover:text-sky-400 hover:bg-white/[0.08] transition-all"
        >
          <Mail className="h-4 w-4" />
        </a>
        <a
          href={`tel:${phone}`}
          aria-label="Call Employee Phone"
          className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 hover:text-sky-400 hover:bg-white/[0.08] transition-all"
        >
          <Phone className="h-4 w-4" />
        </a>
        {website && (
          <a
            href={website}
            target="_blank"
            rel="noreferrer"
            aria-label="Visit Company Website"
            className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 hover:text-sky-400 hover:bg-white/[0.08] transition-all"
          >
            <Globe className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
};
