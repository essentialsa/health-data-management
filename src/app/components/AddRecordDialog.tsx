import type React from "react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { cn } from "@/app/components/ui/utils";
import { Plus } from "lucide-react";

export interface IndicatorItem {
  id: string;
  label: string;
  unit: string;
  code?: string;
  referenceRange?: string;
  dataType?: "number" | "text" | "boolean";
  enabled?: boolean;
  order?: number;
}

export interface IndicatorCategory {
  id: string;
  name: string;
  code?: string;
  enabled?: boolean;
  order?: number;
  items: IndicatorItem[];
}

export interface HealthRecord {
  id: string;
  date: string;
  indicatorType: string;
  value: number;
  unit: string;
  operationAt?: string;
}

interface AddRecordDialogProps {
  onAddRecord: (record: HealthRecord) => void;
  indicatorCategories: IndicatorCategory[];
  triggerClassName?: string;
}

export function AddRecordDialog({ onAddRecord, indicatorCategories, triggerClassName }: AddRecordDialogProps) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCategoryId || !date) {
      return;
    }

    const category = indicatorCategories.find(c => c.id === selectedCategoryId);
    if (!category) {
      return;
    }

    const activeItems = category.items.filter(item => {
      const v = values[item.id];
      return v !== undefined && v !== "";
    });

    if (activeItems.length === 0) {
      return;
    }

    activeItems.forEach(item => {
      const raw = values[item.id];
      const parsed = parseFloat(raw);
      if (Number.isNaN(parsed)) {
        return;
      }

      const newRecord: HealthRecord = {
        id: `${Date.now()}_${item.id}_${Math.random().toString(36).slice(2, 8)}`,
        date,
        indicatorType: item.id,
        value: parsed,
        unit: item.unit,
        operationAt: new Date().toISOString(),
      };

      onAddRecord(newRecord);
    });

    setValues({});
    setSelectedCategoryId("");
    setOpen(false);
  };

  const selectedCategory = indicatorCategories.find(c => c.id === selectedCategoryId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          className={cn(
            "gap-2 bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 shadow-lg shadow-violet-200 hover:shadow-xl hover:shadow-violet-300 transition-all duration-300",
            triggerClassName,
          )}
        >
          <Plus className="w-4 h-4" />
          添加检验记录
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px] bg-white/95 backdrop-blur-xl border-0 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">
            添加体检记录
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="date" className="text-gray-700">数据日期</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="border-violet-200 focus:border-violet-400 focus:ring-violet-400"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="indicator" className="text-gray-700">检验指标</Label>
            <Select
              value={selectedCategoryId}
              onValueChange={(value) => {
                setSelectedCategoryId(value);
                setValues({});
              }}
              required
            >
              <SelectTrigger className="border-violet-200 focus:border-violet-400 focus:ring-violet-400">
                <SelectValue placeholder="选择检验指标" />
              </SelectTrigger>
              <SelectContent className="bg-white/95 backdrop-blur-xl border-violet-200">
                {indicatorCategories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedCategory && (
            <div className="space-y-4">
              {selectedCategory.items.map((item) => (
                <div key={item.id} className="space-y-2">
                  <Label className="text-gray-700">
                    {item.label} {item.unit && `(${item.unit})`}
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={values[item.id] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [item.id]: e.target.value,
                      }))
                    }
                    placeholder="输入数值"
                    className="border-violet-200 focus:border-violet-400 focus:ring-violet-400"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
              className="border-violet-200 hover:bg-violet-50"
            >
              取消
            </Button>
            <Button 
              type="submit"
              className="bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600"
            >
              保存
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
