import { useState, useMemo, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/app/components/ui/dialog";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { UploadCloud, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import * as XLSX from "xlsx";
import type { HealthRecord, IndicatorCategory, IndicatorItem } from "@/app/components/AddRecordDialog";

const normalizeHeaderKey = (value: string) =>
  value
    .replace(/[()\（\）]/g, " ")
    .replace(/\s+/g, "")
    .toLowerCase();

type ImportPhase = "idle" | "parsing" | "parsed" | "importing";

interface ParsedRow {
  date: string;
  indicatorId: string | null;
  indicatorLabelGuess: string;
  value: number | null;
  unit: string;
  sourceRowIndex: number;
  errors: string[];
}

interface ImportRecordsDialogProps {
  categories: IndicatorCategory[];
  onImportRecords: (records: HealthRecord[]) => void;
}

export function ImportRecordsDialog({ categories, onImportRecords }: ImportRecordsDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [activeMode, setActiveMode] = useState<"file" | "manual">("file");
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [manualError, setManualError] = useState<string | null>(null);

  const selectedCategory = useMemo(
    () => categories.find(c => c.id === selectedCategoryId) ?? categories[0],
    [categories, selectedCategoryId],
  );

  const isAllSelected = selectedCategoryId === "__all__";
  const manualCategory = !isAllSelected ? selectedCategory : null;

  const categoryListForMapping: IndicatorCategory[] = useMemo(() => {
    if (isAllSelected) {
      return categories;
    }
    return selectedCategory ? [selectedCategory] : [];
  }, [categories, selectedCategory, isAllSelected]);

  const indicatorMapByLabel = useMemo(() => {
    if (categoryListForMapping.length === 0) {
      return new Map<string, IndicatorItem>();
    }
    const map = new Map<string, IndicatorItem>();
    categoryListForMapping.forEach(category => {
      category.items.forEach((item: IndicatorItem) => {
        const baseKey = normalizeHeaderKey(item.label);
        if (!map.has(baseKey)) {
          map.set(baseKey, item);
        }
        const synonyms: string[] = [];
        if (baseKey.includes("总胆固醇")) {
          synonyms.push("tc", "总胆固醇tc", "总胆固醇tcmmol/l");
        } else if (baseKey.includes("甘油三酯")) {
          synonyms.push("tg", "甘油三酯tg", "甘油三酯tgmmol/l");
        } else if (baseKey.includes("低密度脂蛋白") || baseKey.includes("低密度胆固醇")) {
          synonyms.push("ldl", "ldl-c", "低密度胆固醇", "低密度脂蛋白胆固醇");
        } else if (baseKey.includes("高密度脂蛋白") || baseKey.includes("高密度胆固醇")) {
          synonyms.push("hdl", "hdl-c", "高密度胆固醇", "高密度脂蛋白胆固醇");
        }
        synonyms.forEach(key => {
          const normalized = normalizeHeaderKey(key);
          if (!map.has(normalized)) {
            map.set(normalized, item);
          }
        });
      });
    });
    return map;
  }, [categoryListForMapping]);

  const validRows = useMemo(
    () => parsedRows.filter(row => row.errors.length === 0 && row.indicatorId && row.value !== null),
    [parsedRows],
  );

  const invalidRows = useMemo(
    () => parsedRows.filter(row => row.errors.length > 0),
    [parsedRows],
  );

  const handleReset = () => {
    setFile(null);
    setPhase("idle");
    setParsedRows([]);
    setParseError(null);
    setFileName("");
    setActiveMode("file");
    setManualDate(new Date().toISOString().split("T")[0]);
    setManualValues({});
    setManualError(null);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const targetFile = e.target.files?.[0];
    if (targetFile) {
      processFile(targetFile);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const targetFile = e.dataTransfer.files?.[0];
    if (targetFile) {
      processFile(targetFile);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const processFile = (targetFile: File) => {
    const extension = targetFile.name.toLowerCase();
    if (!extension.endsWith(".xlsx") && !extension.endsWith(".xls") && !extension.endsWith(".csv")) {
      setParseError("仅支持上传 xlsx、xls 或 csv 格式的文件。");
      setFile(null);
      setParsedRows([]);
      setPhase("idle");
      return;
    }

    if (!selectedCategory && !isAllSelected) {
      setParseError("请先选择检验指标种类。");
      setFile(null);
      setParsedRows([]);
      setPhase("idle");
      return;
    }

    setFile(targetFile);
    setFileName(targetFile.name);
    setParseError(null);
    setPhase("parsing");

    const reader = new FileReader();
    reader.onload = (event: ProgressEvent<FileReader>) => {
      try {
        const data = event.target?.result;
        if (!data) {
          throw new Error("文件读取失败");
        }
        const workbook = XLSX.read(data, { type: "array" });
        if (isAllSelected) {
          const allRows: ParsedRow[] = [];
          workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) {
              return;
            }
            const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });
            const parsed = parseSheetRows(rows, indicatorMapByLabel);
            allRows.push(...parsed);
          });
          setParsedRows(allRows);
        } else {
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1 });
          const parsed = parseSheetRows(rows, indicatorMapByLabel);
          setParsedRows(parsed);
        }
        setPhase("parsed");
      } catch (error) {
        setParseError("文件解析失败，请确认文件格式是否为标准表格。");
        setParsedRows([]);
        setPhase("idle");
      }
    };
    reader.onerror = () => {
      setParseError("文件读取失败，请重试。");
      setParsedRows([]);
      setPhase("idle");
    };
    reader.readAsArrayBuffer(targetFile);
  };

  const parseSheetRows = (
    rows: (string | number | null)[][],
    mapByLabel: Map<string, IndicatorItem>,
  ): ParsedRow[] => {
    if (rows.length === 0) {
      return [];
    }
    const header = rows[0].map(cell => String(cell ?? "").trim());
    const lowerHeader = header.map(h => h.toLowerCase());

    const dateIdx = lowerHeader.findIndex(h => h === "数据日期" || h === "日期" || h === "date");
    const valueIdx = lowerHeader.findIndex(h => h === "数值" || h === "value");
    const nameIdx = lowerHeader.findIndex(h => h === "检验项目" || h === "指标" || h === "名称" || h === "name");

    const result: ParsedRow[] = [];

    if (dateIdx !== -1 && nameIdx !== -1 && valueIdx !== -1) {
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rawDate = String(row[dateIdx] ?? "").trim();
        const rawName = String(row[nameIdx] ?? "").trim();
        const rawValue = row[valueIdx];
        const errors: string[] = [];

        if (!rawDate) {
          errors.push("数据日期为空。");
        }
        if (!rawName) {
          errors.push("检验项目名称为空。");
        }

        const numericValue = typeof rawValue === "number" ? rawValue : parseFloat(String(rawValue ?? "").replace(",", "."));
        if (Number.isNaN(numericValue)) {
          errors.push("数值为空或格式错误。");
        }

        const normalizedName = normalizeHeaderKey(rawName);
        const directItem = mapByLabel.get(normalizedName);
        let item = directItem;
        if (!item) {
          for (const [key, mapped] of mapByLabel.entries()) {
            if (normalizedName.includes(key) || key.includes(normalizedName)) {
              item = mapped;
              break;
            }
          }
        }
        if (!item) {
          errors.push("未能匹配到已维护的检验项目。");
        }

        result.push({
          date: rawDate,
          indicatorId: item?.id ?? null,
          indicatorLabelGuess: rawName,
          value: Number.isNaN(numericValue) ? null : numericValue,
          unit: item?.unit ?? "",
          sourceRowIndex: i + 1,
          errors,
        });
      }
      return result;
    }

    const wideDateIdx = lowerHeader.findIndex(h => h === "数据日期" || h === "日期" || h === "date");
    if (wideDateIdx === -1) {
      return [];
    }
    const indicatorColumns = header
      .map((title, index) => ({ title, index }))
      .filter(col => col.index !== wideDateIdx && col.title.trim() !== "");

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rawDate = String(row[wideDateIdx] ?? "").trim();
      for (const col of indicatorColumns) {
        const rawValue = row[col.index];
        if (rawValue === null || rawValue === undefined || String(rawValue).trim() === "") {
          continue;
        }

        const errors: string[] = [];
        if (!rawDate) {
          errors.push("数据日期为空。");
        }

        const headerKey = normalizeHeaderKey(col.title);
        const directItem = mapByLabel.get(headerKey);
        let item = directItem;
        if (!item) {
          for (const [key, mapped] of mapByLabel.entries()) {
            if (headerKey.includes(key) || key.includes(headerKey)) {
              item = mapped;
              break;
            }
          }
        }
        if (!item) {
          errors.push("未能匹配到已维护的检验项目。");
        }

        const numericValue = typeof rawValue === "number"
          ? rawValue
          : parseFloat(String(rawValue ?? "").replace(",", "."));
        if (Number.isNaN(numericValue)) {
          errors.push("数值为空或格式错误。");
        }

        result.push({
          date: rawDate,
          indicatorId: item?.id ?? null,
          indicatorLabelGuess: col.title.trim(),
          value: Number.isNaN(numericValue) ? null : numericValue,
          unit: item?.unit ?? "",
          sourceRowIndex: i + 1,
          errors,
        });
      }
    }

    return result;
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (validRows.length === 0) {
      return;
    }
    setPhase("importing");

    const now = Date.now();
    const operationAt = new Date().toISOString();
    const records: HealthRecord[] = validRows.map((row, index: number) => {
      const indicatorId = row.indicatorId as string;
      const fallbackCategory = categories.find(category =>
        category.items.some((indicator: IndicatorItem) => indicator.id === indicatorId),
      );
      const sourceCategory = selectedCategory && !isAllSelected ? selectedCategory : fallbackCategory;
      const item = sourceCategory?.items.find((indicator: IndicatorItem) => indicator.id === indicatorId);
      const unit = item?.unit ?? row.unit;
      return {
        id: `${now}_${index}_${indicatorId}`,
        date: row.date,
        indicatorType: indicatorId,
        value: row.value as number,
        unit,
        operationAt,
      };
    });

    onImportRecords(records);
    setPhase("parsed");
    setOpen(false);
    handleReset();
  };

  const manualActiveItems = useMemo(() => {
    if (!manualCategory) {
      return [];
    }
    return manualCategory.items.filter(item => {
      const value = manualValues[item.id];
      return value !== undefined && value !== "";
    });
  }, [manualCategory, manualValues]);

  const manualRecordCount = useMemo(() => {
    return manualActiveItems.reduce((count, item) => {
      const raw = manualValues[item.id];
      const parsed = parseFloat(String(raw));
      return Number.isNaN(parsed) ? count : count + 1;
    }, 0);
  }, [manualActiveItems, manualValues]);

  const manualHasInvalid = useMemo(() => {
    return manualActiveItems.some(item => {
      const raw = manualValues[item.id];
      const parsed = parseFloat(String(raw));
      return Number.isNaN(parsed);
    });
  }, [manualActiveItems, manualValues]);

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    setManualError(null);

    if (!manualCategory) {
      setManualError("手动录入需要选择具体的检验指标分类。");
      return;
    }

    if (!manualDate) {
      setManualError("请选择数据日期。");
      return;
    }

    if (manualRecordCount === 0) {
      setManualError("请至少输入一个有效数值。");
      return;
    }

    if (manualHasInvalid) {
      setManualError("存在无法识别的数值，请检查后再提交。");
      return;
    }

    const now = Date.now();
    const operationAt = new Date().toISOString();
    const records: HealthRecord[] = manualActiveItems
      .map((item, index) => {
        const raw = manualValues[item.id];
        const parsed = parseFloat(String(raw));
        if (Number.isNaN(parsed)) {
          return null;
        }
        return {
          id: `${now}_${index}_${item.id}`,
          date: manualDate,
          indicatorType: item.id,
          value: parsed,
          unit: item.unit,
          operationAt,
        } as HealthRecord;
      })
      .filter((record): record is HealthRecord => record !== null);

    if (records.length === 0) {
      setManualError("请至少输入一个有效数值。");
      return;
    }

    onImportRecords(records);
    setOpen(false);
    handleReset();
  };

  const handleDownloadErrorReport = () => {
    if (invalidRows.length === 0) {
      return;
    }
    const header = ["原始行号", "数据日期", "检验项目", "数值", "错误信息"];
    const lines = invalidRows.map(row => {
      const message = row.errors.join("；");
      const value = row.value === null ? "" : String(row.value);
      return [
        String(row.sourceRowIndex),
        row.date,
        row.indicatorLabelGuess,
        value,
        message,
      ].map(field => `"${field.replace(/"/g, '""')}"`).join(",");
    });
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "导入错误报告.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const canImport = validRows.length > 0 && phase === "parsed";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen: boolean) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          handleReset();
        } else if (!selectedCategoryId && categories[0]) {
          setSelectedCategoryId(categories[0].id);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 bg-white/80 backdrop-blur-sm border-violet-200 hover:bg-violet-50 hover:border-violet-300"
        >
          <UploadCloud className="w-4 h-4" />
          Excel 导入
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[760px] bg-white/95 backdrop-blur-xl border-0 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">
            Excel 导入
          </DialogTitle>
        </DialogHeader>
        <Tabs
          value={activeMode}
          onValueChange={(value: string) => {
            const nextMode = value === "manual" ? "manual" : "file";
            setActiveMode(nextMode);
            if (nextMode === "manual" && selectedCategoryId === "__all__") {
              setSelectedCategoryId(categories[0]?.id ?? "");
            }
            if (nextMode === "manual") {
              setParseError(null);
              setParsedRows([]);
            } else {
              setManualError(null);
              setManualValues({});
            }
          }}
          className="mt-4"
        >
          <TabsList className="grid w-full grid-cols-2 bg-violet-50/60 border border-violet-100 rounded-xl">
            <TabsTrigger value="file" className="text-xs sm:text-sm">
              文件导入
            </TabsTrigger>
            <TabsTrigger value="manual" className="text-xs sm:text-sm">
              手动录入
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="mt-4">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-1 space-y-2">
                  <Label className="text-gray-700">检验指标种类</Label>
                  <Select
                    value={selectedCategoryId}
                    onValueChange={(value: string) => {
                      setSelectedCategoryId(value);
                      setParsedRows([]);
                      setParseError(null);
                      setManualValues({});
                      setManualError(null);
                    }}
                  >
                    <SelectTrigger className="border-violet-200 focus:border-violet-400 focus:ring-violet-400 bg-white/80">
                      <SelectValue placeholder="请选择检验指标种类" />
                    </SelectTrigger>
                    <SelectContent className="bg-white/95 backdrop-blur-xl border-violet-200 max-h-64">
                      <SelectItem key="__all__" value="__all__">
                        全部（所有分类）
                      </SelectItem>
                      {categories.map(category => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-400">
                    将根据所选种类下已维护的具体检验项目，对表格中的列或项目名称进行匹配。
                  </p>
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-gray-700">上传文件</Label>
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    className="flex flex-col items-center justify-center gap-2 px-4 py-6 border-2 border-dashed rounded-xl border-violet-200 bg-violet-50/40 hover:bg-violet-50 transition"
                  >
                    <UploadCloud className="w-8 h-8 text-violet-400" />
                    <p className="text-sm text-gray-700">
                      将文件拖拽到此处，或
                      <span className="text-violet-600 mx-1">点击选择文件</span>
                    </p>
                    <p className="text-xs text-gray-400">支持 xlsx / xls / csv，建议使用包含表头的标准表格。</p>
                    <Input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileChange}
                      className="mt-2 cursor-pointer"
                    />
                    {fileName && (
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                        <FileSpreadsheet className="w-3 h-3 text-emerald-500" />
                        <span>{fileName}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <span>数据预览</span>
                    {phase === "parsing" && (
                      <span className="text-xs text-violet-500">正在解析文件，请稍候...</span>
                    )}
                    {phase === "parsed" && parsedRows.length > 0 && (
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 className="w-3 h-3" />
                        解析完成：共 {parsedRows.length} 行，其中有效 {validRows.length} 行，存在问题 {invalidRows.length} 行。
                      </span>
                    )}
                  </div>
                  {invalidRows.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadErrorReport}
                      className="h-7 px-2 text-xs border-rose-200 text-rose-500 hover:bg-rose-50"
                    >
                      导出错误报告
                    </Button>
                  )}
                </div>
                {parseError && (
                  <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                    <AlertTriangle className="w-4 h-4 mt-0.5" />
                    <div>
                      <div>{parseError}</div>
                      <div className="mt-1 text-[11px] text-rose-500">
                        请确认文件为包含「数据日期」与「检验项目/指标/名称」及「数值」列的长表，或「数据日期」加多列指标名称的宽表。
                      </div>
                    </div>
                  </div>
                )}
                {parsedRows.length > 0 ? (
                  <div className="border border-violet-100 rounded-xl overflow-hidden bg-white/40 max-h-64">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-violet-100 bg-violet-50/60">
                          <TableHead className="text-gray-700 text-xs w-20">原始行号</TableHead>
                          <TableHead className="text-gray-700 text-xs w-28">数据日期</TableHead>
                          <TableHead className="text-gray-700 text-xs w-40">检验项目</TableHead>
                          <TableHead className="text-gray-700 text-xs w-24">数值</TableHead>
                          <TableHead className="text-gray-700 text-xs w-20">单位</TableHead>
                          <TableHead className="text-gray-700 text-xs">状态</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedRows.slice(0, 50).map(row => {
                          const hasError = row.errors.length > 0;
                          return (
                            <TableRow
                              key={`${row.sourceRowIndex}-${row.indicatorLabelGuess}`}
                              className={hasError ? "bg-rose-50/40" : ""}
                            >
                              <TableCell className="text-xs text-gray-500">{row.sourceRowIndex}</TableCell>
                              <TableCell className="text-xs text-gray-700">{row.date}</TableCell>
                              <TableCell className="text-xs text-gray-700">
                                {row.indicatorLabelGuess}
                              </TableCell>
                              <TableCell className="text-xs text-gray-700">
                                {row.value === null ? "-" : row.value}
                              </TableCell>
                              <TableCell className="text-xs text-gray-500">
                                {row.unit || "-"}
                              </TableCell>
                              <TableCell className="text-xs">
                                {hasError ? (
                                  <span className="text-rose-500">
                                    {row.errors.join("；")}
                                  </span>
                                ) : (
                                  <span className="text-emerald-600">可导入</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="h-32 flex flex-col items-center justify-center text-gray-400 text-sm border border-dashed border-violet-100 rounded-xl bg-white/30">
                    <UploadCloud className="w-6 h-6 mb-2 text-violet-300" />
                    <p>上传文件后将在此显示解析结果摘要。</p>
                  </div>
                )}
                {parsedRows.length > 50 && (
                  <p className="text-[11px] text-gray-400">
                    仅展示前 50 行预览，完整数据将按校验结果导入。
                  </p>
                )}
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
                <div className="text-[11px] text-gray-400">
                  建议表格模板：
                  <span className="ml-1">
                    A 类：数据日期 / 检验项目 / 数值；
                    B 类：数据日期 + 多列指标名称（如总胆固醇、甘油三酯等）。
                  </span>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      handleReset();
                    }}
                    className="border-violet-200 hover:bg-violet-50"
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    disabled={!canImport}
                    className="bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    确认导入有效数据
                    {validRows.length > 0 && (
                      <span className="ml-1">({validRows.length} 条)</span>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="manual" className="mt-4">
            <form onSubmit={handleManualSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-700">数据日期</Label>
                  <Input
                    type="date"
                    value={manualDate}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setManualDate(e.target.value)}
                    className="border-violet-200 focus:border-violet-400 focus:ring-violet-400 bg-white/80"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label className="text-gray-700">检验指标种类</Label>
                  <Select
                    value={selectedCategoryId}
                    onValueChange={(value: string) => {
                      setSelectedCategoryId(value);
                      setManualValues({});
                      setManualError(null);
                    }}
                  >
                    <SelectTrigger className="border-violet-200 focus:border-violet-400 focus:ring-violet-400 bg-white/80">
                      <SelectValue placeholder="请选择检验指标种类" />
                    </SelectTrigger>
                    <SelectContent className="bg-white/95 backdrop-blur-xl border-violet-200 max-h-64">
                      {categories.map(category => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-400">手动录入仅支持单一分类。</p>
                </div>
              </div>

              {manualCategory ? (
                <div className="rounded-xl border border-violet-100 bg-white/80">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-violet-50 text-[11px] text-gray-500">
                    <div className="col-span-5">检验项目</div>
                    <div className="col-span-3">参考范围</div>
                    <div className="col-span-2">单位</div>
                    <div className="col-span-2 text-right">录入数值</div>
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1 pr-1 space-y-1">
                    {manualCategory.items.length === 0 ? (
                      <div className="px-3 py-6 text-center text-sm text-gray-400">
                        当前分类暂无项目，请先维护检验项目。
                      </div>
                    ) : (
                      manualCategory.items.map(item => (
                        <div key={item.id} className="grid grid-cols-12 gap-2 items-center px-3 py-1.5">
                          <div className="col-span-5 text-sm text-gray-700">{item.label}</div>
                          <div className="col-span-3 text-xs text-gray-500">
                            {item.referenceRange || "-"}
                          </div>
                          <div className="col-span-2 text-xs text-gray-500">
                            {item.unit || "-"}
                          </div>
                          <div className="col-span-2 flex justify-end">
                            <Input
                              type="number"
                              step="0.1"
                              value={manualValues[item.id] ?? ""}
                              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                setManualValues(prev => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              placeholder="数值"
                              className="h-8 w-24 text-sm border-violet-200 focus:border-violet-400 focus:ring-violet-400"
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-32 flex flex-col items-center justify-center text-gray-400 text-sm border border-dashed border-violet-100 rounded-xl bg-white/30">
                  <UploadCloud className="w-6 h-6 mb-2 text-violet-300" />
                  <p>请选择具体的检验指标分类后开始录入。</p>
                </div>
              )}

              {manualError && (
                <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <div>{manualError}</div>
                </div>
              )}

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
                <div className="text-[11px] text-gray-400">
                  仅会保存已填写的项目，空白行将自动忽略。
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setOpen(false);
                      handleReset();
                    }}
                    className="border-violet-200 hover:bg-violet-50"
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    disabled={!manualCategory || manualRecordCount === 0 || manualHasInvalid}
                    className="bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    确认录入
                    {manualRecordCount > 0 && (
                      <span className="ml-1">({manualRecordCount} 条)</span>
                    )}
                  </Button>
                </div>
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
