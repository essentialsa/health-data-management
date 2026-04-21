import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Badge } from "@/app/components/ui/badge";

interface IndicatorGroup {
  categoryId: string;
  categoryName: string;
  indicators: { rawLabel: string; value: number; unit: string; systemLabel?: string }[];
}

interface CategorySelectDialogProps {
  open: boolean;
  groups: IndicatorGroup[];
  existingCategories: { id: string; name: string }[];
  onClose: () => void;
  onConfirm: (actions: { groupId: string; action: "create" | "assign" | "skip"; categoryId?: string; customName?: string }[]) => void;
}

export function CategorySelectDialog({ open, groups, existingCategories, onClose, onConfirm }: CategorySelectDialogProps) {
  const [actions, setActions] = useState<Record<string, { type: "create" | "assign"; value?: string }>>(
    Object.fromEntries(groups.map(g => [g.categoryId, { type: "create" }]))
  );

  const handleConfirm = () => {
    const result = groups.map(g => {
      const a = actions[g.categoryId];
      if (a?.type === "assign" && a.value) return { groupId: g.categoryId, action: "assign" as const, categoryId: a.value };
      return { groupId: g.categoryId, action: "create" as const, customName: g.categoryName };
    });
    onConfirm(result);
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>新增指标分类</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.categoryId} className="space-y-3 border rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{group.categoryId}</Badge>
                <span className="text-sm font-medium">系统建议：{group.categoryName}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                包含指标：{group.indicators.map(i => i.rawLabel).join("、")}
              </div>
              <RadioGroup
                value={actions[group.categoryId]?.type || "create"}
                onValueChange={v => setActions(prev => ({ ...prev, [group.categoryId]: { type: v as "create" | "assign" } }))}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="create" id={`create-${group.categoryId}`} />
                  <Label htmlFor={`create-${group.categoryId}`}>创建新分类</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="assign" id={`assign-${group.categoryId}`} />
                  <Label htmlFor={`assign-${group.categoryId}`}>放入已有分类</Label>
                </div>
              </RadioGroup>
              {actions[group.categoryId]?.type === "assign" && (
                <Select onValueChange={v => setActions(prev => ({ ...prev, [group.categoryId]: { type: "assign", value: v } }))}>
                  <SelectTrigger><SelectValue placeholder="选择分类" /></SelectTrigger>
                  <SelectContent>
                    {existingCategories.map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>跳过全部</Button>
          <Button onClick={handleConfirm}>确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}