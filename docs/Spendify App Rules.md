# Assay --- Coding Constitution

## 1. Product Architecture

-   Important financial calculations belong in the backend.
-   The LLM is not the financial source of truth.
-   Preserve provenance for important financial facts.
-   External integrations must be abstracted behind providers.
-   The 15-day prototype uses a MockAAProvider rather than depending on
    production AA onboarding.

## 2. React Native

-   Functional components only.
-   TypeScript everywhere.
-   Avoid `any`.
-   Define interfaces/types for component props and API responses.
-   Use custom hooks for reusable state/data logic.
-   Keep screens focused on composition and interaction.

## 3. Styling

-   Use shared theme tokens.
-   Do not hardcode colors inside components.
-   Follow the 8-point spacing system.
-   Do not introduce random gradients.
-   Use one icon family consistently.
-   Keep financial values single-line and readable.

## 4. Components

-   One clear responsibility per component.
-   Global reusable UI belongs in `components/ui`.
-   Feature-specific components belong in feature folders.
-   Do not duplicate common cards, buttons, typography, headers, or
    transaction rows.

## 5. FastAPI

Routes should only validate requests, authenticate, call services, and
return responses.

Business logic belongs in services. Database access belongs in
repositories/data-access modules. Third-party integrations belong behind
provider/service boundaries. Avoid raw SQL inside route handlers.

## 6. Financial Intelligence

Prefer deterministic code for: - sums; - averages; - category totals; -
savings rate; - recurring payments; - projections; - affordability; -
impact calculations.

Use AI where ambiguity exists: - merchant normalization; - ambiguous
categorization; - natural-language intent; - explanation.

## 7. Recommendations

Each recommendation should have:

``` text
id
title
reason
source_facts
action
baseline
assumption
projected_impact
confidence
```

Never present an LLM recommendation without structured context.

## 8. Confidence

Only show confidence where its meaning is defined, such as OCR,
categorization, or forecast confidence.

## 9. Privacy & Security

-   Never expose LLM/API secrets in the mobile app.
-   Do not log sensitive financial data unnecessarily.
-   Never commit `.env` files or secrets.
-   Use secure authentication/token storage.
-   Treat financial images and transaction data as sensitive.

## 10. Git

-   Never commit directly to `main`.
-   Use feature branches.
-   Keep commits focused.
-   Update `MEMORY.md` after significant work.

## 11. Documentation

Architecture changes require updates to PRD, ARCHITECTURE, DATABASE,
API_SPEC, and PHASES. Design changes require DESIGN_SYSTEM.
Implementation changes require MEMORY.

## 12. 15-Day Rule

Do not build infrastructure merely because it might be useful later.

Priority:

``` text
Working Financial Health Copilot
        >
Perfect infrastructure
```

Build the smallest architecture that demonstrates:
`data → understanding → prediction → recommendation → impact`
