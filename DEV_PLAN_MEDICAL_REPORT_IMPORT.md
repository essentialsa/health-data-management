# 体检报告导入功能开发方案

## 项目概述

**项目名称**：健康数据管理网站 - 体检报告导入功能  
**技术栈**：React 18 + TypeScript + Vite + MUI + Tailwind CSS + Supabase  
**开发周期**：4-5 周  
**优先级**：高

---

## 1. 需求分析

### 1.1 用户场景描述

| 场景 | 描述 | 痛点 |
|------|------|------|
| 医院体检后导入 | 用户在医院完成体检后，获得 PDF/纸质体检报告，希望快速导入系统 | 手动录入 20+ 指标耗时且易出错 |
| 年度体检对比 | 用户每年体检，希望将多年报告导入后进行趋势分析 | 历史数据分散，难以对比 |
| 多机构报告整合 | 用户在不同医院体检，报告格式各异 | 格式不统一，无法批量处理 |
| 家庭健康管理 | 用户为家人管理体检报告 | 多人多报告，管理复杂 |

### 1.2 支持的文件格式及优先级

| 优先级 | 格式 | 说明 | 占比预估 |
|--------|------|------|----------|
| P0 | PDF（电子版） | 医院官方生成的电子 PDF 报告 | 60% |
| P0 | PDF（扫描件） | 纸质报告拍照/扫描生成 | 25% |
| P1 | DOCX | 部分机构提供的 Word 格式报告 | 10% |
| P1 | 图片（JPG/PNG） | 手机拍摄的纸质报告 | 15% |
| P2 | HTML | 在线报告导出 | 5% |

> 注：百分比为预估占比，总和超过 100% 是因为部分用户有多种格式

### 1.3 功能边界和限制

**功能边界**：
- ✅ 支持常见体检指标自动识别和提取
- ✅ 支持用户确认和修正提取结果
- ✅ 支持新增指标类别的创建
- ✅ 支持批量导入多页报告

**限制**：
- ❌ 不支持手写体识别（准确率过低）
- ❌ 不支持极度模糊/低质量图片（分辨率<300dpi 建议用户重拍）
- ❌ 不支持非结构化自由文本报告（需有表格或明确指标 - 数值对应关系）
- ❌ 单文件上限 50MB（浏览器解析性能限制）

---

## 2. 技术选型

### 2.1 PDF 解析方案

#### 推荐方案：**pdfjs-dist** + **pdf-parse**（双引擎策略）

```bash
npm install pdfjs-dist pdf-parse
```

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **pdfjs-dist** | Mozilla 出品，浏览器原生支持，可渲染 PDF 为 Canvas | 文本提取能力有限，复杂布局可能丢失 | 电子 PDF、有明确文本层的报告 |
| **pdf-parse** | 基于 pdf.js 封装，文本提取更友好 | 需要 Node.js 环境（需通过 Web Worker 或后端代理） | 作为备选方案 |

**选型理由**：
1. **纯前端优先**：pdfjs-dist 可在浏览器直接运行，无需后端服务
2. **成熟稳定**：Mozilla 维护，GitHub 25k+ stars
3. **类型支持好**：提供 TypeScript 类型定义
4. **可扩展**：支持自定义渲染和文本层提取

**备选方案**：如遇到复杂 PDF，可考虑接入后端服务（如 Python + PyMuPDF）

### 2.2 DOCX 解析方案

#### 推荐方案：**mammoth.js**

```bash
npm install mammoth
```

| 方案 | 优点 | 缺点 |
|------|------|------|
| **mammoth.js** | 专注于内容提取，忽略样式，输出干净文本/HTML | 不支持复杂表格解析 |
| docx | 可读写 DOCX，功能全面 | 体积大，解析慢 |

**选型理由**：
1. 体检报告 DOCX 通常是简单表格结构
2. mammoth 提取速度快，适合浏览器环境
3. 输出 HTML 便于后续解析

### 2.3 OCR 方案（针对扫描件/图片）

#### 推荐方案：**Tesseract.js**

```bash
npm install tesseract.js
```

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Tesseract.js** | 纯前端，支持中文，准确率尚可 | 大图片处理慢（5-10 秒/页） |
| 百度/阿里 OCR API | 准确率高，速度快 | 需要 API Key，有调用成本，隐私顾虑 |

**选型理由**：
1. **隐私保护**：健康数据敏感，纯前端处理避免上传
2. **成本控制**：无 API 调用费用
3. **可接受准确率**：体检报告通常是打印体，Tesseract 识别率>90%

**优化策略**：
- 图片预处理（二值化、去噪）提升识别率
- 限制单文件最多 10 页，避免浏览器卡死
- 提供"跳过 OCR"选项，允许用户手动录入

### 2.4 NLP/规则匹配方案

#### 推荐方案：**正则表达式 + 模糊匹配 + 自定义词典**

```bash
npm install string-similarity
```

**技术组合**：
1. **正则表达式**：提取数值、单位、日期等结构化信息
2. **string-similarity**：指标名称模糊匹配（处理"总胆固醇"vs"TC"等别名）
3. **自定义词典**：维护指标名称映射表（见第 4 节）

**为什么不使用大型 NLP 库**：
- 体检报告结构相对固定，规则匹配足够
- 避免引入过大依赖（如 compromise、natural 等库体积>1MB）
- 浏览器环境性能考虑

---

## 3. 系统架构设计

### 3.1 整体流程图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           用户操作流程                                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  1. 上传文件                                                             │
│     - 支持拖拽/选择                                                       │
│     - 格式检测（PDF/DOCX/图片）                                           │
│     - 大小限制检查（<50MB）                                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  2. 文件解析                                                             │
│     ┌─────────────┬─────────────┬─────────────┐                         │
│     │   PDF 解析   │  DOCX 解析   │   OCR 解析   │                         │
│     │ pdfjs-dist  │  mammoth    │  Tesseract  │                         │
│     └─────────────┴─────────────┴─────────────┘                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  3. 文本预处理                                                           │
│     - 清理空白字符                                                        │
│     - 标准化格式（全角→半角）                                              │
│     - 提取表格结构（如有）                                                 │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  4. 指标识别与提取                                                       │
│     - 正则匹配：指标名 + 数值 + 单位                                       │
│     - 模糊匹配：指标名称映射                                               │
│     - 置信度评分：标记不确定的结果                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  5. 结果预览与确认                                                       │
│     - 展示提取结果（表格形式）                                             │
│     - 高亮低置信度项                                                       │
│     - 支持用户手动修正                                                     │
│     - 支持新增指标类别                                                     │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  6. 数据保存                                                             │
│     - 匹配现有指标 → 插入 HealthRecord                                   │
│     - 新增指标 → 创建 IndicatorCategory + IndicatorItem → 插入记录        │
│     - 写入 Supabase / LocalStorage                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 模块划分

```
src/
├── app/
│   ├── components/
│   │   ├── ImportRecordsDialog.tsx        # 现有导入组件（扩展）
│   │   ├── MedicalReportImportDialog.tsx  # 【新增】体检报告导入主组件
│   │   ├── ReportPreviewTable.tsx         # 【新增】解析结果预览表格
│   │   ├── IndicatorMappingEditor.tsx     # 【新增】指标映射编辑器
│   │   └── OcrProgress.tsx                # 【新增】OCR 进度显示
│   │
│   ├── services/
│   │   ├── pdfParser.ts                   # 【新增】PDF 解析服务
│   │   ├── docxParser.ts                  # 【新增】DOCX 解析服务
│   │   ├── ocrService.ts                  # 【新增】OCR 服务
│   │   ├── indicatorExtractor.ts          # 【新增】指标提取服务
│   │   └── indicatorMatcher.ts            # 【新增】指标匹配服务
│   │
│   ├── types/
│   │   └── medicalReport.ts               # 【新增】类型定义
│   │
│   └── utils/
│       ├── textNormalizer.ts              # 【新增】文本标准化工具
│       └── indicatorDictionary.ts         # 【新增】指标词典
```

### 3.3 数据流设计

```typescript
// 核心数据流
File → ParserService → RawText → ExtractorService → ExtractedIndicators[]
       ↓                                              ↓
   (格式解析)                                    (指标识别)
                                                    ↓
                                           MatcherService → MappedIndicators[]
                                                           ↓
                                                    User Confirm/Edit
                                                           ↓
                                                    Save to Supabase
```

---

## 4. 数据匹配逻辑

### 4.1 指标名称映射表设计

**设计原则**：
1. 支持多对一映射（多个别名 → 一个标准指标）
2. 支持模糊匹配（相似度阈值>0.8）
3. 支持正则匹配（处理"总胆固醇 (TC)"等变体）

**映射表结构**：

```typescript
// src/utils/indicatorDictionary.ts

interface IndicatorAlias {
  alias: string;           // 别名（如"TC"、"总胆固醇"）
  pattern?: string;        // 正则表达式（可选，如"/总胆固醇\s*\([^\)]*\)/"）
  priority: number;        // 优先级（数字越大优先级越高）
}

interface IndicatorMapping {
  systemId: string;        // 系统标准 ID（如"blood_pressure_systolic"）
  systemLabel: string;     // 系统标准名称（如"收缩压"）
  categoryId: string;      // 所属分类 ID（如"blood_pressure"）
  aliases: IndicatorAlias[]; // 别名列表
  units: string[];         // 支持的单位（如["mmHg", "kPa"]）
  conversion?: {           // 单位转换规则（可选）
    from: string;
    to: string;
    formula: (value: number) => number;
  };
}

// 默认指标映射表（8 个分类）
export const DEFAULT_INDICATOR_MAPPINGS: IndicatorMapping[] = [
  {
    systemId: "blood_pressure_systolic",
    systemLabel: "收缩压",
    categoryId: "blood_pressure",
    aliases: [
      { alias: "收缩压", priority: 10 },
      { alias: "高压", priority: 8 },
      { alias: "SBP", priority: 8 },
      { alias: "收缩压 (SBP)", priority: 9, pattern: "收缩压\\s*\\([^\\)]*\\)" },
    ],
    units: ["mmHg", "kPa"],
    conversion: { from: "kPa", to: "mmHg", formula: (v) => v * 7.5 },
  },
  {
    systemId: "blood_pressure_diastolic",
    systemLabel: "舒张压",
    categoryId: "blood_pressure",
    aliases: [
      { alias: "舒张压", priority: 10 },
      { alias: "低压", priority: 8 },
      { alias: "DBP", priority: 8 },
    ],
    units: ["mmHg", "kPa"],
    conversion: { from: "kPa", to: "mmHg", formula: (v) => v * 7.5 },
  },
  {
    systemId: "blood_glucose",
    systemLabel: "血糖",
    categoryId: "blood_glucose",
    aliases: [
      { alias: "血糖", priority: 10 },
      { alias: "GLU", priority: 8 },
      { alias: "空腹血糖", priority: 9 },
      { alias: "FBG", priority: 8 },
      { alias: "葡萄糖", priority: 7 },
    ],
    units: ["mmol/L", "mg/dL"],
    conversion: { from: "mg/dL", to: "mmol/L", formula: (v) => v / 18 },
  },
  // ... 其他指标类似结构
];
```

### 4.2 新增指标的处理流程

```
1. 提取到未匹配指标（如"载脂蛋白 A1"）
        ↓
2. 检查是否为用户已创建的自定义指标
        ↓
   ┌────┴────┐
   │  是     │  否
   ↓         ↓
使用已有   提示用户确认
指标 ID    ↓
       ┌───┴───┐
       │ 创建新  │  忽略
       │ 指标   │  ↓
       ↓       (跳过该行)
   创建 IndicatorItem
       ↓
   插入 HealthRecord
```

**UI 交互**：
- 在预览页面，未匹配指标显示为橙色高亮
- 提供"创建新指标"按钮，弹窗输入：
  - 指标名称（必填）
  - 所属分类（选择或新建）
  - 单位（必填）
  - 参考范围（可选）

### 4.3 歧义/不确定值的处理策略

**置信度评分机制**：

```typescript
interface ExtractionConfidence {
  level: "high" | "medium" | "low";
  score: number;  // 0-1
  reasons: string[];
}

function calculateConfidence(match: IndicatorMatch): ExtractionConfidence {
  const reasons: string[] = [];
  let score = 1.0;

  // 精确匹配
  if (match.matchType === "exact") {
    score *= 1.0;
    reasons.push("精确匹配");
  } else if (match.matchType === "fuzzy") {
    score *= match.similarity;  // 0.8-0.95
    reasons.push(`模糊匹配 (相似度:${(match.similarity * 100).toFixed(0)}%)`);
  } else if (match.matchType === "regex") {
    score *= 0.9;
    reasons.push("正则匹配");
  }

  // 单位验证
  if (!match.expectedUnits.includes(match.unit)) {
    score *= 0.7;
    reasons.push(`单位不常见：${match.unit}`);
  }

  // 数值范围验证
  if (!isValueInRange(match.value, match.systemId)) {
    score *= 0.6;
    reasons.push("数值超出正常范围");
  }

  // 判定等级
  let level: "high" | "medium" | "low";
  if (score >= 0.85) level = "high";
  else if (score >= 0.6) level = "medium";
  else level = "low";

  return { level, score, reasons };
}
```

**UI 展示策略**：
- `high`：绿色标记，默认选中
- `medium`：黄色标记，需用户确认
- `low`：红色标记，强制用户确认或跳过

### 4.4 单位和参考范围的统一处理

**单位标准化**：

```typescript
// src/utils/unitConverter.ts

interface UnitConversion {
  from: string;
  to: string;
  factor: number;
  offset?: number;  // 用于华氏度等需要偏移的单位
}

const UNIT_CONVERSIONS: Record<string, UnitConversion[]> = {
  blood_pressure: [
    { from: "kPa", to: "mmHg", factor: 7.5 },
    { from: "mmHg", to: "kPa", factor: 1 / 7.5 },
  ],
  blood_glucose: [
    { from: "mg/dL", to: "mmol/L", factor: 1 / 18 },
    { from: "mmol/L", to: "mg/dL", factor: 18 },
  ],
  // ...
};

export function normalizeValue(
  value: number,
  fromUnit: string,
  toUnit: string,
  categoryId: string
): number {
  const conversions = UNIT_CONVERSIONS[categoryId] || [];
  const conversion = conversions.find(c => c.from === fromUnit && c.to === toUnit);
  
  if (!conversion) {
    throw new Error(`不支持的单位转换：${fromUnit} → ${toUnit}`);
  }

  let result = value * conversion.factor;
  if (conversion.offset) {
    result += conversion.offset;
  }
  
  return Math.round(result * 100) / 100;  // 保留 2 位小数
}
```

---

## 5. UI/UX 设计

### 5.1 导入界面设计

**方案**：扩展现有 `ImportRecordsDialog.tsx`，新增"体检报告"标签页

```tsx
// 在现有 Tabs 中新增一个 Tab
<TabsList>
  <TabsTrigger value="file">文件导入</TabsTrigger>
  <TabsTrigger value="medical-report">体检报告</TabsTrigger>  {/* 新增 */}
  <TabsTrigger value="manual">手动录入</TabsTrigger>
</TabsList>

<TabsContent value="medical-report">
  <MedicalReportImportDialog
    categories={categories}
    onImportRecords={onImportRecords}
  />
</TabsContent>
```

**体检报告导入界面布局**：

```
┌────────────────────────────────────────────────────────────┐
│  📄 体检报告导入                                            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                                                      │  │
│  │        📤 拖拽体检报告到此处                          │  │
│  │           或点击选择文件                              │  │
│  │                                                      │  │
│  │   支持格式：PDF / DOCX / JPG / PNG                   │  │
│  │   单文件上限：50MB                                   │  │
│  │                                                      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ⚙️ 解析选项                                                │
│  ☑ 启用 OCR（针对扫描件）   ☐ 跳过低质量页面                │
│                                                            │
├────────────────────────────────────────────────────────────┤
│  [取消]                              [下一步：预览结果]    │
└────────────────────────────────────────────────────────────┘
```

### 5.2 解析结果预览与确认页面

```
┌────────────────────────────────────────────────────────────┐
│  📋 解析结果预览                                            │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  文件：体检报告_2024.pdf   |   共 3 页   |   提取 28 项指标    │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 筛选：☑ 全部  ☑ 高置信度  ☑ 中置信度  ☐ 低置信度      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ 日期       │ 指标      │ 数值  │ 单位  │ 置信度  │ ... │  │
│  ├──────────────────────────────────────────────────────┤  │
│  │ 2024-01-15 │ 收缩压    │ 120   │ mmHg  │ 🟢 高   │ ✏️  │  │
│  │ 2024-01-15 │ 舒张压    │ 80    │ mmHg  │ 🟢 高   │ ✏️  │  │
│  │ 2024-01-15 │ 总胆固醇  │ 5.2   │ mmol/L│ 🟡 中   │ ✏️  │  │
│  │ 2024-01-15 │ 载脂蛋白 A1│ 1.8  │ g/L   │ 🔴 低   │ ✏️  │  │
│  │            │           │       │       │ (未匹配)│ ➕  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  📊 统计：已匹配 25 项  |  待确认 3 项  |  跳过 2 项           │
│                                                            │
├────────────────────────────────────────────────────────────┤
│  [上一步]    [导出未匹配项]          [确认导入 (25 条)]      │
└────────────────────────────────────────────────────────────┘
```

**交互细节**：
1. **行内编辑**：点击✏️图标可直接修改数值/单位/指标名称
2. **批量操作**：支持多选后批量确认/跳过
3. **未匹配项处理**：点击➕创建新指标，或选择"跳过"

### 5.3 错误处理和用户反馈

**错误类型及处理**：

| 错误类型 | 触发条件 | 处理方式 |
|----------|----------|----------|
| 格式不支持 | 上传非 PDF/DOCX/图片 | Toast 提示 + 拒绝上传 |
| 文件过大 | >50MB | Toast 提示 + 拒绝上传 |
| 解析失败 | PDF 损坏/加密 | 显示错误详情 + 建议重新导出 |
| OCR 失败 | 图片质量过低 | 提示用户手动录入 + 跳过该页 |
| 无匹配指标 | 所有指标均未匹配 | 引导用户创建新指标或检查报告 |

**反馈组件**：

```tsx
// 使用现有 Sonner Toast
import { toast } from "sonner";

// 成功
toast.success("导入成功！共导入 25 条记录", {
  description: "2024-01-15 的体检数据已保存",
});

// 警告
toast.warning("3 项指标未匹配", {
  description: "请确认是否创建新指标",
  action: {
    label: "去处理",
    onClick: () => navigateToUnmatched(),
  },
});

// 错误
toast.error("解析失败", {
  description: "该 PDF 文件已加密，请使用未加密版本",
});
```

---

## 6. 接口设计

### 6.1 新增组件和函数签名

```typescript
// src/app/components/MedicalReportImportDialog.tsx

interface MedicalReportImportDialogProps {
  categories: IndicatorCategory[];
  onImportRecords: (records: HealthRecord[]) => void;
  onCreateCategory?: (category: Omit<IndicatorCategory, "id">) => Promise<string>;
  onCreateIndicator?: (indicator: Omit<IndicatorItem, "id">) => Promise<string>;
}

export function MedicalReportImportDialog({
  categories,
  onImportRecords,
  onCreateCategory,
  onCreateIndicator,
}: MedicalReportImportDialogProps): JSX.Element;


// src/app/services/pdfParser.ts

interface ParseResult {
  success: boolean;
  text?: string;
  tables?: TableData[];
  error?: string;
  pageCount?: number;
}

interface TableData {
  headers: string[];
  rows: string[][];
  pageIndex: number;
}

export async function parsePdf(file: File): Promise<ParseResult>;
export async function parsePdfPage(file: File, pageIndex: number): Promise<ParseResult>;


// src/app/services/ocrService.ts

interface OcrResult {
  success: boolean;
  text: string;
  confidence: number;  // 0-1
  words: OcrWord[];
}

interface OcrWord {
  text: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export async function performOcr(file: File, lang?: "chi_sim" | "eng"): Promise<OcrResult>;
export function cancelOcr(): void;  // 取消正在进行的 OCR


// src/app/services/indicatorExtractor.ts

interface ExtractedIndicator {
  rawLabel: string;      // 原始标签（如"总胆固醇 (TC)"）
  value: number;
  unit: string;
  date?: string;         // 如能从报告中提取日期
  pageIndex: number;
  confidence: ExtractionConfidence;
}

export function extractIndicators(
  text: string,
  tables?: TableData[]
): ExtractedIndicator[];


// src/app/services/indicatorMatcher.ts

interface MatchedIndicator extends ExtractedIndicator {
  systemId?: string;     // 匹配的系统指标 ID
  systemLabel?: string;  // 匹配的系统指标名称
  categoryId?: string;   // 所属分类 ID
  matchType: "exact" | "fuzzy" | "regex" | "none";
  similarity?: number;   // 模糊匹配相似度
}

export function matchIndicators(
  extracted: ExtractedIndicator[],
  categories: IndicatorCategory[],
  mappings: IndicatorMapping[]
): MatchedIndicator[];
```

### 6.2 与现有数据结构的集成

**现有结构**（来自 `AddRecordDialog.tsx`）：

```typescript
interface IndicatorItem {
  id: string;
  label: string;
  unit: string;
  code?: string;
  referenceRange?: string;
  dataType?: "number" | "text" | "boolean";
  enabled?: boolean;
  order?: number;
}

interface IndicatorCategory {
  id: string;
  name: string;
  code?: string;
  enabled?: boolean;
  order?: number;
  items: IndicatorItem[];
}

interface HealthRecord {
  id: string;
  date: string;
  indicatorType: string;  // 对应 IndicatorItem.id
  value: number;
  unit: string;
  operationAt?: string;
}
```

**集成方式**：

```typescript
// 1. 匹配现有指标 → 直接创建 HealthRecord
const records: HealthRecord[] = matchedIndicators
  .filter(m => m.systemId)
  .map(m => ({
    id: `${Date.now()}_${m.systemId}_${Math.random().toString(36).slice(2, 8)}`,
    date: m.date || selectedDate,
    indicatorType: m.systemId!,
    value: m.value,
    unit: m.unit,
    operationAt: new Date().toISOString(),
  }));

// 2. 新增指标 → 先创建 IndicatorItem，再创建 HealthRecord
async function handleNewIndicator(
  unmatched: MatchedIndicator,
  newCategoryName: string,
  newIndicatorName: string
): Promise<HealthRecord> {
  // 2.1 检查/创建分类
  let category = categories.find(c => c.name === newCategoryName);
  if (!category) {
    const categoryId = await onCreateCategory?.({
      name: newCategoryName,
      items: [],
      enabled: true,
      order: categories.length,
    });
    category = { id: categoryId!, name: newCategoryName, items: [], enabled: true };
  }

  // 2.2 创建指标项
  const indicatorId = await onCreateIndicator?.({
    label: newIndicatorName,
    unit: unmatched.unit,
    categoryId: category.id,
    dataType: "number",
    enabled: true,
  });

  // 2.3 创建记录
  return {
    id: `${Date.now()}_${indicatorId}_${Math.random().toString(36).slice(2, 8)}`,
    date: unmatched.date || selectedDate,
    indicatorType: indicatorId!,
    value: unmatched.value,
    unit: unmatched.unit,
    operationAt: new Date().toISOString(),
  };
}
```

---

## 7. 测试方案

### 7.1 单元测试策略

**测试框架**：使用现有的 Vitest

```bash
npm install -D vitest @testing-library/react
```

**测试文件结构**：

```
src/
├── app/
│   ├── services/
│   │   ├── pdfParser.test.ts
│   │   ├── ocrService.test.ts
│   │   ├── indicatorExtractor.test.ts
│   │   └── indicatorMatcher.test.ts
│   │
│   └── utils/
│       ├── textNormalizer.test.ts
│       ├── unitConverter.test.ts
│       └── indicatorDictionary.test.ts
```

**关键测试用例**：

```typescript
// src/app/services/indicatorMatcher.test.ts

import { describe, it, expect } from "vitest";
import { matchIndicators } from "./indicatorMatcher";
import { DEFAULT_INDICATOR_MAPPINGS } from "../utils/indicatorDictionary";

describe("indicatorMatcher", () => {
  it("应精确匹配标准指标名称", () => {
    const extracted = [
      { rawLabel: "收缩压", value: 120, unit: "mmHg", pageIndex: 1, confidence: { level: "high", score: 1, reasons: [] } },
    ];
    
    const matched = matchIndicators(extracted, mockCategories, DEFAULT_INDICATOR_MAPPINGS);
    
    expect(matched[0].systemId).toBe("blood_pressure_systolic");
    expect(matched[0].matchType).toBe("exact");
  });

  it("应模糊匹配别名", () => {
    const extracted = [
      { rawLabel: "高压", value: 120, unit: "mmHg", pageIndex: 1, confidence: { level: "high", score: 1, reasons: [] } },
    ];
    
    const matched = matchIndicators(extracted, mockCategories, DEFAULT_INDICATOR_MAPPINGS);
    
    expect(matched[0].systemId).toBe("blood_pressure_systolic");
    expect(matched[0].matchType).toBe("fuzzy");
    expect(matched[0].similarity).toBeGreaterThan(0.8);
  });

  it("应处理单位转换", () => {
    const extracted = [
      { rawLabel: "血糖", value: 90, unit: "mg/dL", pageIndex: 1, confidence: { level: "high", score: 1, reasons: [] } },
    ];
    
    const matched = matchIndicators(extracted, mockCategories, DEFAULT_INDICATOR_MAPPINGS);
    
    expect(matched[0].value).toBe(5);  // 90 mg/dL = 5 mmol/L
    expect(matched[0].unit).toBe("mmol/L");
  });

  it("未匹配指标应标记为 none", () => {
    const extracted = [
      { rawLabel: "未知指标 XYZ", value: 100, unit: "U/L", pageIndex: 1, confidence: { level: "high", score: 1, reasons: [] } },
    ];
    
    const matched = matchIndicators(extracted, mockCategories, DEFAULT_INDICATOR_MAPPINGS);
    
    expect(matched[0].systemId).toBeUndefined();
    expect(matched[0].matchType).toBe("none");
  });
});
```

### 7.2 集成测试策略

**测试场景**：

1. **完整导入流程**：上传 PDF → 解析 → 提取 → 匹配 → 保存
2. **OCR 流程**：上传图片 → OCR → 提取 → 保存
3. **新增指标流程**：未匹配指标 → 创建新分类 → 创建新指标 → 保存
4. **错误处理**：损坏文件、加密 PDF、超大文件

**测试工具**：

```typescript
// 使用 @testing-library/react 进行组件集成测试
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MedicalReportImportDialog } from "./MedicalReportImportDialog";

describe("MedicalReportImportDialog Integration", () => {
  it("应完成完整的导入流程", async () => {
    const mockOnImport = vi.fn();
    const mockFile = new File(["dummy pdf content"], "report.pdf", { type: "application/pdf" });

    render(
      <MedicalReportImportDialog
        categories={mockCategories}
        onImportRecords={mockOnImport}
      />
    );

    // 1. 上传文件
    const fileInput = screen.getByLabelText(/上传/i);
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    // 2. 等待解析
    await waitFor(() => {
      expect(screen.getByText(/解析完成/i)).toBeInTheDocument();
    });

    // 3. 确认导入
    const confirmButton = screen.getByRole("button", { name: /确认导入/i });
    fireEvent.click(confirmButton);

    // 4. 验证回调
    await waitFor(() => {
      expect(mockOnImport).toHaveBeenCalled();
    });
  });
});
```

### 7.3 测试数据准备

**测试文件目录**：

```
test-data/
├── pdf/
│   ├── electronic_report.pdf          # 电子 PDF（有文本层）
│   ├── scanned_report.pdf             # 扫描 PDF（无文本层）
│   ├── encrypted_report.pdf           # 加密 PDF（测试错误处理）
│   └── multi_page_report.pdf          # 多页报告
│
├── docx/
│   ├── standard_report.docx           # 标准 Word 报告
│   └── table_report.docx              # 含表格 Word 报告
│
├── images/
│   ├── clear_photo.jpg                # 清晰照片
│   ├── blurry_photo.jpg               # 模糊照片（测试 OCR 失败）
│   └── handwritten.jpg                # 手写体（测试跳过）
│
└── fixtures/
    ├── mockCategories.ts              # 模拟分类数据
    ├── mockMappings.ts                # 模拟映射表
    └── expectedResults.json           # 期望输出结果
```

**测试数据生成脚本**：

```typescript
// scripts/generate-test-data.ts
// 使用 pdf-lib 生成测试 PDF
// 使用 Tesseract 预标注测试图片
```

---

## 8. 开发排期

### 8.1 分阶段开发计划

| 阶段 | 内容 | 时间 | 交付物 |
|------|------|------|--------|
| **Phase 1** | 基础架构搭建 | 3 天 | 项目结构、类型定义、工具函数 |
| **Phase 2** | PDF/DOCX解析 | 4 天 | pdfParser.ts、docxParser.ts |
| **Phase 3** | OCR 集成 | 3 天 | ocrService.ts、进度 UI |
| **Phase 4** | 指标提取与匹配 | 5 天 | indicatorExtractor.ts、indicatorMatcher.ts、词典 |
| **Phase 5** | UI 开发 | 5 天 | MedicalReportImportDialog、预览表格、编辑器 |
| **Phase 6** | 集成与测试 | 4 天 | 单元测试、集成测试、Bug 修复 |
| **Phase 7** | 优化与文档 | 2 天 | 性能优化、用户文档、代码审查 |

**总计**：26 个工作日 ≈ 5 周

### 8.2 详细排期

#### Phase 1: 基础架构搭建（Day 1-3）

```
Day 1:
  - 创建目录结构
  - 安装依赖（pdfjs-dist, mammoth, tesseract.js, string-similarity）
  - 定义 TypeScript 类型（medicalReport.ts）

Day 2:
  - 实现文本标准化工具（textNormalizer.ts）
  - 实现单位转换工具（unitConverter.ts）
  - 编写单元测试

Day 3:
  - 构建指标词典框架（indicatorDictionary.ts）
  - 录入 8 个默认分类的映射表
  - 代码审查
```

#### Phase 2: PDF/DOCX 解析（Day 4-7）

```
Day 4:
  - 实现 pdfParser.ts（基础文本提取）
  - 处理电子 PDF

Day 5:
  - 处理扫描 PDF（检测文本层是否存在）
  - 实现表格提取（如有）

Day 6:
  - 实现 docxParser.ts
  - 处理 Word 表格

Day 7:
  - 编写解析器测试
  - 准备测试文件
```

#### Phase 3: OCR 集成（Day 8-10）

```
Day 8:
  - 集成 Tesseract.js
  - 实现基础 OCR 功能

Day 9:
  - 添加图片预处理（二值化、去噪）
  - 实现 OCR 进度显示

Day 10:
  - 处理 OCR 失败场景
  - 编写测试
```

#### Phase 4: 指标提取与匹配（Day 11-15）

```
Day 11:
  - 实现指标提取器（正则匹配）
  - 提取数值、单位、日期

Day 12:
  - 实现指标匹配器（精确匹配）
  - 集成映射表

Day 13:
  - 实现模糊匹配（string-similarity）
  - 实现置信度评分

Day 14:
  - 实现单位转换逻辑
  - 处理新增指标流程

Day 15:
  - 编写完整测试
  - 边界情况处理
```

#### Phase 5: UI 开发（Day 16-20）

```
Day 16:
  - 创建 MedicalReportImportDialog 框架
  - 实现文件上传区域

Day 17:
  - 实现解析进度显示
  - 实现 OCR 进度显示

Day 18:
  - 实现 ReportPreviewTable 组件
  - 行内编辑功能

Day 19:
  - 实现 IndicatorMappingEditor 组件
  - 新增指标弹窗

Day 20:
  - 错误处理和 Toast 反馈
  - UI 细节优化
```

#### Phase 6: 集成与测试（Day 21-24）

```
Day 21:
  - 端到端集成测试
  - 修复集成问题

Day 22:
  - 性能测试（大文件、多页）
  - 内存泄漏检查

Day 23:
  - 用户测试（邀请 2-3 人试用）
  - 收集反馈

Day 24:
  - Bug 修复
  - 回归测试
```

#### Phase 7: 优化与文档（Day 25-26）

```
Day 25:
  - 代码优化和重构
  - 代码审查

Day 26:
  - 编写用户文档
  - 编写开发文档
  - 项目交付
```

### 8.3 里程碑

| 里程碑 | 时间点 | 验收标准 |
|--------|--------|----------|
| M1: 基础架构完成 | Day 3 | 所有类型定义完成，工具函数通过测试 |
| M2: 解析能力完成 | Day 10 | PDF/DOCX/图片均可解析，准确率>85% |
| M3: 匹配逻辑完成 | Day 15 | 默认 8 分类指标匹配率>90% |
| M4: UI 完成 | Day 20 | 完整导入流程可运行 |
| M5: 测试完成 | Day 24 | 单元测试覆盖率>80%，无 P0 Bug |
| **M6: 上线** | **Day 26** | **用户验收通过** |

---

## 9. 风险与应对

| 风险 | 概率 | 影响 | 应对措施 |
|------|------|------|----------|
| PDF 格式复杂导致解析失败 | 中 | 高 | 提供手动录入备选方案 |
| OCR 准确率低 | 中 | 中 | 图片预处理优化 + 用户确认流程 |
| 指标匹配率低 | 低 | 高 | 持续扩充映射表 + 用户反馈收集 |
| 浏览器性能问题（大文件） | 中 | 中 | 限制文件大小 + 分页处理 |
| 隐私合规问题 | 低 | 高 | 纯前端处理 + 明确用户协议 |

---

## 10. 依赖清单

```json
{
  "dependencies": {
    "pdfjs-dist": "^4.0.379",
    "mammoth": "^1.7.2",
    "tesseract.js": "^5.0.4",
    "string-similarity": "^4.0.4"
  },
  "devDependencies": {
    "@types/pdfjs-dist": "^2.10.378",
    "@types/mammoth": "^1.4.6",
    "@types/string-similarity": "^4.0.2"
  }
}
```

**安装命令**：

```bash
cd "/home/node/.openclaw/workspace/Health Data Management Site"
npm install pdfjs-dist mammoth tesseract.js string-similarity
npm install -D @types/pdfjs-dist @types/mammoth @types/string-similarity
```

---

## 11. 总结

本开发方案提供了从需求分析到上线交付的完整规划，核心特点：

1. **纯前端优先**：保护用户隐私，健康数据不出浏览器
2. **渐进式增强**：电子 PDF→扫描 PDF→图片 OCR，逐级降级
3. **用户确认机制**：所有提取结果需用户确认，确保准确性
4. **可扩展设计**：支持用户自定义指标和映射规则
5. **完整测试覆盖**：单元测试 + 集成测试 + 真实数据测试

**预期效果**：
- 用户导入一份 10 页体检报告的时间从 15 分钟（手动录入）降至 2 分钟（自动导入 + 确认）
- 指标匹配准确率>90%（针对常见体检项目）
- 用户满意度>4.5/5

---

**文档版本**：v1.0  
**创建日期**：2026-04-17  
**作者**：全栈架构师 Agent  
**审核状态**：待审核
