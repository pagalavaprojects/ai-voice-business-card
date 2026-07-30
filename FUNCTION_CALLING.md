# Function Calling & LLM Tool Specification

## Registered Vapi Functions:
1. `save_lead`: Collects visitor contact details (`name`, `email`, `phone`, `budget`, `timeline`) and saves to `leads` table.
2. `book_appointment`: Schedules a call between visitor and employee in `appointments` table.
3. `search_products`: Executes GIN indexed PostgreSQL Full-Text Search on product catalog.
4. `search_services`: Fetches deliverables and pricing for company services.
5. `search_faqs`: Full-Text search on knowledge base FAQs.
6. `get_company_information`: Returns company website, name, and profile.
7. `get_employee_information`: Returns employee designation, office address, and working hours.
