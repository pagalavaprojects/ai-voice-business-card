# Complete Screen Specifications

## 1. Public AI Voice Business Card (`/(public)/[companyId]/[employeeId]`)
- **Header**: Employee Avatar, Full Name, Designation, Company Name, Social Links (LinkedIn, Website, Email).
- **Core Area**: Floating glass container with status indicator pill, central pulse mic button, and real-time audio waveform.
- **Transcript Area**: Collapsible transcript panel showing live speech-to-text messages.
- **Action Footer**: Quick buttons for "Download vCard", "Schedule Call", "Email Direct".

## 2. Admin Dashboard Overview (`/(admin)/dashboard`)
- **Top Row Metrics**: Total Conversations, Qualified Leads, Booked Appointments, Average Duration.
- **Charts Row**: Conversation Volume (Area Chart), Lead Score Distribution (Bar Chart).
- **Recent Activity Table**: Latest 5 qualified leads with score badges and one-click actions.

## 3. Lead Management Screen (`/(admin)/dashboard/leads`)
- **Controls Bar**: Search input, Status filter (`NEW`, `QUALIFIED`, `BOOKED`), Export CSV button.
- **Table Columns**: Name, Email & Phone, Score Badge (`HIGH`/`MEDIUM`/`LOW`), Industry, Problem Summary, Date.

## 4. Knowledge Management Screen (`/(admin)/dashboard/knowledge`)
- **Tabs**: Products, Services, FAQs.
- **Product List**: Glass card grid with inline edit/delete modals.
- **FAQ List**: Accordion viewer with add/search capability.

## 5. Prompt Editor Screen (`/(admin)/dashboard/prompts`)
- **Module Selector**: Tabs for `identity`, `sales`, `knowledge`, `security`, `qualification`.
- **Editor Area**: Syntax-highlighted text area with variable chips (`{{employee_name}}`, `{{company_name}}`).
- **Actions**: "Save Draft", "Test Prompt", "Publish Version".
