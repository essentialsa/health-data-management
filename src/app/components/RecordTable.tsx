import { useState, type ChangeEvent } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Trash2, Database, Pencil, PlusCircle } from "lucide-react";
import { HealthRecord, IndicatorItem } from "./AddRecordDialog";

interface RecordTableProps {
  records: HealthRecord[];
  indicators: IndicatorItem[];
  onDeleteRecord: (id: string) => void;
  onUpdateRecord: (record: HealthRecord) => void;
  onAddFollowupRecord: (base: HealthRecord, payload: { date: string; value: number }) => void;
}

export function RecordTable({
  records,
  indicators,
  onDeleteRecord,
  onUpdateRecord,
  onAddFollowupRecord,
}: RecordTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editValue, setEditValue] = useState("");

  const getIndicatorLabel = (type: string) => {
    const indicator = indicators.find(t => t.id === type);
    return indicator ? indicator.label : type;
  };

  const formatOperationAt = (value?: string) => {
    if (!value) {
      return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString("zh-CN");
  };

  const sortedRecords = [...records].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  const handleStartEdit = (record: HealthRecord) => {
    setEditingId(record.id);
    setEditDate(record.date);
    setEditValue(String(record.value));
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditDate("");
    setEditValue("");
  };

  const handleSaveEdit = (record: HealthRecord) => {
    if (!editDate) {
      return;
    }
    const parsed = parseFloat(editValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      alert("请输入有效的非负数值。");
      return;
    }
    onUpdateRecord({
      ...record,
      date: editDate,
      value: parsed,
    });
    handleCancelEdit();
  };

  const handleSaveAsNew = (record: HealthRecord) => {
    if (!editDate) {
      return;
    }
    const parsed = parseFloat(editValue.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      alert("请输入有效的非负数值。");
      return;
    }
    onAddFollowupRecord(record, {
      date: editDate,
      value: parsed,
    });
    handleCancelEdit();
  };

  return (
    <div className="border border-violet-100 rounded-xl overflow-hidden bg-white/40">
      <Table>
        <TableHeader>
          <TableRow className="border-violet-100 hover:bg-violet-50/50">
            <TableHead className="text-gray-700 w-32">数据日期</TableHead>
            <TableHead className="text-gray-700 w-40">操作日期</TableHead>
            <TableHead className="text-gray-700">检验指标</TableHead>
            <TableHead className="text-gray-700 w-32">数值</TableHead>
            <TableHead className="w-[220px] text-right text-gray-700">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRecords.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-gray-500 py-12">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-100 to-blue-100 flex items-center justify-center mb-2">
                    <Database className="w-8 h-8 text-violet-400" />
                  </div>
                  <p className="text-gray-600">暂无数据</p>
                  <p className="text-sm text-gray-400">点击上方按钮添加记录</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            sortedRecords.map(record => {
              const isEditing = editingId === record.id;
              return (
                <TableRow
                  key={record.id}
                  className="border-violet-100 hover:bg-violet-50/30 transition-colors"
                >
                  <TableCell className="text-gray-700 py-3 align-middle whitespace-nowrap">
                    {isEditing ? (
                      <Input
                        type="date"
                        value={editDate}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setEditDate(e.target.value)}
                        className="h-8 border-violet-200 focus:border-violet-400 focus:ring-violet-400"
                      />
                    ) : (
                      record.date
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-gray-500 py-3 align-middle whitespace-nowrap">
                    {formatOperationAt(record.operationAt)}
                  </TableCell>
                  <TableCell className="text-gray-700 py-3 align-middle">
                    {getIndicatorLabel(record.indicatorType)}
                  </TableCell>
                  <TableCell className="text-gray-700 py-3 align-middle">
                    {isEditing ? (
                      <Input
                        type="number"
                        step="0.1"
                        value={editValue}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setEditValue(e.target.value)}
                        placeholder="输入数值"
                        className="h-8 border-violet-200 focus:border-violet-400 focus:ring-violet-400"
                      />
                    ) : (
                      <span className="px-3 py-1 bg-gradient-to-r from-violet-100 to-blue-100 rounded-full text-violet-700">
                        {record.value} {record.unit}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="py-3 align-middle">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSaveEdit(record)}
                          className="h-8 border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                        >
                          保存
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCancelEdit}
                          className="h-8 border-gray-200 text-gray-600 hover:bg-gray-50"
                        >
                          取消
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSaveAsNew(record)}
                          className="h-8 border-violet-200 text-violet-600 hover:bg-violet-50"
                        >
                          <PlusCircle className="w-4 h-4 mr-1" />
                          新增后续
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(record)}
                          className="h-8 w-8 p-0 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const ok = window.confirm("确定要删除这条记录吗？");
                            if (!ok) {
                              return;
                            }
                            onDeleteRecord(record.id);
                          }}
                          className="h-8 w-8 p-0 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
