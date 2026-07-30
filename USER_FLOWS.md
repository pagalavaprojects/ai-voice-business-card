# User Journey Flows & Transitions

## 1. Visitor Public Journey
```text
[ QR Code / NFC Card ]
       │
       ▼
[ Public URL: /[companyId]/[employeeId] ]
       │
       ▼
[ Employee Twin Header ] ──( View Profile / vCard )
       │
       ▼
[ Click "Talk to Assistant" ]
       │
       ▼
[ Microphone Permission Request ]
       │
       ├──( Allowed )──► [ WebRTC Connection Established ]
       │                        │
       │                        ▼
       │               [ Voice Conversation (Listening / Speaking) ]
       │                        │
       │                        ├──► [ Lead Info Saved via Tool ]
       │                        │
       │                        └──► [ Appointment Scheduled via Tool ]
       │                                 │
       │                                 ▼
       │                        [ Call Summary Card ]
       │
       └──( Denied )───► [ Fallback Text / Form Modal ]
```

## 2. Admin SaaS Journey
```text
[ Admin Login ] ──► [ Overview Dashboard ]
                         │
                         ├──► [ Leads Management ] ──► [ Filter HIGH Scores / Export CSV ]
                         ├──► [ Knowledge Base ] ──► [ Add Products / FAQs ]
                         ├──► [ Prompt Editor ]  ──► [ Edit Modules / Version History ]
                         └──► [ System Settings ] ──► [ Vapi Keys / Branding ]
```
