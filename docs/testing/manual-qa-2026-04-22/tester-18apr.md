# Manual QA Bug Report — 18 April 2026

**Source:** Table Salt manual QA testers, India  
**Environment:** Production (www.inifinit.com)  
**Scope:** Operations, Menu & Sales, Customers

> This is the raw tester report as submitted. Wording preserved from the original `.docx` source; only line breaks and the `` arrow symbol have been normalized for readability.

---

## POS

- POS → Tags are shown in Menu but not displaying in POS
- POS → Menu → Items measurement quantities are improper (if adding a sparkling water it shows the measurement quantity as Half, Regular, Large)
- POS → Close button and Settings options are overlapped in Kitchen Notification (similarly for Delivery)
- POS → If the table name consists of more characters or numbers, the "pax" alignment is not proper. It moves out of the order details box
- POS → The total amount area is not fixed in a stationary position and is only fully visible when scrolled down
- POS → When new tabs are opened for each customer, the History, Delivery, and Recall sections shift towards the right and are only visible when scrolled
- POS → Takeaway — before sending it to the kitchen it asks the customer to pay. Once paid, the payment page opens again
- POS → Combo offer is active but not displaying in POS (it displays in Menu)
- POS → Menu → When we print the bill the time is incorrect even though changed in Settings
- POS → Reserved tables are not able to select when the reserved customer arrives for dine-in

## Tables

- Tables → Floor Plan — totally 6 zones available. But in "Zones" only 4 is available.
- Tables → Reservations → Reservation date automatically reserved to the next day while entering.
- When merging two tables, the total capacity is not updated correctly. For example, merging two tables with capacities of 4 each should result in a total capacity of 8, but the system still shows only 4. Additionally, after merging, only one table is marked as occupied, while the other remains available and can be booked or blocked for another customer, which should not happen.
- Tables → Waitlist — 2 options are available for adding waitlist details.
- Tables → Occupancy — percentage is incorrect
- Tables → Create/Edit Table — capacity accepts up to 9 digits
- Tables → Reservation — reservation made today is updated to next day (reservation made on 16 April 2026 is updated to 17 April 2026)
- Tables → QR codes — "failed to generate QR code" error
- Tables → Clear — clearing the table only works some of the time
- Tables → QR code — When placing an order through the QR code, clicking on "All" does not display all menu items. However, after selecting each category and then clicking "All", all menu items are displayed.
- Tables → QR code — If items are ordered and the order is placed successfully, clicking on "View Bill" displays different items that were not ordered. The ordered items and the items shown in the bill do not match.

## Live Request

- Live Request → All Tables — only 3 random tables are visible.

## Online Orders

- Once the order is moved to "Void" status then the reasons for the void is not displayed in the KOD (Kitchen Online Order).
- Online Orders → Ready to Pay — CRM is not working for newly created customer and shows error "could not search customer"
- Online Orders → Ready to Pay — At times, when clicking on "Print Preview", the QR code is not displayed. Additionally, the amount is shown with the rupee symbol in both the bill preview and the payment print options.
- Online Orders → Ready to Pay — "Proceed to Payment" does not move to payment page
- Online Orders → Ready to Pay → Print Preview — It displays that payments are made in cash for every order, and the time is incorrect. However, the time shown in the Bill Preview is correct.

## Phone Order

- Phone Order — Once after placing the order "Print Ticket" is not working. Error occurred.
- Phone Orders → Save Draft — it should save as draft but it sends to kitchen
- Phone Orders → Phone number accepts characters and Name accepts number as input
- Phone Orders — when placed orders through phone order the item does not display in Online Orders
- Phone Orders → Delivery — when an order is made through delivery it does not display in Delivery and Online Orders

## Cash Machine

- Cash Machine → Close Session → Cash Handover — The placeholder text overlaps with the amount and also same error "session not found".

## Parking

- Parking → New Check In — Deactivated slots remain visible, and the system still allows vehicles to be parked in them.
- Parking → New Check In — Number plate accepts unwanted characters as well as special characters as input
- Parking → Overnight Checkout — error
- Parking → Operations — when a vehicle is marked requested and clicked "Mark Ready", the vehicle disappears. Only if we give Complete the vehicle revenue is updated.
- Parking → Slot Board — the Floor Plan is overlapped
- Parking → Valet Staff → Log Key Action — CSRF token error
- Parking → Shifts → Add Staff to Shift — CSRF token error

## Menu Pricing

- Menu Pricing → Outlet View — when "Global Adjustment" is made then the price is getting updated. But the changes in any outlets is not been enabled in the application (changes is now made in Airport Terminal outlet but that is not visible on the application).
- Outlet name is not visible in the Application.
- Rules View — Rules are not activated in the outlet.
- Outlet View — When we click "Export CSV" the Excel downloaded shows the details that are not in the current page.

## Promotions

- Offers & Deals — Enable & Disable button are not available.
- Error is occurred when creating offer. Also "Scope Reference" field is not working according to "Scope" field (example: if Scope = Category then Scope Reference is not showing the category — it is like a manual entry).
- Promotion Rules — Inactive count is not shown.

## Event & Special Days

- New Event — When the start date and end date of an event fall on the same day, the event is incorrectly displayed on the next day in the calendar.

## Kiosk

- Kiosk — When click on "Copy Kiosk URL" and paste on browser it moves to order page, but when we click on the "Copy" symbol and paste on the browser it redirects to some other page.
- Upsell — When creating an upsell "Suggest this item" — every item is not visible. Scroll needed.
- Kiosk — Back button and Select Language is overlapped.
- Kiosk — When "AE" language is chosen it is continued with only English language in further process.
- Kiosk → Upsell Rules — There is no edit option available; in case of any changes, the existing rule must be deleted and a new one created.
- Kiosk → Upsell Rules — priority accepts up to 9 digits
- Kiosk → Upsell Rules — priority accepts negative numbers.
- Kiosk — The bill amount shown in the kiosk differs from the amount displayed in live orders, which appears comparatively lower.

## Advertisements

- Advertisement (third party) is created and it is active but it is not displaying in the application.
- Advertisement → Revenue → Add Revenue Record — it accepts negative amount.

## CRM

- Alignment issue
