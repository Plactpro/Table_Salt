# Manual QA Bug Report — 20 April 2026

**Source:** Table Salt manual QA testers, India  
**Environment:** Production (www.inifinit.com)  
**Scope:** Kitchen & Stock, Team, Delivery, Reports

> This is the raw tester report as submitted. Wording preserved from the original `.docx` source; only line breaks and the `` arrow symbol have been normalized for readability.

**General note from testers:** Wherever a dropdown is present, a scroll option should be available.

---

## Kitchen & Stock

- Kitchen Settings → Roster — when we add a roster entry the roster is created and saved but it is not displaying in the calendar
- Kitchen Settings → Cooking Control — the item cooking control mode is set to "Auto-start all", but the chef is required to manually click **Start** in the KDS.
- Kitchen & Stock → Inventory — These categories are not functioning correctly, as no data is displayed when they are clicked. Instead of loading individual category results, all categories are currently shown on a single page and can only be viewed by scrolling.
- Kitchen & Stock → Inventory → Suppliers — suppliers not loading
- Kitchen & Stock → Inventory → Recipes → New Recipe — the scroll is not working when choosing the ingredients.
- Kitchen & Stock → Inventory → Recipes → New Recipe → Add Ingredient — the Cancel button is only visible after scrolling (alignment issue).
- Kitchen & Stock → Inventory → Recipes → New Recipe — Recipe name accepts numbers and special characters as input.
- Kitchen & Stock → Inventory → Recipe — there is alignment issue.
- Kitchen & Stock → Inventory → Inventory Items — Deleting an inventory item does not show any confirmation message; the item is deleted immediately.
- Kitchen & Stock → Inventory → Stock Movements — In the filters, the Station filter does not display all available stations. Additionally, the "Grill Station" appears in the dropdown even though it is disabled.
- Kitchen & Stock → Procurement → Add Supplier — The phone number field accepts characters as input, and there is no validation for the email format.
- Kitchen & Stock → Procurement → Purchase Order → New PO — items cannot be scrolled.
- Kitchen & Stock → Procurement → Stock Count — Food ingredients accept negative physical quantities, whereas crockery, cutlery, and glassware do not allow negative physical counts. Additionally, the Location field is not available for food ingredients but is available for the other categories.
- Kitchen & Stock → Procurement → Stock Count → Damaged Goods → Report Damage — All details can be entered and saved; however, it is unclear who approves the request. Additionally, there is no option to view the submitted details later (such as the date and description of the damage).
- Kitchen & Stock → Procurement — there is no option to delete a supplier.
- Kitchen & Stock → Inventory → Recipe — When creating a recipe, quantities entered in units such as "tsp" or "tbsp" are incorrectly displayed as kilograms on the kitchen board.
- KDS — The total count of all stations is 80, but when other categories are selected, the "All Stations" count changes to 21.
- KDS — Similarly, the total count displayed next to each category does not match the actual number of items. For example, the Main Kitchen count is shown as 31, but the sum of items (11 + 14 + 3) equals 28. (Same for most of the categories.)
- KDS — "Start All" is currently shown in all categories (New, Cooking, Ready), but it should be displayed only in the "New" category.
- Log Wastage (kitchen login) — it is showing error but the wastage log is being stored.
- Kitchen & Stock → Wastage Control — The wastage quantity entered in grams is incorrectly being treated as kilograms, resulting in inaccurate calculations. (For example — the cost of lamb rack is AED 22.00 per kg, so 100 g of lamb rack is AED 2.20, but the wastage cost is displaying as AED 22,000.00.)

## Team

- Staff & Workforce → Schedule → Shift — The shift created for a selected date is automatically updated to the next day. (For example, shift created on 21 April 2026 is updated to 22 April 2026.)
- Staff & Workforce → Leave → Request Leave — invalid CSRF token error
- Staff & Workforce → Workforce — The percentage value is not updating correctly based on the bar graph; for example, the bar chart appears full, but the percentage is shown as 0.
- Staff & Workforce → Performance → Log Performance — value is accepted in negative.
- Internal Audits → Schedules → Start — There is a noticeable lag when selecting a status (Pass, Fail, or N/A), causing a clear delay between the user's click and the status being updated.
- Internal Audits → Issues — there is no option to see the issue.
- Staff & Workforce → Performance — No edit option is available to update the employee details once after it is created.

## Delivery

- Delivery & Online — Delivery orders placed via phone orders are not displayed here.
- Delivery & Online → Online Orders → Channel Settings — When the channel is disabled (example: Swiggy), however the channel enables in "Live Orders" and also in "Online Menu Mapping".
- Delivery & Online → Online Orders — Ordered items are not displayed for orders from **Swiggy, Zomato, Uber Eats, Kiosk, QR orders, and Phone Orders**. Only POS orders show the items. (Ordered items is also not visible in kitchen.)
- Delivery & Online → Online Orders — Only kiosk orders with "Pay at Counter" are displayed here; orders with other payment modes are not shown.
- Delivery & Online → Online Orders — When live orders are sent to the kitchen, the "Order ID" differs from the one shown in the Live Orders.
- Delivery & Online → Online Orders — The Cancel option is not functional.

## Reports

- Reports & Analysis — The category options are not functional. Additionally, clicking on a category should open it in a new tab, but instead all categories are displayed on a single page and can only be viewed by scrolling.
- Reports & Analysis → Shift Reconciliation — all the amount values are displayed in dollars (only in Shift Reconciliation).
- Reports & Analysis → BI Dashboards & Forecasting → Finance — In the cost breakdown chart, the text overlaps.
- Reports & Analysis — alignment issue.
