import { useMemo, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Checkbox } from "@/app/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/app/components/ui/dialog";
import { cn } from "@/app/components/ui/utils";
import { ClipboardList, Copy, Download, Sparkles } from "lucide-react";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import type { HealthRecord, IndicatorCategory, IndicatorItem } from "@/app/components/AddRecordDialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

type PivotCell = {
  value: string;
  abnormal: boolean;
};

type PivotIndicator = {
  name: string;
  unit: string;
  referenceRange: string;
};

type PivotTable = {
  categoryId: string;
  categoryName: string;
  indicators: PivotIndicator[];
  dates: string[];
  rows: (PivotCell | null)[][];
};

type AbnormalItem = {
  categoryName: string;
  indicatorName: string;
  value: string;
  unit: string;
  status: string;
  date: string;
};

type ConsultationReport = {
  title: string;
  generatedAt: string;
  dateRange: string;
  firstDate: string;
  lastDate: string;
  categoryNames: string[];
  recordCount: number;
  indicatorCount: number;
  abnormalCount: number;
  pivotTables: PivotTable[];
  abnormalItems: AbnormalItem[];
  questions: string[];
};

// ---------------------------------------------------------------------------
// Utility helpers (preserved)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// HTML escape helper
// ---------------------------------------------------------------------------

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

const questionLines = [
  "近 2 周是否出现乏力、头晕、胸闷、睡眠变化等不适，出现时间与指标波动是否一致？",
  "近期饮食结构、饮酒、运动频率、体重变化与既往相比有什么明显改变？",
  "当前是否正在服用影响相关指标的药物或保健品，是否需要调整用药或复查周期？",
];

const buildConsultationReport = ({
  selectedCategories,
  records,
  dateFrom,
  dateTo,
}: {
  selectedCategories: IndicatorCategory[];
  records: HealthRecord[];
  dateFrom: string;
  dateTo: string;
}): ConsultationReport | null => {
  const selectedIndicatorIds = selectedCategories.flatMap(category => category.items.map(item => item.id));

  let scopedRecords = records.filter(record => selectedIndicatorIds.includes(record.indicatorType));

  if (dateFrom) {
    scopedRecords = scopedRecords.filter(record => record.date >= dateFrom);
  }
  if (dateTo) {
    scopedRecords = scopedRecords.filter(record => record.date <= dateTo);
  }

  if (scopedRecords.length === 0) {
    return null;
  }

  scopedRecords.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const firstDate = scopedRecords[0].date;
  const lastDate = scopedRecords[scopedRecords.length - 1].date;
  const generatedAt = new Date().toLocaleString("zh-CN");

  // Build indicator lookup
  const indicatorLookup = new Map<string, IndicatorItem>();
  selectedCategories.forEach(cat => {
    cat.items.forEach(item => {
      indicatorLookup.set(item.id, item);
    });
  });

  const seenIndicators = new Set<string>();
  scopedRecords.forEach(r => seenIndicators.add(r.indicatorType));
  const indicatorCount = seenIndicators.size;

  // Build one pivot table per category
  const pivotTables: PivotTable[] = [];
  const abnormalItems: AbnormalItem[] = [];
  const seenAbnormal = new Set<string>();

  selectedCategories.forEach(category => {
    const categoryItemIds = category.items.map(item => item.id);
    const categoryRecords = scopedRecords.filter(r => categoryItemIds.includes(r.indicatorType));
    if (categoryRecords.length === 0) return;

    // Determine which indicators and dates appear in this category
    const catDates = Array.from(new Set(categoryRecords.map(r => r.date))).sort();
    const catIndicatorIds = Array.from(
      new Set(categoryRecords.map(r => r.indicatorType)),
    );
    // Preserve category item order
    const orderedIndicators = category.items.filter(item => catIndicatorIds.includes(item.id));

    const indicators: PivotIndicator[] = orderedIndicators.map(item => ({
      name: item.label,
      unit: item.unit ?? "",
      referenceRange: item.referenceRange ?? "",
    }));

    // Build lookup: date -> indicatorId -> record
    const cellMap = new Map<string, Map<string, HealthRecord>>();
    categoryRecords.forEach(record => {
      if (!cellMap.has(record.date)) {
        cellMap.set(record.date, new Map());
      }
      cellMap.get(record.date)!.set(record.indicatorType, record);
    });

    // Build rows
    const rows: (PivotCell | null)[][] = catDates.map(date => {
      const dateCells = cellMap.get(date)!;
      return orderedIndicators.map(item => {
        const record = dateCells.get(item.id);
        if (!record) return null;
        const rangeStatus = describeRangeStatus(item, record.value);
        const abnormal = !!(rangeStatus && (rangeStatus.includes("高于") || rangeStatus.includes("低于")));

        if (abnormal) {
          const abKey = `${category.name}_${item.label}`;
          if (!seenAbnormal.has(abKey)) {
            seenAbnormal.add(abKey);
            abnormalItems.push({
              categoryName: category.name,
              indicatorName: item.label,
              value: formatNumber(record.value),
              unit: item.unit ?? "",
              status: rangeStatus!,
              date,
            });
          }
        }

        return { value: formatNumber(record.value), abnormal };
      });
    });

    pivotTables.push({
      categoryId: category.id,
      categoryName: category.name,
      indicators,
      dates: catDates,
      rows,
    });
  });

  const dateRangeLabel = dateFrom && dateTo
    ? `${dateFrom} ~ ${dateTo}`
    : dateFrom
      ? `${dateFrom} ~ 至今`
      : dateTo
        ? `起始 ~ ${dateTo}`
        : "全部";

  return {
    title: "个人健康档案问诊报告",
    generatedAt,
    dateRange: dateRangeLabel,
    firstDate,
    lastDate,
    categoryNames: selectedCategories.map(c => c.name),
    recordCount: scopedRecords.length,
    indicatorCount,
    abnormalCount: abnormalItems.length,
    pivotTables,
    abnormalItems,
    questions: [...questionLines],
  };
};

// ---------------------------------------------------------------------------
// Plain-text summary (for clipboard)
// ---------------------------------------------------------------------------

const buildReportPlainText = (report: ConsultationReport): string => {
  const lines: string[] = [];

  lines.push("【个人健康档案问诊报告】");
  lines.push(`生成时间：${report.generatedAt}`);
  lines.push(`时间范围：${report.dateRange}`);
  lines.push(`实际周期：${report.firstDate} ~ ${report.lastDate}`);
  lines.push(`指标分类：${report.categoryNames.join("、")}`);
  lines.push(`数据条数：${report.recordCount}`);
  lines.push(`异常指标数：${report.abnormalCount}`);
  lines.push("");

  lines.push("【异常关注项】");
  if (report.abnormalItems.length > 0) {
    report.abnormalItems.forEach(item => {
      lines.push(`- ${item.categoryName} / ${item.indicatorName}：${item.status}，数值 ${item.value} ${item.unit}（${item.date}）`);
    });
  } else {
    lines.push("- 暂未发现超出参考范围的异常项，建议继续规律复查。");
  }
  lines.push("");

  report.pivotTables.forEach(table => {
    lines.push(`【${table.categoryName}】`);
    // Header
    const header = ["日期", ...table.indicators.map(ind => ind.name)];
    lines.push(header.join("\t"));
    // Rows
    table.dates.forEach((date, rowIdx) => {
      const cells = table.rows[rowIdx].map(cell => {
        if (!cell) return "-";
        const suffix = cell.abnormal ? "↑" : "";
        return `${cell.value}${suffix}`;
      });
      lines.push([date, ...cells].join("\t"));
    });
    lines.push("");
  });

  lines.push("【建议沟通重点】");
  report.questions.forEach((q, i) => {
    lines.push(`${i + 1}. ${q}`);
  });

  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// HTML report builder
// ---------------------------------------------------------------------------

const buildReportHtml = (report: ConsultationReport): string => {
  const pivotSections = report.pivotTables
    .map(table => {
      const headerCells = table.indicators
        .map(ind => {
          const unitPart = ind.unit ? ` <span class="unit-label">(${escapeHtml(ind.unit)})</span>` : "";
          const ref = ind.referenceRange ? `<br><small>${escapeHtml(ind.referenceRange)}</small>` : "";
          return `<th class="numeric">${escapeHtml(ind.name)}${unitPart}${ref}</th>`;
        })
        .join("");

      const bodyRows = table.dates
        .map((date, rowIdx) => {
          const cells = table.rows[rowIdx]
            .map(cell => {
              if (!cell) return '<td class="numeric">-</td>';
              const cls = cell.abnormal ? 'numeric abnormal' : 'numeric';
              return `<td class="${cls}">${escapeHtml(cell.value)}</td>`;
            })
            .join("");
          return `<tr><td>${escapeHtml(date)}</td>${cells}</tr>`;
        })
        .join("");

      return `
      <section class="pivot-section">
        <h3>${escapeHtml(table.categoryName)}</h3>
        <table class="report-table">
          <thead>
            <tr>
              <th>日期</th>
              ${headerCells}
            </tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </section>`;
    })
    .join("");

  const abnormalHtml =
    report.abnormalItems.length > 0
      ? `<ul>${report.abnormalItems
          .map(
            item =>
              `<li>${escapeHtml(item.categoryName)} / ${escapeHtml(item.indicatorName)}：${escapeHtml(item.status)}，数值 ${escapeHtml(item.value)} ${escapeHtml(item.unit)}（${escapeHtml(item.date)}）</li>`,
          )
          .join("")}</ul>`
      : `<p>暂未发现超出参考范围的异常项，建议继续规律复查。</p>`;

  const questionsHtml = report.questions.map(q => `<li>${escapeHtml(q)}</li>`).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>个人健康档案问诊报告</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      background: #f5f5f5;
      color: #222;
      font-size: 14px;
      line-height: 1.6;
    }

    .report-page {
      width: 210mm;
      min-height: 297mm;
      margin: 24px auto;
      background: #fff;
      padding: 40px 48px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    }

    .report-header {
      text-align: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1.5px solid #222;
    }

    .report-header h1 {
      font-size: 22px;
      font-weight: 700;
      color: #111;
      margin-bottom: 4px;
    }

    .report-header .subtitle {
      font-size: 13px;
      color: #888;
    }

    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 24px;
      margin-bottom: 20px;
      font-size: 13px;
      color: #444;
    }

    .info-grid dt { color: #888; }
    .info-grid dd { font-weight: 500; }

    .summary-box {
      background: #fafafa;
      border: 1px solid #eee;
      border-radius: 6px;
      padding: 14px 18px;
      margin-bottom: 20px;
      font-size: 13px;
      color: #555;
    }

    .summary-box p { margin-bottom: 4px; }
    .summary-box p:last-child { margin-bottom: 0; }
    .summary-box strong { color: #222; }

    .abnormal-section {
      margin-bottom: 20px;
    }

    .abnormal-section h2 {
      font-size: 15px;
      font-weight: 600;
      color: #222;
      margin-bottom: 8px;
    }

    .abnormal-section ul {
      list-style: disc;
      padding-left: 20px;
      font-size: 13px;
      color: #555;
    }

    .abnormal-section li {
      margin-bottom: 4px;
    }

    .pivot-section {
      margin-bottom: 24px;
      page-break-inside: avoid;
    }

    .pivot-section h3 {
      font-size: 16px;
      font-weight: 700;
      color: #111;
      text-align: center;
      margin-bottom: 8px;
    }

    .report-table {
      width: 100%;
      border-collapse: collapse;
      border-top: 2px solid #111;
      border-bottom: 2px solid #111;
      margin-top: 8px;
      font-size: 13px;
    }

    .report-table thead {
      border-bottom: 1.5px solid #111;
    }

    .report-table th,
    .report-table td {
      border: none;
      padding: 8px 10px;
      text-align: center;
      font-weight: inherit;
    }

    .report-table th {
      font-weight: 700;
    }

    .report-table .unit-label {
      font-weight: 700;
      color: inherit;
    }

    .report-table .numeric {
      font-variant-numeric: tabular-nums;
    }

    .report-table .abnormal {
      color: #b91c1c;
    }

    .questions-section {
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid #ddd;
    }

    .questions-section h2 {
      font-size: 15px;
      font-weight: 600;
      color: #222;
      margin-bottom: 8px;
    }

    .questions-section ol {
      padding-left: 20px;
      font-size: 13px;
      color: #444;
    }

    .questions-section li {
      margin-bottom: 6px;
    }

    .report-footer {
      margin-top: 32px;
      padding-top: 12px;
      border-top: 1px solid #ddd;
      font-size: 12px;
      color: #999;
      text-align: center;
    }

    @page {
      size: A4;
      margin: 16mm;
    }

    @media print {
      body {
        background: #fff;
      }

      .report-page {
        width: auto;
        min-height: auto;
        box-shadow: none;
        padding: 0;
      }

      .pivot-section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="report-page">
    <div class="report-header">
      <h1>${escapeHtml(report.title)}</h1>
      <div class="subtitle">Personal Health Consultation Report</div>
    </div>

    <dl class="info-grid">
      <dt>生成时间</dt>
      <dd>${escapeHtml(report.generatedAt)}</dd>
      <dt>时间范围</dt>
      <dd>${escapeHtml(report.dateRange)}</dd>
      <dt>指标分类</dt>
      <dd>${escapeHtml(report.categoryNames.join("、"))}</dd>
      <dt>数据条数</dt>
      <dd>${report.recordCount}</dd>
    </dl>

    <div class="summary-box">
      <p>纳入指标数：<strong>${report.indicatorCount}</strong></p>
      <p>异常指标数：<strong>${report.abnormalCount}</strong></p>
      <p>实际周期：<strong>${escapeHtml(report.firstDate)} ~ ${escapeHtml(report.lastDate)}</strong></p>
      <p>本报告基于用户录入或导入的健康指标数据自动整理，仅用于问诊沟通辅助，不替代医生诊断。</p>
    </div>

    <div class="abnormal-section">
      <h2>异常关注项</h2>
      ${abnormalHtml}
    </div>

    ${pivotSections}

    <div class="questions-section">
      <h2>建议沟通重点</h2>
      <ol>${questionsHtml}</ol>
    </div>

    <div class="report-footer">
      本报告由 PersonalHealthHub 自动生成 &mdash; ${escapeHtml(report.generatedAt)}
    </div>
  </div>
</body>
</html>`;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConsultationBriefDialog({ categories, records, triggerClassName }: ConsultationBriefDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>("multiple");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [report, setReport] = useState<ConsultationReport | null>(null);
  const [plainText, setPlainText] = useState("");
  const [message, setMessage] = useState("");
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
    setDateFrom("");
    setDateTo("");
    setReport(null);
    setPlainText("");
    setMessage("");
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

  const handleGenerateReport = () => {
    if (selectedCategories.length === 0) {
      setMessage("请先选择至少一个检验指标种类。");
      setReport(null);
      setPlainText("");
      return;
    }

    const nextReport = buildConsultationReport({
      selectedCategories,
      records,
      dateFrom,
      dateTo,
    });

    if (!nextReport) {
      setMessage("当前所选指标种类暂无可用数据，请先导入或录入检验记录。");
      setReport(null);
      setPlainText("");
      return;
    }

    setReport(nextReport);
    setPlainText(buildReportPlainText(nextReport));
    setMessage("");
    setCopied(false);
  };

  const handleCopy = async () => {
    if (!plainText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1200);
    } catch {
      setCopied(false);
    }
  };

  const handleDownloadHtml = () => {
    if (!report) {
      return;
    }
    const html = buildReportHtml(report);
    const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `个人健康档案问诊报告_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    if (!report) {
      return;
    }
    const html = buildReportHtml(report);
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
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
          className={cn(
            "gap-2 bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 shadow-lg shadow-violet-200 hover:shadow-xl hover:shadow-violet-300 transition-all duration-300",
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

          <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-3">
            <div className="text-sm font-medium text-sky-800 mb-2">时间范围（可选）</div>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="consult-date-from" className="text-sm text-gray-600">从</Label>
              <Input
                id="consult-date-from"
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-8 w-[150px] border-sky-200 focus:border-sky-400 focus:ring-sky-400"
              />
              <Label htmlFor="consult-date-to" className="text-sm text-gray-600">至</Label>
              <Input
                id="consult-date-to"
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-8 w-[150px] border-sky-200 focus:border-sky-400 focus:ring-sky-400"
              />
              {(dateFrom || dateTo) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-gray-400"
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                >
                  清除
                </Button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">不选择则导出全部数据</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={handleGenerateReport} disabled={categoriesWithData.length === 0}>
              生成报告
            </Button>
            <Button type="button" variant="outline" onClick={handleCopy} disabled={!plainText}>
              <Copy className="w-4 h-4" />
              {copied ? "已复制" : "复制摘要"}
            </Button>
            <Button type="button" variant="outline" onClick={handleDownloadHtml} disabled={!report}>
              <Download className="w-4 h-4" />
              下载 HTML
            </Button>
            <Button type="button" variant="outline" onClick={handlePrint} disabled={!report}>
              打印 / 导出 PDF
            </Button>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">报告预览</div>

            {!report && (
              <div className="rounded-lg border border-dashed border-gray-200 bg-white px-4 py-10 text-center text-sm text-gray-500">
                {message || "点击\u201C生成报告\u201D后在此查看档案式问诊报告"}
              </div>
            )}

            {report && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="mx-auto max-w-[760px] bg-white px-8 py-8 text-gray-900 shadow-sm">
                  {/* Title */}
                  <div className="text-center pb-4 mb-4 border-b border-gray-300">
                    <h2 className="text-xl font-bold text-gray-900">{report.title}</h2>
                    <p className="text-xs text-gray-400 mt-1">Personal Health Consultation Report</p>
                  </div>

                  {/* Basic info */}
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm mb-4">
                    <div>
                      <span className="text-gray-400">生成时间：</span>
                      <span className="font-medium">{report.generatedAt}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">时间范围：</span>
                      <span className="font-medium">{report.dateRange}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">指标分类：</span>
                      <span className="font-medium">{report.categoryNames.join("、")}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">数据条数：</span>
                      <span className="font-medium">{report.recordCount}</span>
                    </div>
                  </div>

                  {/* Summary */}
                  <div className="rounded-md bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-600 mb-4">
                    <p>
                      纳入指标数：<strong className="text-gray-900">{report.indicatorCount}</strong>
                    </p>
                    <p>
                      异常指标数：<strong className="text-gray-900">{report.abnormalCount}</strong>
                    </p>
                    <p>
                      实际周期：<strong className="text-gray-900">{report.firstDate} ~ {report.lastDate}</strong>
                    </p>
                    <p className="mt-1 text-gray-400 text-xs">
                      本报告基于用户录入或导入的健康指标数据自动整理，仅用于问诊沟通辅助，不替代医生诊断。
                    </p>
                  </div>

                  {/* Abnormal items */}
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">异常关注项</h3>
                    {report.abnormalItems.length > 0 ? (
                      <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
                        {report.abnormalItems.map((item, idx) => (
                          <li key={idx}>
                            {item.categoryName} / {item.indicatorName}：{item.status}，数值 {item.value} {item.unit}（{item.date}）
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-gray-500">暂未发现超出参考范围的异常项，建议继续规律复查。</p>
                    )}
                  </div>

                  {/* Pivot tables */}
                  {report.pivotTables.map(table => (
                    <section key={table.categoryId} className="mt-8">
                      <h3 className="text-lg font-bold text-gray-900 text-center mb-2">{table.categoryName}</h3>

                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full border-collapse border-t-2 border-b-2 border-gray-900 text-sm">
                          <thead className="border-b border-gray-900">
                            <tr>
                              <th className="py-2 px-3 text-center font-bold whitespace-nowrap">日期</th>
                              {table.indicators.map(ind => (
                                <th key={ind.name} className="py-2 px-3 text-center font-bold whitespace-nowrap">
                                  {ind.name}
                                  {ind.unit && <span className="font-bold"> ({ind.unit})</span>}
                                  {ind.referenceRange && <span className="block text-xs font-normal text-gray-400">{ind.referenceRange}</span>}
                                </th>
                              ))}
                            </tr>
                          </thead>

                          <tbody>
                            {table.dates.map((date, rowIdx) => (
                              <tr key={date}>
                                <td className="py-2 px-3 text-center whitespace-nowrap">{date}</td>
                                {table.rows[rowIdx].map((cell, colIdx) => (
                                  <td
                                    key={colIdx}
                                    className={cn(
                                      "py-2 px-3 text-center tabular-nums",
                                      cell?.abnormal ? "text-red-700 font-medium" : "text-gray-700",
                                    )}
                                  >
                                    {cell?.value ?? "-"}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  ))}

                  {/* Questions */}
                  <div className="mt-8 pt-4 border-t border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-900 mb-2">建议沟通重点</h3>
                    <ol className="list-decimal pl-5 text-sm text-gray-600 space-y-1.5">
                      {report.questions.map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
