/**
 * 体检报告解析服务 — 调用 OCR 解析 API
 */

const REMOTE_PARSER_ENDPOINTS = ["https://essentialsa-health-data-ocr.onrender.com"];
const LOCAL_PARSER_ENDPOINTS = ["http://127.0.0.1:8000", "http://localhost:8000"];
const PARSE_TIMEOUT_MS = 90000;
const HEALTH_CHECK_TIMEOUT_MS = 15000;

const isLocalBrowserPage = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
};

const isLocalParserEndpoint = (value: string): boolean => {
  try {
    const url = new URL(value);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
};

const normalizeParserEndpoint = (value: string): string | null => {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
};

const collectParserEndpoints = (): string[] => {
  const allowLocalParser = isLocalBrowserPage();
  const defaultParserEndpoints = allowLocalParser
    ? [...REMOTE_PARSER_ENDPOINTS, ...LOCAL_PARSER_ENDPOINTS]
    : REMOTE_PARSER_ENDPOINTS;
  const envList = (import.meta.env.VITE_REPORT_PARSER_URLS || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
  const single = (import.meta.env.VITE_REPORT_PARSER_URL || "").trim();
  const configured = [...envList, ...(single ? [single] : [])];
  const merged = configured.length > 0 ? [...configured, ...defaultParserEndpoints] : defaultParserEndpoints;
  const deduped: string[] = [];
  for (const endpoint of merged) {
    const normalized = normalizeParserEndpoint(endpoint);
    if (!normalized || deduped.includes(normalized)) {
      continue;
    }
    if (!allowLocalParser && isLocalParserEndpoint(normalized)) {
      continue;
    }
    deduped.push(normalized);
  }
  return deduped;
};

const PARSER_ENDPOINTS = collectParserEndpoints();

type EndpointAttemptError = {
  endpoint: string;
  status?: number;
  message: string;
};

const createTimeoutError = () => new DOMException("请求超时", "AbortError");

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(createTimeoutError());
  }, timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const readErrorMessage = async (resp: Response): Promise<string> => {
  const text = await resp.text();
  if (!text) {
    return `HTTP ${resp.status}`;
  }
  try {
    const payload = JSON.parse(text) as { detail?: string; message?: string };
    return payload.detail || payload.message || text;
  } catch {
    return text;
  }
};

const isRetryableStatus = (status: number): boolean => {
  if (status === 511) {
    return true;
  }
  if (status === 408 || status === 425 || status === 429) {
    return true;
  }
  return status >= 500;
};

const summarizeAttemptErrors = (errors: EndpointAttemptError[]): string => {
  if (errors.length === 0) {
    return "OCR 服务不可用，请检查服务状态。";
  }
  const details = errors.map(err => {
    const statusPart = typeof err.status === "number" ? ` (${err.status})` : "";
    return `${err.endpoint}${statusPart}：${err.message}`;
  });
  return `OCR 服务连接失败，已尝试：${details.join("；")}`;
};

const createUploadFormData = (file: File): FormData => {
  const formData = new FormData();
  formData.append("file", file);
  return formData;
};

/* ── 类型定义 ── */

export interface TableCell {
  row: number;
  col: number;
  text: string;
  bbox: [number, number, number, number];
}

export interface ParsedTable {
  pageIndex: number;
  cells: TableCell[];
}

export interface ExtractedIndicator {
  rawLabel: string;
  value: number;
  unit: string;
  referenceRange?: string;
  pageIndex: number;
}

export interface ParseResult {
  success: boolean;
  pageCount: number;
  reportDate?: string;
  tables: ParsedTable[];
  indicators: ExtractedIndicator[];
  markdown: string;
}

export interface ParserServiceStatus {
  online: boolean;
  endpoint?: string;
  message?: string;
  tried: string[];
}

export interface MatchedIndicator extends ExtractedIndicator {
  systemId?: string;
  systemLabel?: string;
  categoryId?: string;
  matchType: 'exact' | 'fuzzy' | 'none';
  similarity?: number;
  confidence: { level: 'high' | 'medium' | 'low'; score: number; reasons: string[] };
}

/* ── API 调用 ── */

export async function parseMedicalReport(file: File): Promise<ParseResult> {
  const errors: EndpointAttemptError[] = [];

  for (const endpoint of PARSER_ENDPOINTS) {
    try {
      const resp = await fetchWithTimeout(
        `${endpoint}/api/parse`,
        { method: "POST", body: createUploadFormData(file) },
        PARSE_TIMEOUT_MS,
      );

      if (resp.ok) {
        const payload = (await resp.json()) as ParseResult & { error?: string };
        if (!payload.success) {
          const message = payload.error || "OCR 解析失败";
          errors.push({ endpoint, message });
          continue;
        }
        return payload;
      }

      const message = await readErrorMessage(resp);
      errors.push({ endpoint, status: resp.status, message });

      if (!isRetryableStatus(resp.status)) {
        throw new Error(`解析失败 (${resp.status})：${message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "网络请求失败";
      errors.push({ endpoint, message });
    }
  }

  throw new Error(summarizeAttemptErrors(errors));
}

export async function checkParserService(): Promise<ParserServiceStatus> {
  const errors: EndpointAttemptError[] = [];
  for (const endpoint of PARSER_ENDPOINTS) {
    try {
      const resp = await fetchWithTimeout(`${endpoint}/api/health`, { method: "GET" }, HEALTH_CHECK_TIMEOUT_MS);
      if (resp.ok) {
        return {
          online: true,
          endpoint,
          tried: PARSER_ENDPOINTS,
        };
      }
      const message = await readErrorMessage(resp);
      errors.push({ endpoint, status: resp.status, message });
    } catch (error) {
      errors.push({
        endpoint,
        message: error instanceof Error ? error.message : "网络请求失败",
      });
    }
  }
  return {
    online: false,
    message: summarizeAttemptErrors(errors),
    tried: PARSER_ENDPOINTS,
  }
}

/* ── 指标匹配 ── */

export interface IndicatorMapping {
  systemId: string;
  systemLabel: string;
  categoryId: string;
  aliases: { alias: string; priority: number }[];
  units: string[];
  normalRange?: string;
}

export const DEFAULT_MAPPINGS: IndicatorMapping[] = [
  // 1. 血压
  { systemId: "blood_pressure_systolic", systemLabel: "收缩压", categoryId: "blood_pressure", aliases: [{ alias: "收缩压", priority: 10 }, { alias: "高压", priority: 8 }, { alias: "SBP", priority: 8 }], units: ["mmHg", "kPa"], normalRange: "90-140" },
  { systemId: "blood_pressure_diastolic", systemLabel: "舒张压", categoryId: "blood_pressure", aliases: [{ alias: "舒张压", priority: 10 }, { alias: "低压", priority: 8 }, { alias: "DBP", priority: 8 }], units: ["mmHg", "kPa"], normalRange: "60-90" },
  // 2. 血常规
  { systemId: "wbc", systemLabel: "白细胞", categoryId: "blood_routine", aliases: [{ alias: "白细胞", priority: 10 }, { alias: "白细胞计数", priority: 9 }, { alias: "WBC", priority: 9 }], units: ["×10^9/L"], normalRange: "3.5-9.5" },
  { systemId: "rbc", systemLabel: "红细胞", categoryId: "blood_routine", aliases: [{ alias: "红细胞", priority: 10 }, { alias: "红细胞计数", priority: 9 }, { alias: "RBC", priority: 9 }], units: ["×10^12/L"], normalRange: "4.3-5.8" },
  { systemId: "hemoglobin", systemLabel: "血红蛋白", categoryId: "blood_routine", aliases: [{ alias: "血红蛋白", priority: 10 }, { alias: "Hb", priority: 9 }, { alias: "HGB", priority: 9 }, { alias: "血色素", priority: 7 }], units: ["g/L", "g/dL"], normalRange: "130-175" },
  { systemId: "hematocrit", systemLabel: "红细胞压积", categoryId: "blood_routine", aliases: [{ alias: "红细胞压积", priority: 10 }, { alias: "HCT", priority: 9 }, { alias: "红细胞比容", priority: 8 }], units: ["%"], normalRange: "40-50" },
  { systemId: "platelet", systemLabel: "血小板", categoryId: "blood_routine", aliases: [{ alias: "血小板", priority: 10 }, { alias: "血小板计数", priority: 9 }, { alias: "PLT", priority: 9 }], units: ["×10^9/L"], normalRange: "125-350" },
  { systemId: "neutrophil_pct", systemLabel: "中性粒细胞百分比", categoryId: "blood_routine", aliases: [{ alias: "中性粒细胞百分比", priority: 10 }, { alias: "中性粒细胞%", priority: 9 }, { alias: "NEUT%", priority: 9 }], units: ["%"], normalRange: "40-75" },
  { systemId: "lymphocyte_pct", systemLabel: "淋巴细胞百分比", categoryId: "blood_routine", aliases: [{ alias: "淋巴细胞百分比", priority: 10 }, { alias: "淋巴细胞%", priority: 9 }, { alias: "LYM%", priority: 9 }], units: ["%"], normalRange: "20-50" },
  // 3. 血糖
  { systemId: "blood_glucose", systemLabel: "血糖", categoryId: "blood_glucose", aliases: [{ alias: "血糖", priority: 10 }, { alias: "GLU", priority: 8 }, { alias: "空腹血糖", priority: 9 }, { alias: "葡萄糖", priority: 7 }, { alias: "FBG", priority: 8 }], units: ["mmol/L", "mg/dL"], normalRange: "3.9-6.1" },
  { systemId: "hba1c", systemLabel: "糖化血红蛋白", categoryId: "blood_glucose", aliases: [{ alias: "糖化血红蛋白", priority: 10 }, { alias: "HbA1c", priority: 9 }], units: ["%"], normalRange: "4.0-6.0" },
  // 4. 血脂
  { systemId: "total_cholesterol", systemLabel: "总胆固醇", categoryId: "blood_lipids", aliases: [{ alias: "总胆固醇", priority: 10 }, { alias: "TC", priority: 9 }], units: ["mmol/L", "mg/dL"], normalRange: "2.8-5.2" },
  { systemId: "triglycerides", systemLabel: "甘油三酯", categoryId: "blood_lipids", aliases: [{ alias: "甘油三酯", priority: 10 }, { alias: "TG", priority: 9 }], units: ["mmol/L", "mg/dL"], normalRange: "0.56-1.7" },
  { systemId: "ldl_cholesterol", systemLabel: "LDL", categoryId: "blood_lipids", aliases: [{ alias: "LDL", priority: 10 }, { alias: "低密度脂蛋白", priority: 9 }, { alias: "低密度脂蛋白胆固醇", priority: 8 }], units: ["mmol/L", "mg/dL"], normalRange: "0-3.4" },
  { systemId: "hdl_cholesterol", systemLabel: "HDL", categoryId: "blood_lipids", aliases: [{ alias: "HDL", priority: 10 }, { alias: "高密度脂蛋白", priority: 9 }, { alias: "高密度脂蛋白胆固醇", priority: 8 }], units: ["mmol/L", "mg/dL"], normalRange: "1.0-1.6" },
  { systemId: "lipoprotein_a", systemLabel: "脂蛋白 a", categoryId: "blood_lipids", aliases: [{ alias: "脂蛋白 a", priority: 10 }, { alias: "脂蛋白 (a)", priority: 9 }, { alias: "Lp(a)", priority: 9 }], units: ["mg/L", "mg/dL"], normalRange: "0-300" },
  { systemId: "apolipoprotein_a1", systemLabel: "载脂蛋白 A1", categoryId: "blood_lipids", aliases: [{ alias: "载脂蛋白 A1", priority: 10 }, { alias: "ApoA1", priority: 9 }], units: ["g/L"], normalRange: "1.0-1.6" },
  { systemId: "apolipoprotein_b", systemLabel: "载脂蛋白 B", categoryId: "blood_lipids", aliases: [{ alias: "载脂蛋白 B", priority: 10 }, { alias: "ApoB", priority: 9 }], units: ["g/L"], normalRange: "0.6-1.1" },
  // 5. 肝功能
  { systemId: "alt", systemLabel: "谷丙转氨酶", categoryId: "liver_function", aliases: [{ alias: "谷丙转氨酶", priority: 10 }, { alias: "ALT", priority: 9 }], units: ["U/L"], normalRange: "0-40" },
  { systemId: "ast", systemLabel: "谷草转氨酶", categoryId: "liver_function", aliases: [{ alias: "谷草转氨酶", priority: 10 }, { alias: "AST", priority: 9 }], units: ["U/L"], normalRange: "0-40" },
  { systemId: "albumin", systemLabel: "白蛋白", categoryId: "liver_function", aliases: [{ alias: "白蛋白", priority: 10 }, { alias: "ALB", priority: 9 }], units: ["g/L"], normalRange: "40-55" },
  { systemId: "globulin", systemLabel: "球蛋白", categoryId: "liver_function", aliases: [{ alias: "球蛋白", priority: 10 }, { alias: "GLB", priority: 9 }], units: ["g/L"], normalRange: "20-40" },
  { systemId: "total_protein", systemLabel: "总蛋白", categoryId: "liver_function", aliases: [{ alias: "总蛋白", priority: 10 }, { alias: "TP", priority: 9 }], units: ["g/L"], normalRange: "65-85" },
  { systemId: "total_bilirubin", systemLabel: "总胆红素", categoryId: "liver_function", aliases: [{ alias: "总胆红素", priority: 10 }, { alias: "TBIL", priority: 9 }], units: ["μmol/L"], normalRange: "3.4-17.1" },
  { systemId: "direct_bilirubin", systemLabel: "直接胆红素", categoryId: "liver_function", aliases: [{ alias: "直接胆红素", priority: 10 }, { alias: "DBIL", priority: 9 }], units: ["μmol/L"], normalRange: "0-6.8" },
  { systemId: "ggt", systemLabel: "谷氨酰转肽酶", categoryId: "liver_function", aliases: [{ alias: "谷氨酰转肽酶", priority: 10 }, { alias: "GGT", priority: 9 }, { alias: "γ-GT", priority: 9 }], units: ["U/L"], normalRange: "0-50" },
  { systemId: "alp", systemLabel: "碱性磷酸酶", categoryId: "liver_function", aliases: [{ alias: "碱性磷酸酶", priority: 10 }, { alias: "ALP", priority: 9 }], units: ["U/L"], normalRange: "45-125" },
  // 6. 肾功能
  { systemId: "creatinine", systemLabel: "肌酐", categoryId: "kidney_function", aliases: [{ alias: "肌酐", priority: 10 }, { alias: "Cr", priority: 9 }, { alias: "CRE", priority: 8 }], units: ["μmol/L", "mg/dL"], normalRange: "44-133" },
  { systemId: "bun", systemLabel: "尿素氮", categoryId: "kidney_function", aliases: [{ alias: "尿素氮", priority: 10 }, { alias: "BUN", priority: 9 }], units: ["mmol/L", "mg/dL"], normalRange: "2.5-7.1" },
  { systemId: "uric_acid", systemLabel: "尿酸", categoryId: "kidney_function", aliases: [{ alias: "尿酸", priority: 10 }, { alias: "UA", priority: 9 }, { alias: "血尿酸", priority: 8 }], units: ["μmol/L", "mg/dL"], normalRange: "150-420" },
  { systemId: "cystatin_c", systemLabel: "胱抑素 C", categoryId: "kidney_function", aliases: [{ alias: "胱抑素 C", priority: 10 }, { alias: "CysC", priority: 9 }], units: ["mg/L"], normalRange: "0.51-1.09" },
  // 7. 甲状腺功能
  { systemId: "tsh", systemLabel: "促甲状腺激素", categoryId: "thyroid", aliases: [{ alias: "促甲状腺激素", priority: 10 }, { alias: "TSH", priority: 9 }], units: ["mIU/L"], normalRange: "0.27-4.2" },
  { systemId: "ft3", systemLabel: "游离 T3", categoryId: "thyroid", aliases: [{ alias: "游离 T3", priority: 10 }, { alias: "FT3", priority: 9 }], units: ["pmol/L"], normalRange: "3.1-6.8" },
  { systemId: "ft4", systemLabel: "游离 T4", categoryId: "thyroid", aliases: [{ alias: "游离 T4", priority: 10 }, { alias: "FT4", priority: 9 }], units: ["pmol/L"], normalRange: "12-22" },
  { systemId: "tt3", systemLabel: "总 T3", categoryId: "thyroid", aliases: [{ alias: "总 T3", priority: 10 }, { alias: "TT3", priority: 9 }], units: ["nmol/L"], normalRange: "1.3-3.1" },
  { systemId: "tt4", systemLabel: "总 T4", categoryId: "thyroid", aliases: [{ alias: "总 T4", priority: 10 }, { alias: "TT4", priority: 9 }], units: ["nmol/L"], normalRange: "66-181" },
  // 8. 心肌标志物
  { systemId: "ck", systemLabel: "肌酸激酶", categoryId: "cardiac", aliases: [{ alias: "肌酸激酶", priority: 10 }, { alias: "CK", priority: 9 }], units: ["U/L"], normalRange: "40-200" },
  { systemId: "ck_mb", systemLabel: "肌酸激酶同工酶", categoryId: "cardiac", aliases: [{ alias: "肌酸激酶同工酶", priority: 10 }, { alias: "CK-MB", priority: 9 }], units: ["U/L"], normalRange: "0-24" },
  // 9. 肿瘤标志物
  { systemId: "afp", systemLabel: "甲胎蛋白", categoryId: "tumor_markers", aliases: [{ alias: "甲胎蛋白", priority: 10 }, { alias: "AFP", priority: 9 }], units: ["ng/mL"], normalRange: "0-7" },
  { systemId: "cea", systemLabel: "癌胚抗原", categoryId: "tumor_markers", aliases: [{ alias: "癌胚抗原", priority: 10 }, { alias: "CEA", priority: 9 }], units: ["ng/mL"], normalRange: "0-5" },
  // 10. 电解质
  { systemId: "potassium", systemLabel: "钾", categoryId: "electrolytes", aliases: [{ alias: "钾", priority: 10 }, { alias: "K", priority: 9 }, { alias: "血钾", priority: 8 }], units: ["mmol/L"], normalRange: "3.5-5.3" },
  { systemId: "sodium", systemLabel: "钠", categoryId: "electrolytes", aliases: [{ alias: "钠", priority: 10 }, { alias: "Na", priority: 9 }, { alias: "血钠", priority: 8 }], units: ["mmol/L"], normalRange: "137-147" },
  { systemId: "chloride", systemLabel: "氯", categoryId: "electrolytes", aliases: [{ alias: "氯", priority: 10 }, { alias: "Cl", priority: 9 }], units: ["mmol/L"], normalRange: "99-110" },
  { systemId: "calcium", systemLabel: "钙", categoryId: "electrolytes", aliases: [{ alias: "钙", priority: 10 }, { alias: "Ca", priority: 9 }], units: ["mmol/L"], normalRange: "2.11-2.52" },
  // 11. 炎症指标
  { systemId: "hscrp", systemLabel: "超敏 C 反应蛋白", categoryId: "inflammation", aliases: [{ alias: "超敏 C 反应蛋白", priority: 10 }, { alias: "hs-CRP", priority: 9 }], units: ["mg/L"], normalRange: "0-3" },
  { systemId: "crp", systemLabel: "C 反应蛋白", categoryId: "inflammation", aliases: [{ alias: "C 反应蛋白", priority: 10 }, { alias: "CRP", priority: 9 }], units: ["mg/L"], normalRange: "0-8" },
  { systemId: "homocysteine", systemLabel: "同型半胱氨酸", categoryId: "inflammation", aliases: [{ alias: "同型半胱氨酸", priority: 10 }, { alias: "HCY", priority: 9 }], units: ["μmol/L"], normalRange: "5-15" },
  // 12. 身体指标
  { systemId: "weight", systemLabel: "体重", categoryId: "body_metrics", aliases: [{ alias: "体重", priority: 10 }, { alias: "WT", priority: 8 }], units: ["kg", "斤"], normalRange: "" },
  { systemId: "bmi", systemLabel: "BMI", categoryId: "body_metrics", aliases: [{ alias: "BMI", priority: 10 }, { alias: "体质指数", priority: 9 }], units: ["kg/m²"], normalRange: "18.5-24.9" },
  { systemId: "heart_rate", systemLabel: "心率", categoryId: "body_metrics", aliases: [{ alias: "心率", priority: 10 }, { alias: "HR", priority: 9 }, { alias: "脉搏", priority: 7 }], units: ["bpm", "次/分"], normalRange: "60-100" },
  // 13. 凝血功能
  { systemId: "pt", systemLabel: "凝血酶原时间", categoryId: "coagulation", aliases: [{ alias: "凝血酶原时间", priority: 10 }, { alias: "PT", priority: 9 }], units: ["秒"], normalRange: "11-14" },
  { systemId: "aptt", systemLabel: "活化部分凝血活酶时间", categoryId: "coagulation", aliases: [{ alias: "活化部分凝血活酶时间", priority: 10 }, { alias: "APTT", priority: 9 }], units: ["秒"], normalRange: "25-37" },
];

export interface UserIndicatorItem {
  id: string;
  label: string;
  unit?: string;
  code?: string;
  referenceRange?: string;
  aliases?: string[];
}

export interface UserIndicatorCategory {
  id: string;
  name: string;
  code?: string;
  items: UserIndicatorItem[];
}

const DEFAULT_CATEGORY_LABELS: Record<string, string> = {
  blood_pressure: "血压",
  blood_routine: "血常规",
  blood_glucose: "血糖",
  blood_lipids: "血脂",
  liver_function: "肝功能",
  kidney_function: "肾功能",
  thyroid: "甲状腺功能",
  cardiac: "心肌标志物",
  tumor_markers: "肿瘤标志物",
  electrolytes: "电解质",
  inflammation: "炎症指标",
  body_metrics: "身体指标",
  coagulation: "凝血功能",
};

const normalizeIndicatorText = (value: string): string =>
  value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[%％]/g, "%")
    .replace(/[·•]/g, "")
    .replace(/[\s_：:()（）[\]【】{}<>《》,，、;；/\\|+\-.]/g, "");

const normalizeUnit = (value: string): string =>
  value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[µμ]/g, "u")
    .replace(/[×*]/g, "x")
    .replace(/／/g, "/")
    .replace(/\s+/g, "");

const collectIndicatorTokens = (...values: Array<string | undefined>): string[] => {
  const tokens = new Set<string>();
  const add = (text?: string) => {
    if (!text) {
      return;
    }
    const normalized = normalizeIndicatorText(text);
    if (normalized) {
      tokens.add(normalized);
    }
  };

  for (const value of values) {
    if (!value) {
      continue;
    }
    add(value);

    const bracketMatches = value.matchAll(/[（(]([^（）()]+)[）)]/g);
    for (const match of bracketMatches) {
      add(match[1]);
    }

    add(value.replace(/[（(][^（）()]+[）)]/g, " "));
    value.split(/[,\s，、;；/\\|]+/).forEach(add);
  }
  return Array.from(tokens);
};

const mappingAliasValues = (mapping: IndicatorMapping): string[] => [
  mapping.systemId,
  mapping.systemLabel,
  ...mapping.aliases.map(item => item.alias),
];

const bestTokenScore = (rawTokens: string[], candidateTokens: string[]) => {
  let best = { score: 0, matchType: "none" as "exact" | "fuzzy" | "none", similarity: undefined as number | undefined };

  for (const raw of rawTokens) {
    for (const candidate of candidateTokens) {
      if (!raw || !candidate) {
        continue;
      }
      if (raw === candidate) {
        return { score: 1, matchType: "exact" as const, similarity: 1 };
      }

      const minLength = Math.min(raw.length, candidate.length);
      const maxLength = Math.max(raw.length, candidate.length);
      if (minLength >= 2 && (raw.includes(candidate) || candidate.includes(raw))) {
        const score = Math.max(0.88, minLength / maxLength);
        if (score > best.score) {
          best = { score, matchType: "fuzzy", similarity: score };
        }
        continue;
      }

      if (minLength <= 2) {
        continue;
      }

      const score = similarity(raw, candidate);
      if (score > best.score && score > 0.82) {
        best = { score, matchType: "fuzzy", similarity: score };
      }
    }
  }

  return best;
};

const unitCompatibilityScore = (observedUnit: string, candidateUnits: string[]) => {
  const observed = normalizeUnit(observedUnit);
  const normalizedCandidates = candidateUnits.map(normalizeUnit).filter(Boolean);
  if (!observed || normalizedCandidates.length === 0) {
    return 0;
  }
  if (normalizedCandidates.some(unit => unit === observed)) {
    return 0.04;
  }
  return -0.02;
};

const mappingsRelatedToUserItem = (item: UserIndicatorItem, mappings: IndicatorMapping[]): IndicatorMapping[] => {
  const itemTokens = collectIndicatorTokens(item.id, item.label, item.code, ...(item.aliases || []));
  return mappings.filter(mapping => {
    const mappingTokens = collectIndicatorTokens(...mappingAliasValues(mapping));
    return bestTokenScore(itemTokens, mappingTokens).score >= 0.88;
  });
};

const categoryMatchesMapping = (category: UserIndicatorCategory, categoryId: string): boolean => {
  const defaultName = DEFAULT_CATEGORY_LABELS[categoryId];
  const categoryTokens = collectIndicatorTokens(category.id, category.name, category.code);
  const targetTokens = collectIndicatorTokens(categoryId, defaultName);
  return bestTokenScore(categoryTokens, targetTokens).score >= 0.88;
};

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0));
  return dp[m][n];
}

function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

export function matchIndicator(rawLabel: string, mappings: IndicatorMapping[] = DEFAULT_MAPPINGS): Omit<MatchedIndicator, 'value' | 'unit' | 'referenceRange' | 'pageIndex' | 'rawLabel' | 'confidence'> {
  const rawTokens = collectIndicatorTokens(rawLabel);
  let best = 0, result: ReturnType<typeof matchIndicator> = { matchType: 'none' };

  for (const m of mappings) {
    const score = bestTokenScore(rawTokens, collectIndicatorTokens(...mappingAliasValues(m)));
    if (score.matchType === 'exact') {
      return { systemId: m.systemId, systemLabel: m.systemLabel, categoryId: m.categoryId, matchType: 'exact' };
    }
    if (score.score > best) {
      best = score.score;
      result = {
        systemId: m.systemId,
        systemLabel: m.systemLabel,
        categoryId: m.categoryId,
        matchType: 'fuzzy',
        similarity: score.similarity,
      };
    }
  }

  return best > 0.82 ? result : { matchType: 'none' };
}

export function calcConfidence(match: { matchType: string; similarity?: number }, value: number): { level: 'high' | 'medium' | 'low'; score: number; reasons: string[] } {
  const w: Record<string, number> = { exact: 1.0, fuzzy: 0.85, none: 0 };
  let score = match.matchType === 'fuzzy' ? (match.similarity ?? 0.85) : (w[match.matchType] ?? 0);
  const reasons = [`匹配: ${match.matchType}`];
  if (value <= 0) { score *= 0.5; reasons.push('数值异常'); }
  return { level: score >= 0.85 ? 'high' : score >= 0.6 ? 'medium' : 'low', score, reasons };
}

export function matchAllIndicators(indicators: ExtractedIndicator[]): MatchedIndicator[] {
  return indicators.map(ind => {
    const m = matchIndicator(ind.rawLabel);
    return { ...ind, ...m, confidence: calcConfidence(m, ind.value) };
  });
}

/* ── 从 PaddleOCR 表格数据提取指标 ── */

export function extractIndicatorsFromTables(tables: ParsedTable[]): ExtractedIndicator[] {
  const results: ExtractedIndicator[] = [];
  for (const table of tables) {
    const cells = table.cells;
    if (cells.length < 4) continue;
    const headers = cells.filter(c => c.row === 0).map(c => c.text.toLowerCase());
    const nameIdx = headers.findIndex(h => h.includes('项目') || h.includes('指标') || h.includes('名称'));
    const valueIdx = headers.findIndex(h => h.includes('结果') || h.includes('值'));
    const unitIdx = headers.findIndex(h => h.includes('单位'));
    const refIdx = headers.findIndex(h => h.includes('参考'));
    const maxRow = Math.max(...cells.map(c => c.row));
    for (let row = 1; row <= maxRow; row++) {
      const rc = cells.filter(c => c.row === row);
      const get = (idx: number) => rc.find(c => c.col === idx)?.text;
      const label = get(nameIdx ?? 0)?.trim();
      const valStr = get(valueIdx ?? 1)?.trim();
      if (!label || !valStr) continue;
      const val = parseFloat(valStr);
      if (isNaN(val)) continue;
      results.push({ rawLabel: label, value: val, unit: get(unitIdx ?? 2)?.trim() || '', referenceRange: get(refIdx ?? 3), pageIndex: table.pageIndex });
    }
  }
  return results;
}

/* ── 日期提取 ── */

export function extractDate(text: string): string | null {
  for (const p of [/(\d{4})-(\d{1,2})-(\d{1,2})/, /(\d{4})\/(\d{1,2})\/(\d{1,2})/, /(\d{4})年(\d{1,2})月(\d{1,2})日/]) {
    const m = text.match(p);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return null;
}

/* ── 用户分类映射 ── */

export interface ResolvedIndicator {
  rawLabel: string;
  value: number;
  unit: string;
  referenceRange?: string;
  pageIndex: number;
  // 匹配结果
  systemId?: string;
  systemLabel?: string;
  categoryId?: string;
  matchType: 'exact' | 'fuzzy' | 'none';
  similarity?: number;
  confidence: { level: 'high' | 'medium' | 'low'; score: number; reasons: string[] };
  // 用户分类映射
  userItemFound: boolean;      // 用户是否已有该指标项
  userItemId?: string;          // 用户已有指标项的 ID
  userCategoryId?: string;      // 用户已有分类的 ID
  action: 'import' | 'create_category' | 'create_item' | 'unnamed';
}

const matchUserIndicator = (
  indicator: ExtractedIndicator,
  userCategories: UserIndicatorCategory[],
  mappings: IndicatorMapping[],
) => {
  const rawTokens = collectIndicatorTokens(indicator.rawLabel);
  let best:
    | {
        category: UserIndicatorCategory;
        item: UserIndicatorItem;
        score: number;
        matchType: 'exact' | 'fuzzy';
        similarity?: number;
      }
    | null = null;

  for (const category of userCategories) {
    for (const item of category.items) {
      const relatedMappings = mappingsRelatedToUserItem(item, mappings);
      const candidateTokens = collectIndicatorTokens(
        item.id,
        item.label,
        item.code,
        ...(item.aliases || []),
        ...relatedMappings.flatMap(mappingAliasValues),
      );
      const labelScore = bestTokenScore(rawTokens, candidateTokens);
      if (labelScore.score === 0) {
        continue;
      }

      const unitScore = unitCompatibilityScore(
        indicator.unit,
        [item.unit, ...relatedMappings.flatMap(mapping => mapping.units)].filter(Boolean) as string[],
      );
      const score = Math.min(1, labelScore.score + unitScore);
      if (!best || score > best.score) {
        best = {
          category,
          item,
          score,
          matchType: labelScore.matchType === 'exact' ? 'exact' : 'fuzzy',
          similarity: labelScore.similarity,
        };
      }
    }
  }

  return best && best.score >= 0.82 ? best : null;
};

/**
 * 核心函数：将提取的指标与用户现有分类体系进行映射
 */
export function resolveIndicators(
  extracted: ExtractedIndicator[],
  userCategories: UserIndicatorCategory[],
  mappings: IndicatorMapping[] = DEFAULT_MAPPINGS
): ResolvedIndicator[] {
  return extracted.map(ind => {
    // 第一步：先匹配用户维护的指标库，用户库命中才允许直接导入。
    const userMatch = matchUserIndicator(ind, userCategories, mappings);
    if (userMatch) {
      const confidence = calcConfidence(
        { matchType: userMatch.matchType, similarity: userMatch.similarity },
        ind.value,
      );
      return {
        ...ind,
        systemId: userMatch.item.id,
        systemLabel: userMatch.item.label,
        categoryId: userMatch.category.id,
        matchType: userMatch.matchType,
        similarity: userMatch.similarity,
        confidence: {
          ...confidence,
          score: userMatch.score,
          level: userMatch.score >= 0.85 ? 'high' : userMatch.score >= 0.6 ? 'medium' : 'low',
          reasons: ['用户指标库命中', ...confidence.reasons],
        },
        userItemFound: true,
        userItemId: userMatch.item.id,
        userCategoryId: userMatch.category.id,
        action: 'import' as const,
      };
    }

    // 第二步：用户库没有该指标，用标准词典做候选建议，但不直接导入。
    const match = matchIndicator(ind.rawLabel, mappings);
    const baseConfidence = calcConfidence(match, ind.value);
    const confidence = {
      ...baseConfidence,
      reasons: ['未命中用户指标库，以下仅为标准词典建议', ...baseConfidence.reasons],
    };

    if (match.systemId) {
      const existingCat = userCategories.find(c => categoryMatchesMapping(c, match.categoryId || ""));
      if (existingCat) {
        return {
          ...ind,
          systemId: match.systemId,
          systemLabel: match.systemLabel,
          categoryId: existingCat.id,
          matchType: match.matchType,
          similarity: match.similarity,
          confidence,
          userItemFound: false,
          action: 'create_item' as const,
        };
      } else {
        // 用户没有该分类 → 建议创建新分类
        return {
          ...ind,
          systemId: match.systemId,
          systemLabel: match.systemLabel,
          categoryId: match.categoryId,
          matchType: match.matchType,
          similarity: match.similarity,
          confidence,
          userItemFound: false,
          action: 'create_category' as const,
        };
      }
    }

    // 第三步：词典也没匹配 → 归入"未命名"，让用户选择
    return {
      ...ind,
      matchType: 'none' as const,
      confidence: { level: 'low' as const, score: 0, reasons: ['未命中用户指标库，也未命中标准词典'] },
      userItemFound: false,
      action: 'unnamed' as const,
    };
  });
}

/** 按 action 分组统计 */
export function groupByAction(resolved: ResolvedIndicator[]) {
  return {
    import: resolved.filter(r => r.action === 'import'),
    createCategory: resolved.filter(r => r.action === 'create_category'),
    createItem: resolved.filter(r => r.action === 'create_item'),
    unnamed: resolved.filter(r => r.action === 'unnamed'),
  };
}

/** 获取需要创建新分类的指标分组 */
export function getCategoriesToCreate(resolved: ResolvedIndicator[]): { categoryId: string; categoryName: string; indicators: ResolvedIndicator[] }[] {
  const map = new Map<string, ResolvedIndicator[]>();
  for (const r of resolved) {
    if (r.action === 'create_category' && r.categoryId && r.systemLabel) {
      if (!map.has(r.categoryId)) map.set(r.categoryId, []);
      map.get(r.categoryId)!.push(r);
    }
  }
  return Array.from(map.entries()).map(([catId, indicators]) => ({
    categoryId: catId,
    categoryName: DEFAULT_CATEGORY_LABELS[catId] || catId,
    indicators,
  }));
}
