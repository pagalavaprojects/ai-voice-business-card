"use client";

import React from "react";
import { Mic, MicOff, PhoneOff, Calendar, Download } from "lucide-react";
import { Button } from "@/shared/ui/button";

interface CallControlsProps {
  isActive: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onEndCall: () => void;
  onBookCall: () => void;
  /** Employee contact data used for vCard download */
  contactInfo?: {
    name: string;
    email: string;
    phone: string;
    company: string;
    designation: string;
    website?: string;
  };
}

function generateVCard(contact: NonNullable<CallControlsProps["contactInfo"]>): string {
  const nameParts = contact.name.split(" ");
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
  const firstName = nameParts[0];

  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${contact.name}`,
    `N:${lastName};${firstName};;;`,
    `EMAIL;TYPE=WORK:${contact.email}`,
    `TEL;TYPE=WORK,VOICE:${contact.phone}`,
    `ORG:${contact.company}`,
    `TITLE:${contact.designation}`,
    contact.website ? `URL:${contact.website}` : "",
    `NOTE:Connected via AI Voice Business Card`,
    "END:VCARD",
  ]
    .filter(Boolean)
    .join("\r\n");
}

export const CallControls: React.FC<CallControlsProps> = ({
  isActive,
  isMuted,
  onToggleMute,
  onEndCall,
  onBookCall,
  contactInfo,
}) => {
  const handleSaveContact = () => {
    if (!contactInfo) return;

    const vcard = generateVCard(contactInfo);
    const blob = new Blob([vcard], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${contactInfo.name.replace(/\s+/g, "_")}.vcf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {isActive && (
        <div className="flex justify-center gap-3">
          <Button
            variant="glass"
            size="icon"
            onClick={onToggleMute}
            aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
            className="rounded-full h-12 w-12"
          >
            {isMuted ? <MicOff className="h-5 w-5 text-rose-400" /> : <Mic className="h-5 w-5 text-sky-400" />}
          </Button>
          <Button
            variant="danger"
            size="icon"
            onClick={onEndCall}
            aria-label="End call"
            className="rounded-full h-12 w-12"
          >
            <PhoneOff className="h-5 w-5" />
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 pt-2">
        <Button variant="default" onClick={onBookCall} className="w-full flex items-center justify-center gap-2 text-xs">
          <Calendar className="h-4 w-4" />
          Book Meeting
        </Button>
        <Button
          variant="glass"
          onClick={handleSaveContact}
          disabled={!contactInfo}
          className="w-full flex items-center justify-center gap-2 text-xs"
          title={contactInfo ? `Save ${contactInfo.name}&apos;s contact` : "Contact info unavailable"}
        >
          <Download className="h-4 w-4" />
          Save Contact
        </Button>
      </div>
    </div>
  );
};
