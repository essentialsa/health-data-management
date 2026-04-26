import { useMemo, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/app/components/ui/dialog";
import { cn } from "@/app/components/ui/utils";
import { ClipboardList, Copy, Download, Sparkles } from "lucide-react";
import type { HealthRecord, IndicatorCategory, IndicatorItem } from "@/app/components/AddRecordDialog";

type SelectionMode = "single" | "multiple";

interface ConsultationBriefDialogProps {
  categories: IndicatorCategory[];
  records: HealthRecord[];
  triggerClassName?: string;
}

type NumericRange = {
  min: number;
  max: number;
};

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return "-";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2);
};

const parseNumericRange = (text?: string): NumericRange | null => {
  if (!text) {
    return null;
  }
  const match = text.trim().match(/(-?\d+(?:\.\d+)?)\s*[-~—–]\s*(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }
  return {
    min: Math.min(min, max),
    max: Math.max(min, max),
  };
};

const findIndicatorRecords = (records: HealthRecord[], indicatorId: string) =>
  records
    .filter(record => record.indicatorType === indicatorId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

const describeTrend = (records: HealthRecord[]) => {
  if (records.length < 2) {
    return "样本不足，建议继续追踪。";
  }
  const latest = records[records.length - 1];
  const previous = records[records.length - 2];
  const delta = latest.value - previous.value;
  if (Math.abs(delta) < 0.001) {
    return "与上次基本持平。";
  }
  const arrow = delta > 0 ? "↑" : "↓";
  return `较上次 ${arrow}${formatNumber(Math.abs(delta))}`;
};

const describeRangeStatus = (item: IndicatorItem, latestValue: number) => {
  const range = parseNumericRange(item.referenceRange);
  if (!range) {
    return null;
  }
  if (latestValue > range.max) {
    return `高于参考范围(${item.referenceRange})`;
  }
  if (latestValue < range.min) {
    return `低于参考范围(${item.referenceRange})`;
  }
  return `处于参考范围(${item.referenceRange})`;
};

const buildConsultationBrief = ({
  selectedCategories,
  records,
}: {
  selectedCategories: IndicatorCategory[];
  records: HealthRecord[];
}) => {
  const selectedIndicatorIds = selectedCategories.flatMap(category => category.items.map(item => item.id));
  const scopedRecords = records
    .filter(record => selectedIndicatorIds.includes(record.indicatorType))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (scopedRecords.length === 0) {
    return "当前所选指标种类暂无可用数据，请先导入或录入检验记录。";
  }

  const firstDate = scopedRecords[0].date;
  const lastDate = scopedRecords[scopedRecords.length - 1].date;
  const summaryLines: string[] = [];
  const detailLines: string[] = [];
  const abnormalLines: string[] = [];

  selectedCategories.forEach(category => {
    const categoryIndicatorIds = category.items.map(item => item.id);
    const categoryRecords = scopedRecords.filter(record => categoryIndicatorIds.includes(record.indicatorType));
    if (categoryRecords.length === 0) {
      return;
    }
    summaryLines.push(`- ${category.name}：${category.items.length} 项指标，${categoryRecords.length} 条记录`);

    detailLines.push(`【${category.name}】`);
    category.items.forEach(item => {
      const indicatorRecords = findIndicatorRecords(scopedRecords, item.id);
      if (indicatorRecords.length === 0) {
        return;
      }

      const latest = indicatorRecords[indicatorRecords.length - 1];
      const recentPoints = indicatorRecords.slice(-6).map(record => `${record.date} ${formatNumber(record.value)}`).join("；");
      const trend = describeTrend(indicatorRecords);
      const rangeStatus = describeRangeStatus(item, latest.value);

      detailLines.push(
        `- ${item.label}${item.unit ? `（${item.unit}）` : ""}：${recentPoints}（最新 ${formatNumber(latest.value)}，${trend}${
          rangeStatus ? `，${rangeStatus}` : ""
        }）`,
      );

      if (rangeStatus?.includes("高于") || rangeStatus?.includes("低于")) {
        abnormalLines.push(`- ${category.name} / ${item.label}：${rangeStatus}，建议结合近期症状与用药史复核。`);
      }
    });
  });

  const questionLines = [
    "1. 近 2 周是否出现乏力、头晕、胸闷、睡眠变化等不适，出现时间与指标波动是否一致？",
    "2. 近期饮食结构、饮酒、运动频率、体重变化与既往相比有什么明显改变？",
    "3. 当前是否正在服用影响相关指标的药物或保健品，是否需要调整用药或复查周期？",
  ];

  const generatedAt = new Date().toLocaleString("zh-CN");
  return [
    "【问诊简报】",
    `生成时间：${generatedAt}`,
    `覆盖日期：${firstDate} ~ ${lastDate}`,
    `检验指标种类：${selectedCategories.map(category => category.name).join("、")}`,
    `数据条数：${scopedRecords.length}`,
    "",
    "【分类概览】",
    ...summaryLines,
    "",
    "【指标明细】",
    ...detailLines,
    "",
    "【异常关注点】",
    ...(abnormalLines.length > 0 ? abnormalLines : ["- 暂未发现超出参考范围的异常项，建议继续规律复查。"]),
    "",
    "【问诊建议问题】",
    ...questionLines,
  ].join("\n");
};

export function ConsultationBriefDialog({ categories, records, triggerClassName }: ConsultationBriefDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("multiple");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [briefContent, setBriefContent] = useState("");
  const [copied, setCopied] = useState(false);

  const categoriesWithData = useMemo(() => {
    return categories.filter(category =>
      category.items.some(item => records.some(record => record.indicatorType === item.id)),
    );
  }, [categories, records]);

  const selectedCategories = useMemo(() => {
    return categoriesWithData.filter(category => selectedCategoryIds.includes(category.id));
  }, [categoriesWithData, selectedCategoryIds]);

  const resetDialog = () => {
    setSelectionMode("multiple");
    setSelectedCategoryIds([]);
    setBriefContent("");
    setCopied(false);
  };

  const toggleCategory = (categoryId: string, checked: boolean) => {
    if (selectionMode === "single") {
      setSelectedCategoryIds(checked ? [categoryId] : []);
      return;
    }
    setSelectedCategoryIds(prev => {
      if (checked) {
        if (prev.includes(categoryId)) {
          return prev;
        }
        return [...prev, categoryId];
      }
      return prev.filter(id => id !== categoryId);
    });
  };

  const applySelectionMode = (mode: SelectionMode) => {
    setSelectionMode(mode);
    if (mode === "single" && selectedCategoryIds.length > 1) {
      setSelectedCategoryIds([selectedCategoryIds[0]]);
    }
  };

  const handleGenerateBrief = () => {
    if (selectedCategories.length === 0) {
      setBriefContent("请先选择至少一个检验指标种类。");
      return;
    }
    const next = buildConsultationBrief({ selectedCategories, records });
    setBriefContent(next);
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!briefContent) {
      return;
    }
    try {
      await navigator.clipboard.writeText(briefContent);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1200);
    } catch {
      setCopied(false);
    }
  };

  const handleDownload = () => {
    if (!briefContent) {
      return;
    }
    const blob = new Blob([briefContent], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `问诊简报_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetDialog();
          return;
        }
        if (categoriesWithData.length > 0) {
          setSelectedCategoryIds([categoriesWithData[0].id]);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "gap-2 bg-white/80 backdrop-blur-sm border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300",
            triggerClassName,
          )}
        >
          <ClipboardList className="w-4 h-4" />
          问诊简报
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[860px] max-h-[88vh] overflow-y-auto bg-white/95 backdrop-blur-xl border-0 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl bg-gradient-to-r from-emerald-600 to-cyan-600 bg-clip-text text-transparent flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-500" />
            问诊简报生成
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-3">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
            <div className="text-sm font-medium text-emerald-800 mb-2">选择模式</div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant={selectionMode === "single" ? "default" : "outline"}
                onClick={() => applySelectionMode("single")}
                className="h-8"
              >
                单选
              </Button>
              <Button
                type="button"
                size="sm"
                variant={selectionMode === "multiple" ? "default" : "outline"}
                onClick={() => applySelectionMode("multiple")}
                className="h-8"
              >
                多选
              </Button>
              <span className="text-xs text-gray-500 ml-2">
                {selectionMode === "single" ? "单个分类深度问诊" : "多个分类综合问诊"}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-violet-100 bg-white/80 p-3">
            <div className="text-sm font-medium text-gray-700 mb-2">检验指标种类</div>
            {categoriesWithData.length === 0 ? (
              <div className="text-sm text-gray-500">暂无可用数据，请先录入或导入体检记录。</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {categoriesWithData.map(category => {
                  const checked = selectedCategoryIds.includes(category.id);
                  return (
                    <label
                      key={category.id}
                      className="flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2 text-sm text-gray-700 cursor-pointer hover:bg-violet-50"
                    >
                      <Checkbox checked={checked} onCheckedChange={value => toggleCategory(category.id, value === true)} />
                      <span className="truncate">{category.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={handleGenerateBrief} disabled={categoriesWithData.length === 0}>
              生成简报
            </Button>
            <Button type="button" variant="outline" onClick={handleCopy} disabled={!briefContent}>
              <Copy className="w-4 h-4" />
              {copied ? "已复制" : "复制简报"}
            </Button>
            <Button type="button" variant="outline" onClick={handleDownload} disabled={!briefContent}>
              <Download className="w-4 h-4" />
              下载 TXT
            </Button>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">简报预览</div>
            <textarea
              value={briefContent}
              placeholder="点击“生成简报”后在此查看内容"
              readOnly
              className="w-full min-h-[320px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm leading-6 text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
