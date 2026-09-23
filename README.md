# Company Analyzer Pro

Build a frontend-only MVP called “FSC Code Classifier” for an internal government-contracting sales tool.

Use a clean, modern enterprise SaaS style. Prioritize clarity and density over decorative design.

Stack:
React.js
TypeScript
Vite
Tailwind CSS

I will build the Python/FastAPI backend separately.
Do not implement backend logic, authentication, database, or external API calls.
Use mocked data only.

Create a single-page application.

Top section:
Company Information

Fields:
1. Company Name — required
2. Website URL — optional
3. Email Domain — optional
4. Additional Company Information — optional multiline textarea
5. PDF/document upload drag-and-drop area

Primary action:
Analyze Company

Show a realistic loading state while analyzing:
“Collecting company information”
“Extracting capabilities”
“Matching FSC codes”

After analysis, display two sections.

Section 1: Extracted Company Profile

Show:
Summary
Products
Services
Capabilities
Materials
Industries
Keywords

Products, services, capabilities, materials, industries and keywords should appear as editable chips/tags.

Include:
Edit Profile
Re-classify

Section 2: Recommended FSC Codes

Each recommendation should be shown as a card containing:

4-digit FSC code prominently
Official FSC description
Match score
Short rationale
Supporting evidence chips / quotes

Show 3–5 recommendations.

Also implement frontend states for:

Empty input validation
Website extraction warning
Document extraction warning
Analysis failure
No strong FSC match
Successful result

Use mocked data that demonstrates the UI but do not hardcode company-specific behavior.

Keep everything on one page.
Do not create authentication, dashboards, settings, analytics, inboxes, or unrelated pages.

The frontend will later call:

POST /api/analyze
POST /api/classify
GET /health

Design the components so mocked API calls can easily be replaced with real fetch calls later.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a6c55899-a6b7-4f71-9f88-28df12eaee54).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
