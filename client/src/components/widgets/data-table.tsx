import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion } from "framer-motion";

interface Column {
  key: string;
  label: string;
  render?: (value: any, row: any) => React.ReactNode;
}

interface DataTableProps {
  title: string;
  columns: Column[];
  data: any[];
  testId?: string;
}

export function DataTable({ title, columns, data, testId }: DataTableProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
    >
      <Card data-testid={testId}>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead key={col.key}>{col.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">
                    No data available
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row, i) => (
                  <TableRow key={row.id || i} data-testid={testId ? `${testId}-row-${i}` : undefined}>
                    {columns.map((col) => (
                      <TableCell key={col.key}>
                        {col.render ? col.render(row[col.key], row) : row[col.key]}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </motion.div>
  );
}
