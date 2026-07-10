import { useEffect, useState } from "react";
import { Trash2, RotateCcw, Undo2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import type { TrashItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function RecycleBin() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/trash");
      setItems(data.items);
    } catch {
      toast.error("Failed to load recycle bin");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const restore = async (item: TrashItem) => {
    try {
      await api.post(`/trash/${item._id}/restore`);
      toast.success(`${item.kind} restored`);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Restore failed");
    }
  };

  const purge = async (item: TrashItem) => {
    if (!confirm(`Permanently delete "${item.label}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/trash/${item._id}`);
      toast.success("Deleted permanently");
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recycle Bin</h1>
        <p className="text-muted-foreground">
          Deleted students, teachers, staff and fee items land here. Restore anything deleted by mistake.
        </p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Deleted by</TableHead>
              <TableHead>When</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                    <Undo2 className="h-8 w-8" />
                    <p>The recycle bin is empty. Deleted items can be restored from here.</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => (
                <TableRow key={item._id}>
                  <TableCell>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                      {item.kind}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{item.label}</TableCell>
                  <TableCell className="text-muted-foreground">{item.deletedByName || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString("en-IN")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button variant="outline" size="sm" onClick={() => restore(item)}>
                      <RotateCcw className="h-4 w-4" /> Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2 text-destructive hover:text-destructive"
                      onClick={() => purge(item)}
                      title="Delete forever"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
