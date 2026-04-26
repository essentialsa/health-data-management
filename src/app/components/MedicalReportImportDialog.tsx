import { useState, useCallback, useEffect } from "react";
import { Button } from "@/app/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/app/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Badge } from "@/app/components/ui/badge";
import { Progress } from "@/app/components/ui/progress";
import { Input } from "@/app/components/ui/input";
import { cn } from "@/app/components/ui/utils";
import { UploadCloud, FileText, AlertCircle, CheckCircle, Loader2, X, RefreshCw } from "lucide-react";
import type { HealthRecord } from "@/app/components/AddRecordDialog";
import {
  parseMedicalReport,
  checkParserService,
  extractIndicatorsFromTables,
  resolveIndicators,
  groupByAction,
  getCategoriesToCreate,
  type ParseResult,
  type ParserServiceStatus,
  type ResolvedIndicator,
} from "@/app/services/medicalReport";
import { CategorySelectDialog } from "./CategorySelectDialog";

const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];
const MAX_SIZE = 50 * 1024 * 1024;

interface Props {
  onImportRecords: (records: HealthRecord[]) => void;
  existingCategories?: { id: string; name: string; items: { id: string; label: string }[] }[];
  triggerClassName?: string;
}

export function MedicalReportImportDialog({ onImportRecords, existingCategories = [], triggerClassName }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"upload" | "preview">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [matched, setMatched] = useState<ResolvedIndicator[]>([]);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [pendingCategories, setPendingCategories] = useState<{ categoryId: string; categoryName: string; indicators: ResolvedIndicator[] }[]>([]);
  const [serviceStatus, setServiceStatus] = useState<ParserServiceStatus | null>(null);
  const [serviceChecking, setServiceChecking] = useState(false);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const serviceOnline = serviceStatus?.online ?? null;

  const checkService = useCallback(async () => {
    setServiceChecking(true);
    try {
      const status = await checkParserService();
      setServiceStatus(status);
      return status;
    } finally {
      setServiceChecking(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    void checkService();
  }, [open, checkService]);

  const handleFile = async (f: File) => {
    if (!ALLOWED.includes(f.type)) { setError("仅支持 PDF、JPG、PNG 格式"); return; }
    if (f.size > MAX_SIZE) { setError("文件不能超过 50MB"); return; }
    setFile(f);
    setError(null);
  };

  const handleParse = async () => {
    if (!file) return;
    const latestStatus = await checkService();
    if (!latestStatus.online) {
      setError(latestStatus.message || "解析服务未就绪，请先启动 OCR 服务");
      return;
    }
    setParsing(true);
    setProgress(0);
    setTab("preview");

    // 模拟进度
    const timer = setInterval(() => setProgress(p => Math.min(p + Math.random() * 15, 90)), 500);

    try {
      const r = await parseMedicalReport(file);
      const extracted =
        Array.isArray(r.indicators) && r.indicators.length > 0
          ? r.indicators
          : extractIndicatorsFromTables(r.tables);
      const resolved = resolveIndicators(extracted, existingCategories);
      const grouped = groupByAction(resolved);
      setMatched(resolved);

      if (grouped.createCategory.length > 0 || grouped.createItem.length > 0) {
        // 有分类需要处理
        const catsToCreate = getCategoriesToCreate(resolved);
        if (catsToCreate.length > 0) {
          setPendingCategories(catsToCreate);
          setCategoryDialogOpen(true);
          // 解析完成但不自动跳转，等用户处理完分类
          clearInterval(timer);
          setResult(r);
          setProgress(100);
          return;
        }
      }

      clearInterval(timer);
      setProgress(100);
      setResult(r);
    } catch (e) {
      clearInterval(timer);
      setError(e instanceof Error ? e.message : "解析失败");
      setTab("upload");
    } finally {
      setParsing(false);
    }
  };

  const handleImport = () => {
    if (!result) return;
    const date = result.reportDate || new Date().toISOString().split("T")[0];
    const records: HealthRecord[] = matched
      .filter(m => m.matchType !== "none" && m.systemId)
      .map(m => ({
        id: `${Date.now()}_${m.systemId}_${Math.random().toString(36).slice(2, 8)}`,
        date,
        indicatorType: m.systemId!,
        value: m.value,
        unit: m.unit,
        operationAt: new Date().toISOString(),
      }));
    onImportRecords(records);
    handleClose();
  };

  const handleClose = () => {
    setOpen(false);
    setTab("upload");
    setFile(null);
    setError(null);
    setResult(null);
    setMatched([]);
    setProgress(0);
    setPendingCategories([]);
    setCategoryDialogOpen(false);
    setServiceStatus(null);
    setServiceChecking(false);
  };

  const handleCategoryConfirm = (actions: { groupId: string; action: "create" | "assign" | "skip"; categoryId?: string; customName?: string }[]) => {
    // TODO: Process category actions - create new categories or assign to existing ones
    console.log("Category actions:", actions);
    setCategoryDialogOpen(false);
    setPendingCategories([]);
  };

  const filtered = matched.filter(m => filter === "all" || m.confidence.level === filter);
  const counts = { all: matched.length, high: matched.filter(m => m.confidence.level === "high").length, medium: matched.filter(m => m.confidence.level === "medium").length, low: matched.filter(m => m.confidence.level === "low").length };

  const confColor: Record<string, "default" | "secondary" | "destructive"> = { high: "default", medium: "secondary", low: "destructive" };
  const confLabel: Record<string, string> = { high: "高", medium: "中", low: "低" };

  return (
    <>
      <CategorySelectDialog
        open={categoryDialogOpen}
        groups={pendingCategories.map(c => ({
          categoryId: c.categoryId,
          categoryName: c.categoryName,
          indicators: c.indicators.map(i => ({ rawLabel: i.rawLabel, value: i.value, unit: i.unit, systemLabel: i.systemLabel })),
        }))}
        existingCategories={existingCategories.map(c => ({ id: c.id, name: c.name }))}
        onClose={() => setCategoryDialogOpen(false)}
        onConfirm={handleCategoryConfirm}
      />
      <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button
          className={cn(
            "gap-2 bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600 shadow-lg shadow-violet-200 hover:shadow-xl hover:shadow-violet-300 transition-all duration-300",
            triggerClassName,
          )}
        >
          <FileText className="w-4 h-4" />
          报告导入
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
            报告导入
          </DialogTitle>
        </DialogHeader>

        {/* 服务状态 */}
        <div className="flex items-center gap-2 text-sm">
          {serviceChecking && (
            <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> 检测中...</span>
          )}
          {!serviceChecking && serviceOnline === true && (
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle className="w-3.5 h-3.5" />
              解析服务就绪（{serviceStatus?.endpoint || "已连接"}）
            </span>
          )}
          {!serviceChecking && serviceOnline === false && (
            <span className="flex items-center gap-1 text-red-600">
              <AlertCircle className="w-3.5 h-3.5" />
              解析服务未启动
              <button className="underline ml-1" onClick={() => void checkService()}>
                刷新
              </button>
              {serviceStatus?.message ? (
                <span className="text-xs text-muted-foreground ml-1 max-w-[560px] truncate">{serviceStatus.message}</span>
              ) : null}
            </span>
          )}
        </div>

        <Tabs value={tab} onValueChange={v => setTab(v as "upload" | "preview")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload">上传文件</TabsTrigger>
            <TabsTrigger value="preview" disabled={!result && !parsing}>预览确认</TabsTrigger>
          </TabsList>

          {/* 上传 */}
          <TabsContent value="upload" className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-purple-300 transition-colors"
              onClick={() => document.getElementById("mr-file")?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <input id="mr-file" type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              <UploadCloud className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">拖拽文件到此处，或点击选择</p>
              <p className="text-xs text-muted-foreground mt-1">支持 PDF / JPG / PNG，最大 50MB</p>
            </div>

            {file && (
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-3">
                <FileText className="w-4 h-4 text-purple-600" />
                <span className="text-sm flex-1 truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
                <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => { setFile(null); setError(null); }}><X className="w-3 h-3" /></Button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>取消</Button>
              <Button disabled={!file || serviceChecking || serviceOnline === false} onClick={handleParse}>
                {parsing ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> 解析中...</> : "开始解析"}
              </Button>
            </div>
          </TabsContent>

          {/* 预览 */}
          <TabsContent value="preview" className="space-y-4">
            {parsing && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> 正在解析体检报告...
                </div>
                <Progress value={progress} />
              </div>
            )}

            {result && !parsing && (
              <>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>📄 {result.pageCount} 页</span>
                  <span>📅 {result.reportDate || "未识别日期"}</span>
                  <span>📊 {matched.length} 项指标</span>
                </div>

                {/* 筛选 */}
                <div className="flex gap-2">
                  {(["all", "high", "medium", "low"] as const).map(f => (
                    <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
                      {f === "all" ? `全部 (${counts.all})` : `${confLabel[f]} (${counts[f]})`}
                    </Button>
                  ))}
                </div>

                {/* 表格 */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>指标名称</TableHead>
                      <TableHead className="text-right">数值</TableHead>
                      <TableHead>单位</TableHead>
                      <TableHead>参考范围</TableHead>
                      <TableHead className="text-center">置信度</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">无数据</TableCell></TableRow>
                    )}
                    {filtered.map((m, i) => (
                      <TableRow key={i} className={m.matchType === "none" ? "bg-orange-50" : m.confidence.level === "low" ? "bg-red-50/50" : undefined}>
                        <TableCell className="font-medium">{m.rawLabel}</TableCell>
                        <TableCell className="text-right">{m.value}</TableCell>
                        <TableCell>{m.unit}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{m.referenceRange || "-"}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={confColor[m.confidence.level]} className="text-xs">{confLabel[m.confidence.level]}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* 未匹配指标区域 */}
                {matched.filter(m => m.matchType === "none").length > 0 && (
                  <div className="mt-4 border rounded-lg p-4 bg-amber-50/50">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <h4 className="font-medium text-amber-800">未命名指标（{matched.filter(m => m.matchType === "none").length} 项）</h4>
                    </div>
                    <div className="space-y-2">
                      {matched.filter(m => m.matchType === "none").map((m, i) => (
                        <div key={`unnamed-${i}`} className="flex items-center gap-2 bg-white rounded-md p-2">
                          <Input
                            defaultValue={m.rawLabel}
                            className="h-8 text-sm flex-1"
                            onChange={e => {
                              const updated = [...matched];
                              updated[matched.indexOf(m)] = { ...updated[matched.indexOf(m)], rawLabel: e.target.value };
                              setMatched(updated);
                            }}
                          />
                          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => {
                            setMatched(matched.filter((_, idx) => idx !== matched.indexOf(m)));
                          }}>跳过</Button>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">💡 可直接修改指标名称，或点击"跳过"忽略</p>
                  </div>
                )}

                {/* 统计信息 */}
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2 pt-2">
                  <span>✅ 可导入: {matched.filter(m => m.matchType !== "none").length}</span>
                  <span>📝 未命名: {matched.filter(m => m.matchType === "none").length}</span>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => { setTab("upload"); setResult(null); setMatched([]); }}>
                    <RefreshCw className="w-4 h-4 mr-1" /> 重新上传
                  </Button>
                  <Button onClick={handleImport} disabled={matched.filter(m => m.matchType !== "none").length === 0}>
                    <CheckCircle className="w-4 h-4 mr-1" />
                    确认导入 ({matched.filter(m => m.matchType !== "none").length} 条)
                  </Button>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
      </Dialog>
    </>
  );
}
