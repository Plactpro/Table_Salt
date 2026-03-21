import { forwardRef } from "react";

interface KotItem {
  name: string;
  quantity: number;
  notes?: string | null;
  course?: string | null;
}

interface KotPrintTemplateProps {
  restaurantName: string;
  kotNumber?: string;
  orderId: string;
  orderType?: string | null;
  tableNumber?: number | null;
  station?: string | null;
  sentAt: string;
  items: KotItem[];
}

const KotPrintTemplate = forwardRef<HTMLDivElement, KotPrintTemplateProps>(
  ({ restaurantName, kotNumber, orderId, orderType, tableNumber, station, sentAt, items }, ref) => {
    const date = new Date(sentAt);
    const dateStr = date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const timeStr = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    const orderRef = orderId.slice(-6).toUpperCase();

    const groupedByCourse: Record<string, KotItem[]> = {};
    for (const item of items) {
      const course = item.course || "Main";
      if (!groupedByCourse[course]) groupedByCourse[course] = [];
      groupedByCourse[course].push(item);
    }
    const courseOrder = ["Starter", "starter", "Main", "main", "Dessert", "dessert", "Beverage", "beverage"];
    const sortedCourses = Object.keys(groupedByCourse).sort(
      (a, b) => (courseOrder.indexOf(a) === -1 ? 99 : courseOrder.indexOf(a)) - (courseOrder.indexOf(b) === -1 ? 99 : courseOrder.indexOf(b))
    );

    return (
      <div
        ref={ref}
        data-testid="kot-print-template"
        style={{
          fontFamily: "monospace",
          fontSize: "12px",
          maxWidth: "302px",
          width: "302px",
          padding: "8px",
          background: "white",
          color: "black",
          lineHeight: "1.4",
        }}
      >
        <div style={{ textAlign: "center", borderBottom: "2px dashed #000", paddingBottom: "6px", marginBottom: "6px" }}>
          <div style={{ fontWeight: "bold", fontSize: "14px" }}>{restaurantName}</div>
          <div style={{ fontSize: "11px" }}>*** KITCHEN ORDER TICKET ***</div>
          {station && <div style={{ fontSize: "11px" }}>Station: {station.toUpperCase()}</div>}
        </div>

        <div style={{ borderBottom: "1px dashed #000", paddingBottom: "6px", marginBottom: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>KOT #: {kotNumber || orderRef}</span>
            <span>{dateStr}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>
              {orderType === "dine_in" ? "Table" : orderType === "takeaway" ? "Takeaway" : orderType === "delivery" ? "Delivery" : "Order"}
              {tableNumber ? ` #${tableNumber}` : ""}
            </span>
            <span>{timeStr}</span>
          </div>
          <div>Order Ref: #{orderRef}</div>
        </div>

        {sortedCourses.map((course) => (
          <div key={course} style={{ marginBottom: "4px" }}>
            {sortedCourses.length > 1 && (
              <div style={{ fontWeight: "bold", textTransform: "uppercase", fontSize: "11px", marginBottom: "2px" }}>
                -- {course} --
              </div>
            )}
            {groupedByCourse[course].map((item, idx) => (
              <div key={idx} style={{ marginBottom: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: "bold", fontSize: "13px" }}>{item.name}</span>
                  <span style={{ fontWeight: "bold", fontSize: "13px" }}>x{item.quantity}</span>
                </div>
                {item.notes && (
                  <div style={{ fontSize: "11px", paddingLeft: "8px" }}>
                    Note: {item.notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        <div style={{ borderTop: "2px dashed #000", marginTop: "6px", paddingTop: "6px", textAlign: "center", fontSize: "11px" }}>
          <div>Total Items: {items.reduce((s, i) => s + (i.quantity || 1), 0)}</div>
          <div>*** END OF KOT ***</div>
        </div>
      </div>
    );
  }
);

KotPrintTemplate.displayName = "KotPrintTemplate";
export default KotPrintTemplate;
