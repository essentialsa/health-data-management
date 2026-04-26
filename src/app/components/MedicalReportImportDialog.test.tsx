import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MedicalReportImportDialog } from "@/app/components/MedicalReportImportDialog";
import * as medicalReport from "@/app/services/medicalReport";

vi.mock("@/app/services/medicalReport", () => ({
  parseMedicalReport: vi.fn(),
  checkParserService: vi.fn(),
  extractIndicatorsFromTables: vi.fn(),
  matchAllIndicators: vi.fn(),
  extractDate: vi.fn(),
  resolveIndicators: vi.fn(),
  groupByAction: vi.fn(),
  getCategoriesToCreate: vi.fn(),
}));

const mockParseResult = {
  success: true,
  pageCount: 1,
  reportDate: "2024-01-15",
  tables: [{ pageIndex: 0, cells: [] }],
  indicators: [
    { rawLabel: "收缩压", value: 120, unit: "mmHg", referenceRange: "90-140", pageIndex: 0 },
    { rawLabel: "血糖", value: 5.2, unit: "mmol/L", referenceRange: "3.9-6.1", pageIndex: 0 },
  ],
  markdown: "",
};

const mockMatched = [
  { rawLabel: "收缩压", value: 120, unit: "mmHg", referenceRange: "90-140", pageIndex: 0, systemId: "blood_pressure_systolic", matchType: "exact" as const, confidence: { level: "high" as const, score: 1.0, reasons: [] }, action: "create_category" as const, userItemFound: false },
  { rawLabel: "血糖", value: 5.2, unit: "mmol/L", referenceRange: "3.9-6.1", pageIndex: 0, systemId: "blood_glucose", matchType: "exact" as const, confidence: { level: "high" as const, score: 1.0, reasons: [] }, action: "create_category" as const, userItemFound: false },
];

const mockGrouped = {
  import: [],
  createCategory: mockMatched,
  createItem: [],
  unnamed: [],
};

const mockImportRecords = vi.fn();

describe("MedicalReportImportDialog E2E", () => {
  beforeEach(() => {
    vi.mocked(medicalReport.checkParserService).mockResolvedValue({
      online: true,
      endpoint: "http://127.0.0.1:8000",
      tried: ["http://127.0.0.1:8000"],
    });
    vi.mocked(medicalReport.parseMedicalReport).mockResolvedValue(mockParseResult);
    vi.mocked(medicalReport.extractIndicatorsFromTables).mockReturnValue(mockParseResult.indicators);
    vi.mocked(medicalReport.resolveIndicators).mockReturnValue(mockMatched);
    vi.mocked(medicalReport.groupByAction).mockReturnValue(mockGrouped);
    vi.mocked(medicalReport.getCategoriesToCreate).mockReturnValue([]);
    mockImportRecords.mockClear();
  });

  afterEach(() => { vi.clearAllMocks(); });

  it("渲染导入按钮", () => {
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    expect(screen.getByText("报告导入")).toBeInTheDocument();
  });

  it("点击按钮打开对话框", () => {
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));
    expect(screen.getByText("上传文件")).toBeInTheDocument();
    expect(screen.getByText("预览确认")).toBeInTheDocument();
  });

  it("选择有效文件后不显示错误", () => {
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));
    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.queryByText("仅支持")).not.toBeInTheDocument();
  });

  it("拒绝不支持的文件类型", () => {
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));
    const file = new File(["dummy"], "report.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);
    expect(screen.getByText("仅支持 PDF、JPG、PNG 格式")).toBeInTheDocument();
  });

  it("拒绝超大文件", () => {
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));
    const file = new File(["x".repeat(51 * 1024 * 1024)], "large.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);
    expect(screen.getByText("文件不能超过 50MB")).toBeInTheDocument();
  });

  it("解析完成后显示指标数据", async () => {
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));

    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);

    // 等待解析按钮出现并点击
    await waitFor(() => expect(screen.getByText("开始解析")).toBeInTheDocument());
    fireEvent.click(screen.getByText("开始解析"));

    // 等待解析完成显示数据
    await waitFor(() => expect(screen.getByText("收缩压")).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText("血糖")).toBeInTheDocument();
  });

  it("确认导入后调用 onImportRecords", async () => {
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));

    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByText("开始解析")).toBeInTheDocument());
    fireEvent.click(screen.getByText("开始解析"));

    await waitFor(() => expect(screen.getByText(/确认导入/)).toBeInTheDocument(), { timeout: 5000 });
    fireEvent.click(screen.getByText(/确认导入/));

    expect(mockImportRecords).toHaveBeenCalledTimes(1);
    const records = mockImportRecords.mock.calls[0][0];
    expect(records).toHaveLength(2);
    expect(records[0].indicatorType).toBe("blood_pressure_systolic");
    expect(records[0].value).toBe(120);
  });

  it("解析失败时显示错误", async () => {
    vi.mocked(medicalReport.parseMedicalReport).mockRejectedValue(new Error("网络错误"));
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));

    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);

    await waitFor(() => expect(screen.getByText("开始解析")).toBeInTheDocument());
    fireEvent.click(screen.getByText("开始解析"));

    await waitFor(() => expect(screen.getByText("网络错误")).toBeInTheDocument(), { timeout: 5000 });
  });

  it("关闭对话框后重新打开回到初始状态", async () => {
    render(<MedicalReportImportDialog onImportRecords={mockImportRecords} />);
    fireEvent.click(screen.getByText("报告导入"));

    const file = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file], writable: false });
    fireEvent.change(input);

    fireEvent.click(screen.getByText("取消"));
    fireEvent.click(screen.getByText("报告导入"));
    expect(screen.getByText("上传文件")).toBeInTheDocument();
    expect(screen.queryByText("report.pdf")).not.toBeInTheDocument();
  });
});
