import { useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/app/components/ui/dialog";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Label } from "@/app/components/ui/label";
import { cn } from "@/app/components/ui/utils";
import type { IndicatorCategory } from "@/app/components/AddRecordDialog";
import { Download } from "lucide-react";

interface ExportDialogProps {
  categories: IndicatorCategory[];
  onExport: (indicatorIds: string[] | null, format: "xlsx" | "csv", onProgress?: (value: number) => void) => void;
  triggerClassName?: string;
}

export function ExportDialog({ categories, onExport, triggerClassName }: ExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const allCategoryIds = categories.map(c => c.id);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(() => allCategoryIds);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [exportAll, setExportAll] = useState(true);
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");

  const toggleCategory = (id: string, checked: boolean | "indeterminate") => {
    const isChecked = checked === true;
    setExportAll(false);
    setSelectedCategoryIds(prev => {
      if (isChecked) {
        if (prev.includes(id)) {
          return prev;
        }
        return [...prev, id];
      }
      return prev.filter(item => item !== id);
    });
  };

  const handleToggleAll = (checked: boolean | "indeterminate") => {
    if (checked === true) {
      setExportAll(true);
      setSelectedCategoryIds(allCategoryIds);
    } else {
      setExportAll(false);
      setSelectedCategoryIds([]);
    }
  };

  const handleConfirm = () => {
    if (exporting) {
      return;
    }
    setExporting(true);
    setProgress(0);
    setStatus("running");
    const idsToExport = exportAll
      ? null
      : categories
          .filter(category => selectedCategoryIds.includes(category.id))
          .flatMap(category => category.items.map((item: { id: string }) => item.id));
    try {
      onExport(idsToExport, format, value => {
        setProgress(value);
      });
      setStatus("done");
    } finally {
      setExporting(false);
      setTimeout(() => {
        setStatus("idle");
        setOpen(false);
      }, 800);
    }
  };

  const summaryLabel = exportAll
    ? "全部导出"
    : selectedCategoryIds.length === 0
      ? "未选择分类"
      : `已选 ${selectedCategoryIds.length} 个分类`;

  const canConfirm = exportAll || selectedCategoryIds.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setStatus("idle");
          setExporting(false);
          setSelectorOpen(false);
          setExportAll(true);
          setSelectedCategoryIds(allCategoryIds);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "gap-2 bg-white/80 backdrop-blur-sm border-violet-200 hover:bg-violet-50 hover:border-violet-300",
            triggerClassName,
          )}
        >
          <Download className="w-4 h-4" />
          导出Excel
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] bg-white/95 backdrop-blur-xl border-0 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">
            数据导出
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label className="text-gray-700 text-sm">导出范围</Label>
            <div className="relative">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between border-violet-200 bg-white/80 hover:bg-violet-50"
                onClick={() => {
                  console.log("[ExportDialog] range button clicked");
                  setSelectorOpen(prev => {
                    const next = !prev;
                    console.log("[ExportDialog] selectorOpen change:", next);
                    return next;
                  });
                }}
              >
                <span className="text-sm text-gray-700">{summaryLabel}</span>
                <span className="text-xs text-gray-400">点击选择指标</span>
              </Button>
              {selectorOpen && (
                <div className="absolute right-0 mt-2 w-[280px] bg-white/95 backdrop-blur-xl border border-violet-200 rounded-lg shadow-lg z-[60] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Checkbox
                      checked={exportAll}
                      onCheckedChange={handleToggleAll}
                    />
                    <span className="text-sm text-gray-700">全部导出</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-2 mt-2">
                    {categories.map(category => (
                      <label
                        key={category.id}
                        className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                      >
                        <Checkbox
                          checked={
                            exportAll || selectedCategoryIds.includes(category.id)
                          }
                          onCheckedChange={(checked: boolean | "indeterminate") =>
                            toggleCategory(category.id, checked)
                          }
                        />
                        <span>{category.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <p className="text-[11px] text-gray-400">
              默认导出所有指标。若只需要部分指标，请在上方下拉中取消勾选。
            </p>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>导出格式</span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={format === "xlsx" ? "default" : "outline"}
                className="h-7 px-3 text-xs"
                onClick={() => setFormat("xlsx")}
              >
                Excel
              </Button>
              <Button
                type="button"
                size="sm"
                variant={format === "csv" ? "default" : "outline"}
                className="h-7 px-3 text-xs"
                onClick={() => setFormat("csv")}
              >
                CSV
              </Button>
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              当前共 {categories.length} 个检验指标分类。
            </span>
            {status === "running" && (
              <span className="text-violet-500">
                正在导出{progress > 0 ? `（${progress}%）` : "，请稍候..."}
              </span>
            )}
            {status === "done" && (
              <span className="text-emerald-600">导出完成</span>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              className="border-violet-200 hover:bg-violet-50"
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={!canConfirm || exporting}
              onClick={handleConfirm}
              className="bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? "导出中..." : "开始导出"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
