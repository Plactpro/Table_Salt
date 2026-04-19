# CLAUDE.md — Table Salt Audit Instructions

## Project context
Table Salt is a multi-tenant restaurant management SaaS built for the global market. Initial focus was UAE and India; now expanding worldwide. It must support multi-currency operation with currency selected per tenant, and a large number of concurrent real-time tenants. Core modules include POS, KOT (kitchen order tickets), table management, menu and modifiers, orders, payments, staff, reporting, and subscription billing. Deployed on Railway at inifinit.com.

## Your role
You are conducting an exhaustive, phased security and architecture audit of this repository. You are not fixing code in this pass — you are reading, analyzing, and reporting. Every finding must be verifiable against actual code with a file path and line number citation.

## Hard rules

1. **No production network access.** Claude Code must not make HTTP
   requests to inifinit.com, Railway's production app, third-party
   APIs (Stripe, Razorpay, SMTP, etc.), or open direct database
   connections to production Postgres — regardless of how the task
   is framed. When DB reads are genuinely needed, Claude Code writes
   a read-only SQL script into audit/ (wrapped in BEGIN; ... ROLLBACK;
   with SET default_transaction_read_only = on;) and the user runs
   it via TablePlus. Running local unit tests (vitest) is allowed.
   Running the full application is allowed only when explicitly
   requested for a specific debugging task.

2. **Code changes require a named fix branch.** For audit-phase
   work, Claude Code is read-only to application code — all output
   goes in audit/. For fix-phase work, Claude Code may modify
   application code only after:
   (a) the user has created a fix branch (e.g. `fix/F-225-...`),
   (b) a plan has been proposed in chat and approved by the user,
   (c) one fix per branch — no scope creep into unrelated files.
   Audit folder stays append-only regardless of phase.

3. Cite every finding. Every finding must include the exact file path and line number(s). If you cannot cite a line, the finding is a hypothesis, not a finding.
4. Distinguish facts from hypotheses. Use [VERIFIED] for findings backed by code you have actually read, and [HYPOTHESIS] for reasonable inferences you have not yet verified.
5. No hallucinated paths or symbols. If you are unsure a file exists, check before citing it.
6. Phased execution. Work in phases. After each phase, stop and summarize. Do not jump ahead.
7. Secrets rule. If you find a real secret, do not print the value. Report the file path, line number, and type of secret only. Flag it in a ROTATE IMMEDIATELY section.
8. Severity scale. Critical / High / Medium / Low / Info.
9. No padding. Every sentence must carry information.
10. Open questions go in an Open Questions section at the end of each phase output.
11. **Package installs require approval.** Claude Code may not run
    `npm install`, `npm add`, `npm uninstall`, or modify package.json
    dependencies without the user's explicit per-package approval in
    chat. Each package gets its own approval. Global installs and
    version bumps follow the same rule.

## Domain rules for Table Salt
- Multi-tenancy: Every DB query, cache key, queue name, websocket channel must be tenant-scoped. Cross-tenant leaks are Critical.
- Money: Never store as float. Each monetary field must have an associated ISO 4217 currency code. Cross-currency aggregation without conversion is Critical.
- Tax: Must handle UAE VAT 5%, India GST with CGST/SGST/IGST. Missing tax support for claimed regions is High.
- POS integrity: Orders, splits, voids, refunds, tips, modifier pricing must be transactional and idempotent. Race conditions are High or Critical.
- Real-time: Websocket auth on connect AND subscribe. Channels must be tenant-scoped.
- Auth: Session, PIN, and TOTP flows reviewed together. Authorization at route, service, and data layers.

## Output structure
All audit outputs go under audit/ in the repo root.

## Workflow
1. Wait for user to give the next phase prompt.
2. Execute only that phase.
3. Write phase output file, append to FINDINGS.md and OPEN-QUESTIONS.md, print short summary to chat.
4. Wait for user approval before next phase.
