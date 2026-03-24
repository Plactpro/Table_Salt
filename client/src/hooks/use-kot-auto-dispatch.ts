import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { renderKotHtml, dispatchPrint, printHtmlInPopup } from "@/lib/print-utils";
import { apiRequest } from "@/lib/queryClient";

interface KitchenStation {
  id: string;
  name: string;
  printerUrl?: string | null;
}

/**
 * Returns a function that fetches queued KOT print jobs for an order
 * and dispatches them immediately, showing a success/failure toast.
 * Intended to be called right after an order transitions to sent_to_kitchen.
 */
export function useKotAutoDispatch() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const dispatchKotForOrder = useCallback(
    async (orderId: string, restaurantName: string) => {
      try {
        const res = await fetch(
          `/api/print-jobs?referenceId=${encodeURIComponent(orderId)}&status=queued`,
          { credentials: "include" }
        );
        if (!res.ok) return;

        const jobs: Array<{ id: string; type: string; station: string | null; payload: any }> =
          await res.json();
        const kotJobs = jobs.filter(j => j.type === "kot");
        if (kotJobs.length === 0) return;

        let stations: KitchenStation[] =
          queryClient.getQueryData<KitchenStation[]>(["/api/kitchen-stations"]) || [];
        if (stations.length === 0) {
          try {
            const stRes = await fetch("/api/kitchen-stations", { credentials: "include" });
            if (stRes.ok) {
              stations = await stRes.json();
              queryClient.setQueryData(["/api/kitchen-stations"], stations);
            }
          } catch (_) {}
        }

        type JobWithPrinter = {
          job: (typeof kotJobs)[number];
          stationPrinterUrl: string | null;
          html: string;
        };

        const networkJobs: JobWithPrinter[] = [];
        const browserJobs: JobWithPrinter[] = [];

        for (const job of kotJobs) {
          const stationPrinterUrl = job.station
            ? (stations.find(s => s.name === job.station)?.printerUrl ?? null)
            : null;
          const p = job.payload || {};
          const html = renderKotHtml({
            restaurantName,
            kotNumber: p.kotSequence != null
              ? `KOT-${String(p.kotSequence).padStart(3, "0")}`
              : p.orderId?.slice(-6).toUpperCase(),
            orderId: p.orderId || orderId,
            orderType: p.orderType,
            tableNumber: p.tableNumber,
            station: p.station || job.station,
            sentAt: p.sentAt || new Date().toISOString(),
            items: p.items || [],
          });

          const entry: JobWithPrinter = { job, stationPrinterUrl, html };
          if (stationPrinterUrl) {
            networkJobs.push(entry);
          } else {
            browserJobs.push(entry);
          }
        }

        let printedCount = 0;
        let failedCount = 0;
        let usedNetworkPrinter = false;

        for (const { job, stationPrinterUrl, html } of networkJobs) {
          usedNetworkPrinter = true;
          const result = await dispatchPrint(html, stationPrinterUrl, {
            onNetworkSuccess: () => {
              apiRequest("PATCH", `/api/print-jobs/${job.id}/status`, { status: "printed" }).catch(
                () => {}
              );
            },
            onPopupPrint: () => {
              apiRequest("PATCH", `/api/print-jobs/${job.id}/status`, { status: "printed" }).catch(
                () => {}
              );
            },
            onFailure: () => {
              apiRequest("PATCH", `/api/print-jobs/${job.id}/status`, { status: "failed" }).catch(
                () => {}
              );
            },
          });

          if (result === "failed") {
            failedCount++;
          } else {
            printedCount++;
          }
        }

        if (browserJobs.length === 1) {
          const { job, html } = browserJobs[0];
          const result = await dispatchPrint(html, null, {
            onPopupPrint: () => {
              apiRequest("PATCH", `/api/print-jobs/${job.id}/status`, { status: "printed" }).catch(
                () => {}
              );
            },
            onFailure: () => {
              apiRequest("PATCH", `/api/print-jobs/${job.id}/status`, { status: "failed" }).catch(
                () => {}
              );
            },
          });
          if (result === "failed") {
            failedCount++;
          } else {
            printedCount++;
          }
        } else if (browserJobs.length > 1) {
          const mergedHtml = buildMergedKotHtml(browserJobs.map(e => e.html));
          const jobIds = browserJobs.map(e => e.job.id);

          const markAllStatus = (status: string) => {
            for (const id of jobIds) {
              apiRequest("PATCH", `/api/print-jobs/${id}/status`, { status }).catch(() => {});
            }
          };

          const opened = printHtmlInPopup(mergedHtml, () => markAllStatus("printed"));
          if (!opened) {
            markAllStatus("failed");
            failedCount += browserJobs.length;
          } else {
            printedCount += browserJobs.length;
          }
        }

        if (failedCount > 0 && printedCount === 0) {
          toast({
            title: "KOT Print Failed",
            description: "Popup was blocked. Open your print queue to retry.",
            variant: "destructive",
          });
        } else if (failedCount > 0) {
          toast({
            title: "KOT Partially Printed",
            description: `${printedCount} sent, ${failedCount} failed. Check print queue.`,
            variant: "destructive",
          });
        } else {
          toast({
            title: "KOT Printed",
            description: `${printedCount} ticket${printedCount > 1 ? "s" : ""} sent to ${usedNetworkPrinter ? "network printer" : "print dialog"}.`,
          });
        }

        queryClient.invalidateQueries({ queryKey: ["/api/print-jobs"] });
      } catch (_) {}
    },
    [queryClient, toast]
  );

  return { dispatchKotForOrder };
}

/**
 * Merge multiple per-station KOT HTML documents into a single HTML document.
 * Each station's body content is included, separated by a dashed divider.
 * The first document provides the <head> and CSS; subsequent docs contribute
 * only their <body> inner content with a page-break separator.
 */
function buildMergedKotHtml(htmlDocs: string[]): string {
  if (htmlDocs.length === 0) return "";
  if (htmlDocs.length === 1) return htmlDocs[0];

  const bodyContents: string[] = htmlDocs.map(html => {
    const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return match ? match[1].trim() : html;
  });

  const firstDoc = htmlDocs[0];
  const headMatch = firstDoc.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headContent = headMatch ? headMatch[1] : "";

  const mergedBodyParts = bodyContents
    .map((content, idx) => {
      if (idx === 0) return content;
      return `<div style="border-top:2px dashed #000;margin-top:12px;padding-top:12px;"></div>\n${content}`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
${headContent}
<style>
  .kot-page-break { page-break-after: always; }
</style>
</head>
<body>
${mergedBodyParts}
</body>
</html>`;
}
