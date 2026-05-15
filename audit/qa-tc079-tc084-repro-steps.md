# QA Test Case Reproduction Steps — TC-079 through TC-084

This document supplies the reproduction steps for QA workbook rows TC-079 through TC-084, which previously said "Ask Arun for the exact reproduction steps." Each section is written so a tester running through the Table Salt production app at www.inifinit.com can execute it without reading the codebase.

Source backlog: `audit/00-backlog.md`. All evidence references are to tester reports already on file.

---

## TC-079 — F-254 — Production frontend hammered by 429 Too Many Requests

**Preconditions:**
- A logged-in tester account on www.inifinit.com (any role — bug was observed under normal use, not role-specific).
- Browser with DevTools available (Chrome or Edge recommended).
- A test plan that will keep the session active for at least several minutes of continuous tester work.

**Steps:**
1. Log in to www.inifinit.com as your normal tester account.
2. Open browser DevTools (F12) and switch to the **Network** tab.
3. In the Network filter row, type `429` to filter to failed-rate-limit responses, OR leave unfiltered and look for any red rows with status `429`.
4. Begin executing your normal tester checklist (navigate between Orders, Menu, Settings, etc.) — do **not** sit idle. Keep the session active for at least 10–15 minutes of continuous use.
5. While working, watch the Network tab for any of these endpoints returning status `429`:
   - `/api/health`
   - `/api/admin/impersonation/status`
   - `/api/security-alerts/unread-count`
   - `/api/offers`
   - `/api/menu-items?limit=500`
   - `/api/menu-categories`
   - `/api/promotions/evaluate`
6. If any 429 responses appear, screenshot the Network tab row, expand the entry, and capture the request URL, response status, and timestamp.

**Expected result:** No 429 responses should appear on any endpoint during normal multi-minute tester use. If any 429s appear, record the endpoint, the time-since-login, and what you were doing in the UI at that moment.

**Source evidence:** Tester report 2026-05-05 (DevTools network panels). F-254a fix (rate-limiter remount, PR #23, commit `ec7a0df`) shipped 2026-05-07; testers reported no field 429s either pre or post fix, so this test now serves as regression monitoring rather than direct reproduction.

Ambiguity: The original report says "especially after extended session time" but did not pin down a minutes threshold. 10–15 minutes is a reasonable floor; longer is better if the tester can sustain it.

---

## TC-080 — F-256b — Currency setting reverts after page refresh

**Preconditions:**
- A logged-in tester account on www.inifinit.com with permission to edit Settings (owner or manager).
- Note the tenant's currently-saved currency before starting so you can detect the revert.

**Steps:**
1. Log in to www.inifinit.com.
2. Navigate to **Settings**.
3. Find the **Currency** dropdown.
4. Change the currency to a value **different** from the current one (e.g. if currently INR, switch to KRW; if currently USD, switch to AED).
5. Click the **Save** button for the currency section (button labelled "Save Settings" or "Save Currency Settings").
6. Wait for the success toast confirmation (e.g. "Settings saved").
7. Refresh the page (F5 or Ctrl+R).
8. Return to the **Currency** dropdown and read its displayed value.
9. Separately, open a POS dine-in flow and check the currency symbol shown on the cart / bill — this should reflect the saved currency.

**Expected result:** After refresh, the Currency dropdown in Settings should display the value you just saved. The POS currency symbol should also reflect the saved currency.

**Bug behaviour at time of filing:** After refresh, the Settings dropdown is blank or reverted to a default; meanwhile the POS does use the saved currency. The break is specifically the Settings page's read-back, not the underlying tenant-currency record.

**Source evidence:** Tester Madhesh, 2026-05-14, workbook case M-NEW-03-01. Originally filed 2026-05-05 (Table_Salt_-_Settings_page.docx). Closed 2026-05-08 (PR #29, commit `703b800`) on self-test only; reopened 2026-05-14 after Madhesh's cross-validation failed.

---

## TC-081 — F-256c — Time Zone setting reverts after page refresh

**Preconditions:**
- A logged-in tester account on www.inifinit.com with permission to edit Settings.
- A browser whose system timezone is **different** from the tenant's saved time zone, so the revert is visible (e.g. browser set to Asia/Kolkata while tenant TZ is set to something else).
- Note the tenant's currently-saved time zone before starting.

**Steps:**
1. Log in to www.inifinit.com.
2. Navigate to **Settings**.
3. Find the **Time Zone** dropdown.
4. Change the time zone to a value **different** from the current one and **different** from the browser's system time zone (e.g. set to Asia/Tokyo if your browser is on Asia/Kolkata).
5. Click the **Save** button for the time-zone or business-config section.
6. Wait for the success toast confirmation.
7. Refresh the page (F5 or Ctrl+R).
8. Return to the **Time Zone** dropdown and read its displayed value.
9. Open the **Audit Log** (or any audit-trail / activity view available) and check the time zone the latest log entry was rendered in.

**Expected result:** After refresh, the Settings dropdown should display the time zone you just saved. The Audit Log should render its timestamps in the saved tenant time zone, not the browser's.

**Bug behaviour at time of filing:** After refresh, the saved TZ does not persist in the Settings dropdown, and the Audit Log shows timestamps in the browser's time zone. Likely shares root cause with TC-080.

**Source evidence:** Tester Madhesh, 2026-05-14, workbook case M-NEW-03-02. Originally filed 2026-05-05 (Table_Salt_-_Settings_page.docx). Closed 2026-05-08 (PR #29, commit `703b800`) on self-test only; reopened 2026-05-14 after Madhesh's cross-validation failed.

---

## TC-082 — F-270 — KDS ticket and Receipt timestamps show wrong time zone

**Preconditions:**
- A logged-in tester account on www.inifinit.com with permission to access POS, KDS, and Settings.
- Ability to change the browser's system time zone (Windows: Settings → Time & language → Date & time; macOS: System Settings → General → Date & Time). The test relies on the browser TZ being different from the tenant TZ.
- A KDS-attached printer or printable receipt path (so the printed time can be inspected).

**Steps:**
1. Log in to www.inifinit.com.
2. Go to **Settings** and set the tenant **Time Zone** to a clearly distinctive value, e.g. `Asia/Tokyo`. Save and confirm via the toast. (If TC-081 is failing, you may need to confirm the TZ is actually persisted to the backend via a second login or by checking what is sent on Save in DevTools Network — the symptom is the dropdown read-back, not the database write.)
3. Set the **browser's** operating-system time zone to a different distinctive value, e.g. `Asia/Kolkata`. Restart the browser if necessary so the change takes effect.
4. Reload www.inifinit.com and create a new dine-in order with at least one item.
5. Send the order to the kitchen.
6. Open the **KDS** (Kitchen Display) view. Find the ticket that just arrived and note the **Created Time** displayed on the ticket.
7. Compare that displayed time against:
   - the current local time in the tenant TZ (Asia/Tokyo)
   - the current local time in the browser TZ (Asia/Kolkata)
8. Complete the order through to payment and trigger a printed receipt (or open the receipt preview).
9. Note the **printed time** on the receipt and compare it against the same two reference times.

**Expected result:** Both the KDS ticket "Created Time" and the printed receipt time should match the **tenant** time zone (Asia/Tokyo in this example). They should not match the browser time zone, and they should not match any third time zone (e.g. UTC).

**Bug behaviour at time of filing:** Both timestamps match **neither** the saved tenant TZ nor the browser TZ. The third source is most likely server UTC or a hardcoded container timezone. Compliance angle: UAE FTA VAT and India GST tax invoices must show local transaction time.

**Source evidence:** Tester Nandhini, report `Table_Salt_8-5-2026_nandhini.docx`, 2026-05-08 morning, Sweep pages 22 and 23.

---

## TC-083 — F-300 — Split-payment receipt collapses to "Paid via Cash" regardless of actual mix

**Preconditions:**
- A logged-in tester account on www.inifinit.com with cashier permissions to take payments.
- An open POS session and a dine-in order ready to bill (items added, marked ready to pay).
- Access to print or preview the receipt after payment.

**Note on scope:** This test covers the **split-payment** case only. Single-method payments (one card OR one UPI OR one cash) render correctly on the receipt — those are not part of this test. The bug fires only when a single bill is settled using **two or more** payment methods.

**Steps:**
1. Log in to www.inifinit.com and open POS.
2. Take a dine-in order through to the **Bill Preview** stage so payment can be collected.
3. In the Bill Preview / payment screen, initiate a **split payment** — settle a portion of the bill using one method and the remainder using a different method. Example: pay 50% by Card and 50% by Cash, or 60% by UPI and 40% by Card.
4. Complete both partial payments so the bill is fully settled and marked paid.
5. Trigger the **receipt** for this bill (print it, or view the receipt preview / re-print page).
6. Read the payment-method line on the receipt — look for the "Paid via …" text.
7. Cross-check the same bill on the **Bill Detail** page and on the **Online Orders** ticket view — note the payment method(s) displayed there.

**Expected result:** The receipt should reflect the actual mix of payment methods used (e.g. "Paid via Card and Cash", or list both methods with the amount paid by each). It should not collapse to a single hardcoded method.

**Bug behaviour at time of filing:** On a split-payment bill, the receipt prints "Paid via Cash" regardless of the actual method mix. Bill Detail and Online Orders ticket views render the methods correctly — only the receipt-rendering path is broken for the multi-method case.

**Source evidence:** Tester Madhesh, REG-08 case 2026-05-13 (bill ID #9DE9D0). Re-scoped on 2026-05-14 after Madhesh's M4 deep-dive (cases M4-01 through M4-05) confirmed single-method receipts work correctly and narrowed the bug to the split-payment path.

Ambiguity: The exact UI affordance for triggering a split payment in the Bill Preview Modal is not described in the backlog entry. Tester should follow the same path used in Madhesh's REG-08 / M4 sequence. If that path is not obvious, escalate before running.

---

## TC-084 — F-303 — Menu items without a kitchen station do not print on KOT (but do appear on KDS)

**Preconditions:**
- A logged-in tester account on www.inifinit.com with permission to edit menu items and run POS.
- At least one **menu item with no kitchen station assigned**. Either create a fresh menu item without selecting a station, or pick an existing item and clear its station assignment. (This condition matches a typical new tenant whose station setup is incomplete.)
- A KDS view accessible.
- A KOT printer (or a print-preview path that shows what the KOT printer would receive).

**Steps:**
1. Log in to www.inifinit.com.
2. Navigate to **Menu** → menu items. Identify (or create) at least one menu item that has **no kitchen station** assigned. Save it. If you created a new item, confirm in the item's detail view that the station field is empty / unassigned.
3. Open POS and create a new dine-in order. Add the station-less menu item to the cart (along with at least one normally-stationed item, so the contrast is visible on the KOT).
4. Send the order to the kitchen ("Send to Kitchen" button or equivalent).
5. Open the **KDS** view. Look for the order. Confirm whether the station-less item appears on the KDS ticket.
6. Retrieve the **printed KOT** (or open the print preview / KOT print log for this order). Look at the items on the printed ticket.
7. Compare: which items appear on the KDS vs which items appear on the printed KOT?

**Expected result:** Every item sent to the kitchen should appear on **both** the KDS ticket **and** the printed KOT. An item with no station assignment should either (a) appear on a fallback "unrouted" KOT, or (b) be blocked at order entry — the system should never silently drop it from the printed ticket while still showing it on the KDS.

**Bug behaviour at time of filing:** Station-less items appear on the KDS but do **not** appear on the printed KOT. Three systems (POS, KDS, KOT print) disagree about whether the item was communicated to the kitchen. The bug is self-concealing — KDS shows the item, so nothing flags that the printer is missing it.

**Source evidence:** Tester Nandhini, case N-NEW-01-01, 2026-05-14.
