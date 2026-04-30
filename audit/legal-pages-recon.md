# Legal Placeholder Pages — Recon

**Date:** 2026-04-29 PM
**Branch:** main, HEAD `fec9177`
**Scope:** Read-only investigation. No code changes.

## Summary

Three call sites in the client (footer, ConsentUpdateModal, registration form) link to `/legal/privacy` and `/legal/terms`. Neither route is registered in the wouter router. The current behaviour is: clicking the footer link opens a new tab to `/legal/privacy`, which falls through to `ProtectedRoute` → `<Redirect to="/login" />` if logged out, or to the in-app `NotFound` page if logged in. The fix is to add two new public top-level routes (`/legal/privacy` and `/legal/terms`) wired in `client/src/App.tsx`'s `Router()` function, backed by two new placeholder page components (`PrivacyPolicy.tsx` and `TermsOfService.tsx`) that mirror the structure of `forgot-password.tsx` — bare layout, hardcoded English, `<PageTitle>` for tab title, `<TableSaltLogo>` for branding. The new routes must work both logged-in and logged-out (so footer link works in both states), so they are NOT wrapped in `<PublicOnly>`. No changes to the footer / ConsentUpdateModal / registration form are needed — they already point at the right URLs. No i18n changes needed (placeholder pages are English-only).

## Current state

### Footer link locations

Three call sites currently reference `/legal/privacy` and `/legal/terms`:

1. **`client/src/components/layout/app-layout.tsx:470, 478`** — The in-app footer. Both links use `target="_blank"` + `rel="noopener noreferrer"`. They prefer `platformSettings?.privacyUrl` / `platformSettings?.tosUrl` from the `/api/consent/status` response, falling back to `/legal/privacy` / `/legal/terms`. Labels come from `useTranslation("layout")` (`t("privacyPolicy")`, `t("termsOfService")`).
2. **`client/src/components/layout/app-layout.tsx:341–342, 364, 374`** — The `ConsentUpdateModal` rendered when a tenant has out-of-date ToS/privacy acceptance. Same fallback pattern: `consentStatus?.platform.tosUrl || "/legal/terms"`, opens in new tab.
3. **`client/src/pages/register.tsx:344, 346`** — The required-checkbox copy on the registration form: "I agree to the [Terms of Service] and [Privacy Policy]". Both `target="_blank"`, hard-coded URLs (no platform-settings lookup here).

### Current 404 behaviour

`client/src/App.tsx`'s `Router()` function (lines 641–722) is a cascading `if (location === "/x")` chain that handles each public route explicitly (`/login`, `/register`, `/forgot-password`, `/reset-password`, `/onboarding`, `/kiosk`, `/guest/*`, `/table/*`, `/admin/*`, `/kds/wall*`, `/receipt/*`) before falling through to `<ProtectedRoute><ProtectedPages /></ProtectedRoute>`. There is no `if (location.startsWith("/legal"))` branch, so:

- **Logged-out user clicks footer Privacy link** → new tab opens at `/legal/privacy` → `Router()` falls through → `ProtectedRoute` sees `!user` → `<Redirect to="/login" />`. The user lands on the login page with no explanation. The originally requested `/legal/privacy` URL is gone.
- **Logged-in user clicks footer Privacy link** → new tab opens at `/legal/privacy` → falls through to `<ProtectedPages />` → `AppLayout > Switch` has no `/legal/*` route → final `<Route component={NotFound} />` renders the in-app 404 page wrapped in the full `AppLayout` (sidebar, header, footer). Visible 404, but inside the app chrome.

### Routing pattern

- Library: **wouter** (`Switch`, `Route`, `useLocation`, `Redirect` imported from `"wouter"` at `App.tsx:22`).
- Public routes are added by appending an `if (location === "/your-path") return <YourPage />;` block inside `Router()` BEFORE the `ProtectedRoute` fallback at line 717.
- Most public routes are wrapped in `<PublicOnly>` (`/login`, `/register`, `/forgot-password`) which redirects to `/` (or `/admin`) if a user is already logged in. **Legal pages should NOT use `<PublicOnly>`** — the in-app footer is rendered to logged-in users, so the link must resolve when logged-in too.
- For path patterns with parameters or multiple sub-routes, the pattern uses `if (location.startsWith("/prefix")) return <Switch>...</Switch>` — see `/guest/*`, `/table/*`, `/receipt/*`, `/kds/wall*`. We don't need that for two flat URLs; two `if (location === ...)` blocks are simpler.

## Existing simple public page to mirror

**File:** `client/src/pages/forgot-password.tsx` (118 lines)

Best mirror because: it's a small public page, has no auth or data dependencies, and hardcodes English (no `useTranslation`). Structure:

```tsx
import { PageTitle } from "@/lib/accessibility";
import { TableSaltLogo } from "@/components/brand/table-salt-logo";
// ... other imports

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <PageTitle title="Forgot Password" />
      <a href="#main-content" className="sr-only focus:not-sr-only ...">Skip to main content</a>
      <div className="w-full max-w-md" id="main-content">
        <div className="flex items-center justify-center mb-8">
          <TableSaltLogo variant="full" iconSize={32} />
        </div>
        {/* page content */}
      </div>
    </div>
  );
}
```

Key properties to mirror for the legal pages:
- **No `AppLayout`.** Bare, full-viewport layout (`min-h-screen`).
- **`<PageTitle title="..." />`** from `@/lib/accessibility` sets `document.title = "{title} — Table Salt"` (see `client/src/lib/accessibility.ts:13–18`). Used by ~80 pages including `not-found.tsx`, `login.tsx`, `reset-password.tsx`. This is the only meta mechanism in the client; there is no `react-helmet`, no `<meta description>` per-page, and no `useTitle` hook.
- **`<TableSaltLogo variant="full" iconSize={32} />`** at the top for brand consistency (used by login, register, forgot-password, reset-password).
- **Skip-link (`<a href="#main-content">`)** for a11y, mirroring forgot-password's pattern.
- **Hardcoded English.** No `useTranslation` call. Acceptable per the user's hard-rule for placeholder pages.

For wider context: `not-found.tsx` (24 lines) shows a simpler "card-only" pattern that uses `useTranslation("common")` — but the legal pages are content-heavy and the bare-layout pattern of `forgot-password.tsx` fits better.

## Proposed implementation sketch

### Two new files

**`client/src/pages/legal/PrivacyPolicy.tsx`** — placeholder content:

```tsx
import { PageTitle } from "@/lib/accessibility";
import { TableSaltLogo } from "@/components/brand/table-salt-logo";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen p-6 bg-background">
      <PageTitle title="Privacy Policy" />
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed ...">Skip to main content</a>
      <div className="max-w-3xl mx-auto py-8" id="main-content">
        <div className="flex items-center justify-center mb-8">
          <TableSaltLogo variant="full" iconSize={32} />
        </div>
        <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: April 29, 2026</p>
        <div className="prose prose-sm max-w-none space-y-4">
          <p>This Privacy Policy describes how Table Salt collects, uses, and protects information collected from restaurant operators, their staff, and end customers who interact with the platform.</p>
          <p>This page is a placeholder. The full Privacy Policy is being prepared and will be published before public launch. Until then, please direct any privacy or data-protection questions to <a href="mailto:privacy@tablesalt.app" className="text-primary hover:underline">privacy@tablesalt.app</a>.</p>
          <h2 className="text-xl font-semibold mt-8">Contact</h2>
          <p>Table Salt is operated by TOTCI Technologies / Plactpro.</p>
          <p>For privacy or data-protection requests, contact <a href="mailto:privacy@tablesalt.app" className="text-primary hover:underline">privacy@tablesalt.app</a>.</p>
        </div>
        <p className="mt-12 text-xs text-muted-foreground text-center">© {new Date().getFullYear()} Table Salt</p>
      </div>
    </div>
  );
}
```

**`client/src/pages/legal/TermsOfService.tsx`** — analogous shape, wording adapted ("Terms of Service describes the agreement…", "legal@tablesalt.app" or same `support@` — see QQ-1).

### Route registration

In `client/src/App.tsx`, add two `if` blocks inside `Router()` immediately before the `ProtectedRoute` fallback at line 717. Mirror the import-and-call style of `LoginPage`, `RegisterPage`, `ForgotPasswordPage` (eager import, top-of-file).

```tsx
// imports near line 40–43:
import PrivacyPolicyPage from "@/pages/legal/PrivacyPolicy";
import TermsOfServicePage from "@/pages/legal/TermsOfService";

// inside Router(), before line 717's ProtectedRoute fallback:
if (location === "/legal/privacy") {
  return <PrivacyPolicyPage />;
}

if (location === "/legal/terms") {
  return <TermsOfServicePage />;
}
```

No `<PublicOnly>` wrapper — legal pages must work logged-in (footer link case) and logged-out (registration page case). No `<ProtectedRoute>` wrapper either — these are public.

Eager imports (rather than `lazy(() => import(...))`) are appropriate: each page is small (~40 lines), the user reaches them directly via deep link, and lazy-loading would add a flash-of-loader for no measurable bundle saving.

### Estimated diff size

- 1 file modified (`App.tsx`): 2 imports + 6 lines of routing → ~8 lines added
- 2 new files: ~40 lines each
- Total: ~90 lines, single feature branch.

### Out of scope

- The platform-settings override (`/api/consent/status` returning custom `tosUrl`/`privacyUrl`) is server-side and orthogonal — the placeholders only matter when platform settings don't override.
- No real legal review of the placeholder copy. The placeholders should set expectations ("placeholder", "being prepared") and provide a contact email — they are not a substitute for actual legal counsel.
- No changes to the footer, ConsentUpdateModal, or registration form. They already point at the right URLs.
- No i18n. Placeholder pages are English-only; full versions can be translated when the actual legal text lands.

## Branding facts found

| Fact | Source | Notes |
|---|---|---|
| Brand name | `Table Salt` | Universal across `client/src/`. Footer (`app-layout.tsx:467`), logo (`table-salt-logo.tsx:106`), title bars (`accessibility.ts:15: "${title} — Table Salt"`), error boundary (`GlobalErrorBoundary.tsx:68`), sidebar, admin layout, all locale `appName` keys. |
| Legal entity | `TOTCI Technologies / Plactpro` | `LICENSE:3` — "Copyright (c) 2026 TOTCI Technologies / Plactpro". The only legal-entity statement found in the repo. |
| Production domain | `inifinit.com` / `www.inifinit.com` | `CLAUDE.md`, `server/index.ts:549` (`APP_URL` default), tester reports — server-side only. **Not present anywhere in `client/src/`.** |
| Contact email — admin | `admin@tablesalt.app` | `.replit` → `VAPID_SUBJECT = "mailto:admin@tablesalt.app"`. The only email surfaced anywhere. Not exposed in `client/src/`. |
| Contact email — privacy / legal / support | **NONE found in `client/src/`** | No `support@`, `privacy@`, `legal@`, `contact@` strings exist anywhere in the client. The placeholder pages would be introducing the first such addresses. See QQ-1. |
| Other identifiers | None | `PLACTPRO`, `TOTCI`, `inifinit.com` produce zero matches across `client/src/`. The frontend is brand-isolated from the LLC/holding structure. |

## Open questions

- **QQ-1: What contact email(s) should the placeholder pages list?** No `support@` / `privacy@` / `legal@` email exists anywhere in `client/src/`. The only client-discoverable address is `admin@tablesalt.app` (from `.replit` VAPID config, never shown to users). Three reasonable options: (a) use `support@tablesalt.app` for both pages — simplest and matches the admin domain; (b) use `privacy@tablesalt.app` and `legal@tablesalt.app` for privacy and terms respectively — more formal, but introduces two new addresses that may not have mailboxes yet; (c) use the production domain (`legal@inifinit.com`, etc.) since that's the actual deployment URL. The recon doc above tentatively uses `privacy@tablesalt.app` / `legal@tablesalt.app` to match the existing client-side `tablesalt.app` brand boundary, but a one-line user decision is needed before implementation.

- **QQ-2: Should the placeholder copy explicitly say "placeholder, full text coming before launch"?** The proposed copy does. Alternative is a single sentence like "Privacy Policy is being prepared. Contact …" with no implication of a final version pending. The first form is more honest with auditors and testers; the second is more compact. Default to the first unless told otherwise.

- **QQ-3: Should the registration page's hard-coded ToS link copy be changed?** Currently at `register.tsx:344, 346` it says "I agree to the Terms of Service and Privacy Policy (required)." Once the placeholder pages exist, this copy is technically accurate. No change needed unless the user wants to weaken the consent claim while the pages are placeholders ("I have read the placeholder Privacy Policy …" — not recommended; let the placeholder pages themselves disclose the placeholder status).

- **QQ-4: Should the in-app footer for logged-in users continue to honor `platformSettings.privacyUrl` / `tosUrl` overrides?** Yes — the override path is independent of the placeholder pages. Don't touch lines 470 / 478 in `app-layout.tsx`.

- **QQ-5: Are the legal pages crawlable / indexable?** Out of scope for this recon, but worth noting: the client `index.html` does not appear to set per-route meta robots, and there's no SSR. SEO of these pages is best-effort. The placeholder pages will set `<title>` via `PageTitle`, which is sufficient for the placeholder phase.
