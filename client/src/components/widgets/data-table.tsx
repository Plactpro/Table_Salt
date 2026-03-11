import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";

interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
}

interface DataTableProps {
  title: string;
  columns: Column[];
  data: any[];
  loading?: boolean;
  testId?: string;
  index?: number;
}

function LoadingSkeleton({ columns, rows = 5 }: { columns: Column[]; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={i}>
          {columns.map((col) => (
            <TableCell key={col.key}>
              <Skeleton className="h-4 w-full max-w-[120px] animate-[skeleton-pulse_1.5s_ease-in-out_infinite]" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function DataTable({ title, columns, data, loading = false, testId, index = 0 }: DataTableProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 + index * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <Card data-testid={testId} className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base font-heading">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {columns.map((col) => (
                  <TableHead key={col.key} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{col.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <LoadingSkeleton columns={columns} />
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                    No data available
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row, i) => (
                  <motion.tr
                    key={row.id || i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: i * 0.03 }}
                    className="border-b transition-colors duration-150 hover:bg-muted/50 group"
                    data-testid={testId ? `${testId}-row-${i}` : undefined}
                  >
                    {columns.map((col) => (
                      <TableCell key={col.key} className="transition-colors duration-150">
                        {col.render ? col.render(row[col.key], row) : row[col.key]}
                      </TableCell>
                    ))}
                  </motion.tr>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </motion.div>
  );
}
