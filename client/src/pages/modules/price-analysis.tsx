import { PageTitle } from "@/lib/accessibility";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { formatCurrency as sharedFormatCurrency } from "@shared/currency";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, AlertTriangle, Tag } from "lucide-react";

interface ComparisonData {
  outlets: { id: string; name: string }[];
  comparison: {
    menuItemId: string;
    menuItemName: string;
    basePrice: number;
    outletPrices: Record<string, number | null>;
    maxPrice: number;
    minPrice: number;
    maxVariance: number;
  }[];
  insights: string[];
}

export default function PriceAnalysis() {
  const { user } = useAuth();
  const tenantCurrency = (user?.tenant?.currency?.toUpperCase() || "USD") as string;
  const tenantCurrencyPosition = (user?.tenant?.currencyPosition || "before") as "before" | "after";
  const tenantCurrencyDecimals = user?.tenant?.currencyDecimals ?? 2;
  const fmt = (val: number | string) => sharedFormatCurrency(val, tenantCurrency, { position: tenantCurrencyPosition, decimals: tenantCurrencyDecimals });

  const { data, isLoading, error } = useQuery<ComparisonData>({
    queryKey: ["/api/pricing/comparison"],
    queryFn: async () => (await apiRequest("GET", "/api/pricing/comparison")).json(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground" data-testid="price-analysis-loading">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading price analysis...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="price-analysis-error">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-orange-400" />
        <p>Could not load price analysis data.</p>
      </div>
    );
  }

  const { outlets, comparison, insights } = data;

  if (outlets.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground" data-testid="price-analysis-empty">
        <Tag className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p>No outlets found. Set up outlets to see price comparison.</p>
      </div>
    );
  }

  const highVariance = comparison.filter(c => c.maxVariance > 20);

  return (
    <div className="space-y-6" data-testid="price-analysis-page">
      <PageTitle title="Price Analysis" />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-teal-600" />
            Price Analysis
          </h2>
          <p className="text-sm text-muted-foreground">Compare pricing across all outlets</p>
        </div>
      </div>

      {insights.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="price-insights">
          {insights.map((insight, i) => (
            <div key={i} className="flex items-start gap-2 p-3 bg-teal-50 border border-teal-200 rounded-lg text-sm" data-testid={`insight-${i}`}>
              <Tag className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" />
              <span className="text-teal-800">{insight}</span>
            </div>
          ))}
        </div>
      )}

      {highVariance.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              High Price Variance Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2" data-testid="high-variance-items">
              {highVariance.map(item => (
                <Badge key={item.menuItemId} variant="outline" className="bg-orange-50 border-orange-200 text-orange-700" data-testid={`variance-badge-${item.menuItemId}`}>
                  {item.menuItemName} (+{item.maxVariance}%)
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Cross-Outlet Price Comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <table className="w-full text-sm min-w-[500px]" data-testid="comparison-table">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Item</th>
                  <th className="text-right px-4 py-2 font-medium">Base</th>
                  {outlets.map(o => (
                    <th key={o.id} className="text-right px-4 py-2 font-medium" data-testid={`outlet-col-${o.id}`}>{o.name}</th>
                  ))}
                  <th className="text-right px-4 py-2 font-medium">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {comparison.map(row => (
                  <tr key={row.menuItemId} className="hover:bg-muted/20" data-testid={`compare-row-${row.menuItemId}`}>
                    <td className="px-4 py-2 font-medium">{row.menuItemName}</td>
                    <td className="px-4 py-2 text-right text-muted-foreground">{fmt(row.basePrice)}</td>
                    {outlets.map(o => {
                      const price = row.outletPrices[o.id];
                      const diff = price != null ? price - row.basePrice : 0;
                      return (
                        <td key={o.id} className="px-4 py-2 text-right" data-testid={`price-${row.menuItemId}-${o.id}`}>
                          <span className={diff > 0 ? "text-orange-600" : diff < 0 ? "text-green-600" : ""}>
                            {price != null ? fmt(price) : <span className="text-muted-foreground">—</span>}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-4 py-2 text-right">
                      {row.maxVariance > 0 ? (
                        <Badge variant="outline" className={row.maxVariance > 50 ? "bg-red-50 text-red-700 border-red-200" : row.maxVariance > 20 ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-green-50 text-green-700 border-green-200"}>
                          +{row.maxVariance}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">Base</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
