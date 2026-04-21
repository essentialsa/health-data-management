# 体检报告导入功能开发方案 — 评审报告（评审后最终版）

**评审日期**：2026-04-17  
**项目**：Health Data Management Site  
**技术栈**：React 18 + TypeScript + Vite + MUI + Tailwind CSS + Supabase

---

## 📊 项目分析摘要（Subagent-1）

| 维度 | 详情 |
|------|------|
| 文件数 | 56 个 TSX/TS，~7,157 行核心代码 |
| UI 框架 | MUI Material + shadcn/ui + Tailwind CSS |
| 已实现功能 | 认证、录入、表格、图表、Excel/CSV 导入导出、云同步(Google Drive + Supabase)、指标维护、变更日志 |
| 现有导入 | ImportRecordsDialog.tsx（843 行），仅支持 Excel/CSV 长表/宽表 |
| 数据结构 | HealthRecord + IndicatorCategory + IndicatorItem |
| 覆盖分类 | 8 个：血压、血糖、血脂、肝功能、肾功能、体重、BMI、心率 |

---

## 🔍 技术评审发现问题（17 项）

### 🔴 P0 必须修改（7 项）

| # | 编号 | 问题 | 修正方案 |
|---|------|------|----------|
| 1 | T01 | pdf-parse 不能用于浏览器（Node.js 专用） | 移除，仅用 pdfjs-dist + pdf-table-extract |
| 2 | T02 | Tesseract.js 内存风险（50-100MB/次） | 分页队列处理、单页分辨率限制、取消机制 |
| 3 | T03 | 缺少 PDF 表格提取方案 | 增加 pdf-table-extract 库 |
| 4 | T04 | mammoth.js 不支持复杂表格 | 补充 docx-templates |
| 5 | S01 | Phase 4 指标提取与匹配时间低估 | 5 天→8-10 天 |
| 6 | E03 | 测试样本不足（仅 9 个文件） | 至少 20+ 份不同医院真实报告 |
| 7 | C03 | XSS 安全风险（PDF/DOCX 文本含恶意脚本） | 增加 DOMPurify 清洗 |

### 🟡 P1 建议修改（7 项）

| # | 编号 | 问题 | 修正方案 |
|---|------|------|----------|
| 1 | A01 | 与现有 ImportRecordsDialog 集成方案不清晰 | 保持现有组件不变，新增独立 MedicalReportImport 模块 |
| 2 | A02 | App.tsx 单文件过大问题未考虑 | 新增 useMedicalReportImport Hook 分离业务逻辑 |
| 3 | D01 | 指标映射表覆盖范围不足（仅 8 分类） | 预留扩展接口，支持用户自定义映射 |
| 4 | D02 | 置信度评分机制过于简化 | 增加数值合理性、历史值对比、OCR 质量等维度 |
| 5 | D03 | 日期提取逻辑缺失 | 新增 dateExtractor.ts 工具 |
| 6 | U01 | OCR 进度显示过于简单 | 增加阶段提示（加载→预处理→识别→后处理） |
| 7 | C01/C02 | Tesseract 模型来源 + 临时文件清理 | 模型本地打包 + URL.revokeObjectURL 清理 |

### 🟢 P2 优化建议（3 项）

| # | 编号 | 问题 | 修正方案 |
|---|------|------|----------|
| 1 | D04 | 未处理指标组合情况（如"乙肝五项"） | 预留拆分逻辑 |
| 2 | U02 | 缺少批量修正功能 | 增加"全部应用此映射"批量操作 |
| 3 | U03/S03 | 错误恢复路径 + 灰度测试时间 | 草稿保存 + 预留 1-2 周灰度测试 |

---

## 📝 评审后的最终方案

### 1. 修正后的技术选型

| 模块 | 原方案 | 修正后 | 变更理由 |
|------|--------|--------|----------|
| PDF 解析 | pdfjs-dist + pdf-parse | **pdfjs-dist + pdf-table-extract** | pdf-parse 不能用于浏览器 |
| DOCX 解析 | mammoth.js | **mammoth.js + docx-templates** | 增强表格支持 |
| OCR | Tesseract.js | **Tesseract.js v5 + 本地模型** | 安全 + 性能优化 |
| 表格提取 | 无 | **pdf-table-extract** | 体检报告多为表格格式 |
| 安全防护 | 无 | **DOMPurify** | 防止 XSS 攻击 |
| 状态管理 | 组件内 state | **useMedicalReportImport Hook** | 业务逻辑与 UI 分离 |
| 日期提取 | 未提及 | **dateExtractor.ts** | 提取报告日期 |

### 2. 修正后的依赖清单

```json
{
  "dependencies": {
    "pdfjs-dist": "^4.0.379",
    "pdf-table-extract": "^1.0.4",
    "mammoth": "^1.7.2",
    "docx-templates": "^4.10.0",
    "tesseract.js": "^5.0.4",
    "string-similarity": "^4.0.4",
    "dompurify": "^3.0.6"
  },
  "devDependencies": {
    "@types/dompurify": "^3.0.5"
  }
}
```

### 3. 修正后的模块结构

```
src/
├── app/
│   ├── components/
│   │   ├── ImportRecordsDialog.tsx        # 现有组件（不变）
│   │   └── MedicalReportImport/           # 【新增】独立模块
│   │       ├── MedicalReportImportDialog.tsx
│   │       ├── ReportPreviewTable.tsx
│   │       ├── IndicatorMappingEditor.tsx
│   │       ├── OcrProgress.tsx
│   │       └── index.ts
│   │
│   ├── hooks/
│   │   └── useMedicalReportImport.ts      # 【新增】业务逻辑 Hook
│   │
│   ├── services/
│   │   └── medicalReport/                 # 【新增】服务目录
│   │       ├── pdfParser.ts
│   │       ├── docxParser.ts
│   │       ├── ocrService.ts
│   │       ├── indicatorExtractor.ts
│   │       ├── indicatorMatcher.ts
│   │       └── index.ts
│   │
│   ├── types/
│   │   └── medicalReport.ts
│   │
│   └── utils/
│       ├── textNormalizer.ts
│       ├── unitConverter.ts
│       ├── indicatorDictionary.ts
│       └── dateExtractor.ts               # 【新增】
```

### 4. 修正后的置信度评分（增强版）

```typescript
function calculateConfidence(match, context) {
  let score = 1.0;
  
  // 1. 匹配类型权重（40%）
  const weights = { exact: 1.0, regex: 0.9, fuzzy: 0.8, partial: 0.6 };
  score *= weights[match.matchType] ?? 0.5;
  
  // 2. 数值合理性验证（30%）
  if (!isValueInRange(match.value, match.systemId)) score *= 0.5;
  
  // 3. 单位验证（15%）
  if (!match.expectedUnits.includes(match.unit)) score *= 0.7;
  
  // 4. 上下文一致性（10%）- 与历史值偏差 >50% 则降分
  if (deviationFromHistory > 0.5) score *= 0.8;
  
  // 5. OCR 质量（5%）
  if (match.ocrConfidence < 0.8) score *= 0.9;
  
  return score >= 0.85 ? "high" : score >= 0.6 ? "medium" : "low";
}
```

### 5. OCR 性能优化

- **分页处理**：单页最大分辨率 2000x2000，超过则缩放
- **队列控制**：同时只处理 1 页 OCR，避免内存爆炸
- **模型预加载**：组件挂载时预加载 chi_sim.traineddata
- **取消机制**：提供"取消 OCR"按钮
- **降级策略**：单页 OCR 超过 15 秒提示跳过
- **本地模型**：Tesseract 语言模型从 public/ 目录加载，不从 CDN

### 6. 安全加固

- **XSS 防护**：所有 PDF/DOCX 提取文本经过 DOMPurify.sanitize()
- **内存管理**：解析完成后 URL.revokeObjectURL() 释放 Blob
- **CDN 安全**：Tesseract 模型本地打包
- **CSP**：确保允许 blob: 和 data: 协议

### 7. 修正后的开发排期

| 阶段 | 内容 | 时间 | 交付物 |
|------|------|------|--------|
| Phase 1 | 基础架构搭建 | 3 天 | 项目结构、类型定义、工具函数 |
| Phase 2 | PDF/DOCX 解析 | 4 天 | pdfParser.ts、docxParser.ts |
| Phase 3 | OCR 集成 | 3 天 | ocrService.ts、进度 UI |
| Phase 4 | 指标提取与匹配 | **8 天** | indicatorExtractor.ts、indicatorMatcher.ts |
| Phase 5 | UI 开发 | 5 天 | MedicalReportImportDialog 等组件 |
| Phase 6 | 集成与测试 | 4 天 | 单元测试、集成测试、Bug 修复 |
| Phase 7 | 优化与文档 | 2 天 | 性能优化、用户文档 |

**总计**：约 29 个工作日（原 26 天，+3 天用于增强测试和指标匹配）

### 8. 测试数据要求

- 至少 **20+ 份不同医院、不同格式**的真实体检报告
- 覆盖电子 PDF、扫描 PDF、DOCX、图片等多种格式
- 包含正常报告、加密文件、损坏文件等边界情况

---

## 📈 预期效果

| 指标 | 目标值 |
|------|--------|
| 导入时间 | 15 分钟（手动）→ **2 分钟**（自动 + 确认） |
| 指标匹配准确率 | **>90%**（常见体检项目） |
| 开发周期 | **~6 周**（29 个工作日 + 1-2 周灰度测试） |
| 用户满意度 | **>4.5/5** |

---

**文档版本**：v2.0（评审后）  
**创建日期**：2026-04-17  
**评审人**：全栈技术评审专家 Agent  
**状态**：✅ 评审完成，待审批
