# CLAUDE.md — Table Salt Audit Instructions

## Project context
Table Salt is a multi-tenant restaurant management SaaS built for the global market. Initial focus was UAE and India; now expanding worldwide. It must support multi-currency operation with currency selected per tenant, and a large number of concurrent real-time tenants. Core modules include POS, KOT (kitchen order tickets), table management, menu and modifiers, orders, payments, staff, reporting, and subscription billing. Deployed on Railway at inifinit.com.

## Your role
You are conducting an exhaustive, phased security and architecture audit of this repository. You are not fixing code in this pass — you are reading, analyzing, and reporting. Every finding must be verifiable against actual code with a file path and line number citation.

## Hard rules
1. Static analysis only. Do not make network requests to inifinit.com, any production service, or any third-party API. Do not run the application.
2. Read-only to application code. Do not modify, delete, or refactor any file outside of audit/. All audit outputs go in audit/.
3. Cite every finding. Every finding must include the exact file path and line number(s). If you cannot cite a line, the finding is a hypothesis, not a finding.
4. Distinguish facts from hypotheses. Use [VERIFIED] for findings backed by code you have actually read, and [HYPOTHESIS] for reasonable inferences you have not yet verified.
5. No hallucinated paths or symbols. If you are unsure a file exists, check before citing it.
6. Phased execution. Work in phases. After each phase, stop and summarize. Do not jump ahead.
7. Secrets rule. If you find a real secret, do not print the value. Report the file path, line number, and type of secret only. Flag it in a ROTATE IMMEDIATELY section.
8. Severity scale. Critical / High / Medium / Low / Info.
9. No padding. Every sentence must carry information.
10. Open questions go in an Open Questions section at the end of each phase output.

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
