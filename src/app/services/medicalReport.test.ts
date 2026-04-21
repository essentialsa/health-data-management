import { describe, it, expect } from "vitest";
import {
  matchIndicator,
  calcConfidence,
  matchAllIndicators,
  extractIndicatorsFromTables,
  extractDate,
  resolveIndicators,
  groupByAction,
  type ParsedTable,
  type ExtractedIndicator,
} from "@/app/services/medicalReport";

describe("matchIndicator", () => {
  it("精确匹配标准中文名", () => {
    const r = matchIndicator("收缩压");
    expect(r.matchType).toBe("exact");
    expect(r.systemId).toBe("blood_pressure_systolic");
  });

  it("精确匹配英文缩写", () => {
    const r = matchIndicator("ALT");
    expect(r.matchType).toBe("exact");
    expect(r.systemId).toBe("alt");
  });

  it("模糊匹配别名", () => {
    const r = matchIndicator("低密度脂蛋白");
    expect(r.matchType).toBe("exact");
    expect(r.systemId).toBe("ldl_cholesterol");
  });

  it("未匹配返回 none", () => {
    const r = matchIndicator("完全不存在的指标名XYZ");
    expect(r.matchType).toBe("none");
    expect(r.systemId).toBeUndefined();
  });

  it("忽略前后空格", () => {
    const r = matchIndicator("  血糖  ");
    expect(r.matchType).toBe("exact");
  });
});

describe("calcConfidence", () => {
  it("精确匹配返回 high", () => {
    const c = calcConfidence({ matchType: "exact" }, 120);
    expect(c.level).toBe("high");
    expect(c.score).toBe(1.0);
  });

  it("模糊匹配根据相似度评分", () => {
    const c = calcConfidence({ matchType: "fuzzy", similarity: 0.9 }, 5.2);
    expect(c.level).toBe("high");
    expect(c.score).toBe(0.9);
  });

  it("未匹配返回 low", () => {
    const c = calcConfidence({ matchType: "none" }, 0);
    expect(c.level).toBe("low");
    expect(c.score).toBe(0);
  });

  it("负数值降级", () => {
    const c = calcConfidence({ matchType: "exact" }, -1);
    expect(c.score).toBeLessThan(1.0);
  });
});

describe("matchAllIndicators", () => {
  const indicators: ExtractedIndicator[] = [
    { rawLabel: "收缩压", value: 120, unit: "mmHg", pageIndex: 0 },
    { rawLabel: "血糖", value: 5.2, unit: "mmol/L", pageIndex: 0 },
    { rawLabel: "未知指标", value: 10, unit: "U/L", pageIndex: 0 },
  ];

  it("批量匹配返回正确数量", () => {
    const result = matchAllIndicators(indicators);
    expect(result).toHaveLength(3);
  });

  it("已匹配的有 systemId", () => {
    const result = matchAllIndicators(indicators);
    expect(result[0].systemId).toBe("blood_pressure_systolic");
    expect(result[1].systemId).toBe("blood_glucose");
  });

  it("未匹配的 matchType 为 none", () => {
    const result = matchAllIndicators(indicators);
    expect(result[2].matchType).toBe("none");
  });
});

describe("extractIndicatorsFromTables", () => {
  const mockTable: ParsedTable = {
    pageIndex: 0,
    cells: [
      { row: 0, col: 0, text: "检验项目", bbox: [0, 0, 0, 0] },
      { row: 0, col: 1, text: "结果", bbox: [0, 0, 0, 0] },
      { row: 0, col: 2, text: "单位", bbox: [0, 0, 0, 0] },
      { row: 0, col: 3, text: "参考范围", bbox: [0, 0, 0, 0] },
      { row: 1, col: 0, text: "收缩压", bbox: [0, 0, 0, 0] },
      { row: 1, col: 1, text: "120", bbox: [0, 0, 0, 0] },
      { row: 1, col: 2, text: "mmHg", bbox: [0, 0, 0, 0] },
      { row: 1, col: 3, text: "90-140", bbox: [0, 0, 0, 0] },
      { row: 2, col: 0, text: "血糖", bbox: [0, 0, 0, 0] },
      { row: 2, col: 1, text: "5.2", bbox: [0, 0, 0, 0] },
      { row: 2, col: 2, text: "mmol/L", bbox: [0, 0, 0, 0] },
      { row: 2, col: 3, text: "3.9-6.1", bbox: [0, 0, 0, 0] },
    ],
  };

  it("从表格提取指标", () => {
    const result = extractIndicatorsFromTables([mockTable]);
    expect(result).toHaveLength(2);
    expect(result[0].rawLabel).toBe("收缩压");
    expect(result[0].value).toBe(120);
    expect(result[0].unit).toBe("mmHg");
  });

  it("跳过非数值行", () => {
    const table: ParsedTable = {
      pageIndex: 0,
      cells: [
        { row: 0, col: 0, text: "项目", bbox: [0, 0, 0, 0] },
        { row: 0, col: 1, text: "结果", bbox: [0, 0, 0, 0] },
        { row: 1, col: 0, text: "异常", bbox: [0, 0, 0, 0] },
        { row: 1, col: 1, text: "不是数字", bbox: [0, 0, 0, 0] },
      ],
    };
    const result = extractIndicatorsFromTables([table]);
    expect(result).toHaveLength(0);
  });

  it("空表格返回空数组", () => {
    expect(extractIndicatorsFromTables([])).toEqual([]);
  });
});

describe("extractDate", () => {
  it("提取 YYYY-MM-DD", () => {
    expect(extractDate("体检日期：2024-01-15")).toBe("2024-01-15");
  });

  it("提取 YYYY/MM/DD", () => {
    expect(extractDate("日期 2024/3/5")).toBe("2024-03-05");
  });

  it("提取中文日期", () => {
    expect(extractDate("2024年12月25日体检")).toBe("2024-12-25");
  });

  it("无日期返回 null", () => {
    expect(extractDate("没有日期的文本")).toBeNull();
  });
});

describe("resolveIndicators", () => {
  it("用户已有指标时 action 为 import", () => {
    const userCats = [{ id: "cat1", name: "blood_lipids", items: [{ id: "item1", label: "甘油三酯" }] }];
    const extracted: ExtractedIndicator[] = [{ rawLabel: "甘油三酯", value: 0.68, unit: "mmol/L", pageIndex: 0 }];
    const result = resolveIndicators(extracted, userCats);
    expect(result[0].action).toBe("import");
    expect(result[0].userItemFound).toBe(true);
  });

  it("未匹配指标 action 为 unnamed", () => {
    const result = resolveIndicators([{ rawLabel: "未知指标", value: 10, unit: "U/L", pageIndex: 0 }], []);
    expect(result[0].action).toBe("unnamed");
  });

  it("匹配但用户无分类时 action 为 create_category", () => {
    const result = resolveIndicators([{ rawLabel: "总胆固醇", value: 5.35, unit: "mmol/L", pageIndex: 0 }], []);
    expect(result[0].action).toBe("create_category");
  });
});

describe("groupByAction", () => {
  it("按 action 正确分组", () => {
    const userCats = [{ id: "cat1", name: "blood_lipids", items: [{ id: "item1", label: "甘油三酯" }] }];
    const extracted: ExtractedIndicator[] = [
      { rawLabel: "甘油三酯", value: 0.68, unit: "mmol/L", pageIndex: 0 },
      { rawLabel: "未知指标", value: 10, unit: "U/L", pageIndex: 0 },
    ];
    const resolved = resolveIndicators(extracted, userCats);
    const grouped = groupByAction(resolved);
    expect(grouped.import).toHaveLength(1);
    expect(grouped.unnamed).toHaveLength(1);
  });
});
