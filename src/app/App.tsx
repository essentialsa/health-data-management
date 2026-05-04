import { useState, useEffect, type FormEvent, type ChangeEvent } from "react";
import { AddRecordDialog, HealthRecord, IndicatorCategory, IndicatorItem } from "@/app/components/AddRecordDialog";
import { RecordTable } from "@/app/components/RecordTable";
import { RecordChart } from "@/app/components/RecordChart";
import { ImportRecordsDialog } from "@/app/components/ImportRecordsDialog";
import { MedicalReportImportDialog } from "@/app/components/MedicalReportImportDialog";
import { ExportDialog } from "@/app/components/ExportDialog";
import { ConsultationBriefDialog } from "@/app/components/ConsultationBriefDialog";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import {
  Download,
  Activity,
  TrendingUp,
  Calendar,
  Database,
  Settings2,
  Trash2,
  RotateCcw,
  History,
  Cloud,
  CloudUpload,
  HardDrive,
  Loader2,
  Lock,
  Unlock,
  ShieldCheck,
  UserCog,
  User,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  CloudDownload,
} from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { cn } from "@/app/components/ui/utils";
import * as XLSX from "xlsx";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

const STORAGE_VERSION = "v1";
const STORAGE_KEY = `health_records_${STORAGE_VERSION}`;
const INDICATOR_STORAGE_KEY = `health_indicator_categories_${STORAGE_VERSION}`;
const CHART_VIEW_STORAGE_KEY = `health_chart_view_${STORAGE_VERSION}`;
const DELETE_LOG_STORAGE_KEY = `health_delete_logs_${STORAGE_VERSION}`;
const CHANGE_LOG_STORAGE_KEY = `health_change_logs_${STORAGE_VERSION}`;
const INDICATOR_CHANGE_LOG_STORAGE_KEY = `health_indicator_change_logs_${STORAGE_VERSION}`;
const AUTH_CONFIG_STORAGE_KEY = `health_auth_config_${STORAGE_VERSION}`;
const LAST_ACTIVE_USER_KEY = `health_last_active_user_${STORAGE_VERSION}`;

// Encryption helper (Simple XOR for demo purposes, in production use Web Crypto API)
const XOR_KEY = "health-data-secure-key";
const encryptData = (data: string): string => {
  try {
    let result = "";
    for (let i = 0; i < data.length; i++) {
      result += String.fromCharCode(data.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
    }
    return btoa(result);
  } catch (e) {
    console.error("Encryption failed", e);
    return "";
  }
};

const decryptData = (cipher: string): string => {
  try {
    const data = atob(cipher);
    let result = "";
    for (let i = 0; i < data.length; i++) {
      result += String.fromCharCode(data.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
    }
    return result;
  } catch (e) {
    console.error("Decryption failed", e);
    return "";
  }
};

const isStrongPassword = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.length < 8) {
    return false;
  }
  const hasLower = /[a-z]/.test(trimmed);
  const hasUpper = /[A-Z]/.test(trimmed);
  const hasNumber = /\d/.test(trimmed);
  const hasSymbol = /[^A-Za-z0-9]/.test(trimmed);
  return hasLower && hasUpper && hasNumber && hasSymbol;
};

const strongPasswordHint = "密码至少 8 位，包含大小写字母、数字和符号。";

// Types for Authorization
interface CloudProviderPermissions {
  canUpload: boolean;
  canOverwrite: boolean;
  canDelete: boolean;
}

interface CloudProviderAuth {
  accountName?: string;
  accessToken?: string;
  expiresAt?: string;
  refreshToken?: string;
  rootFolderId?: string;
  dataFileId?: string;
  permissions: CloudProviderPermissions;
  lastVerified?: string;
  tokenInvalid?: boolean;
  lastErrorMessage?: string;
}

interface CloudAuthConfig {
  googleDrive?: CloudProviderAuth;
  adminPin?: string;
}

const GOOGLE_DRIVE_OAUTH_SCOPE =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly";
const GOOGLE_DRIVE_OAUTH_VERIFIER_KEY = "health_google_oauth_verifier_v1";
const GOOGLE_DRIVE_OAUTH_STATE_KEY = "health_google_oauth_state_v1";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabaseClient: SupabaseClient | null = null;

const getSupabaseProjectRef = () => {
  if (!SUPABASE_URL) {
    return null;
  }
  try {
    const url = new URL(SUPABASE_URL);
    const projectRef = url.hostname.split(".")[0];
    return projectRef || null;
  } catch {
    return null;
  }
};

const clearSupabaseAuthStorage = () => {
  if (typeof window === "undefined") {
    return;
  }
  const projectRef = getSupabaseProjectRef();
  const prefix = projectRef ? `sb-${projectRef}-` : null;
  const clearStorage = (storage: Storage) => {
    try {
      for (let i = storage.length - 1; i >= 0; i -= 1) {
        const key = storage.key(i);
        if (!key) {
          continue;
        }
        if (prefix && key.startsWith(prefix)) {
          storage.removeItem(key);
          continue;
        }
        if (key === "supabase.auth.token") {
          storage.removeItem(key);
        }
      }
    } catch {
      // ignore storage errors
    }
  };
  clearStorage(window.localStorage);
  clearStorage(window.sessionStorage);
};

const buildUserStorageKey = (baseKey: string, userId: string | null) => {
  if (!userId) {
    return baseKey;
  }
  return `${baseKey}__${userId}`;
};

const getSupabaseClient = () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
};

interface LoginPageProps {
  onLogin: (email: string, password: string) => void | Promise<void>;
  onSignUp: (email: string, password: string) => boolean | Promise<boolean>;
  onResetPassword: (email: string) => void | Promise<void>;
  onOAuthLogin: (provider: "google" | "github") => void | Promise<void>;
  errorMessage?: string | null;
}

function LoginPage({ onLogin, onSignUp, onResetPassword, onOAuthLogin, errorMessage }: LoginPageProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      alert("请输入邮箱和密码。");
      return;
    }
    try {
      setSubmitting(true);
      if (mode === "login") {
        console.log("[AuthUI] email login submit", {
          mode,
          email,
        });
        await onLogin(email, password);
      } else {
        console.log("[AuthUI] email signup submit", {
          mode,
          email,
        });
        const ok = await onSignUp(email, password);
        if (ok) {
          setMode("login");
          setPassword("");
        }
      }
    } finally {
      setSubmitting(false);
    }
  };
  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetEmail) {
      alert("请输入需要重置密码的邮箱。");
      return;
    }
    console.log("[AuthUI] reset password submit", {
      email: resetEmail,
    });
    await onResetPassword(resetEmail);
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-100 via-blue-50 to-pink-50 px-4">
      <div className="w-full max-w-md space-y-4">
        {errorMessage && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm px-4 py-3 rounded-xl shadow-sm shadow-red-50">
            {errorMessage}
          </div>
        )}
        <Card className="w-full bg-white/80 backdrop-blur-xl border-0 shadow-2xl shadow-violet-100">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-blue-500 text-white">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-2xl bg-gradient-to-r from-violet-600 via-blue-600 to-pink-600 bg-clip-text text-transparent">
                  体检数据管理
                </CardTitle>
                <CardDescription className="text-gray-600">登录后安全访问您的健康数据</CardDescription>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                type="button"
                variant={mode === "login" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setMode("login")}
              >
                登录
              </Button>
              <Button
                type="button"
                variant={mode === "signup" ? "default" : "outline"}
                className="flex-1"
                onClick={() => setMode("signup")}
              >
                注册
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">密码</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  placeholder={strongPasswordHint}
                />
              </div>
              <Button
                type="submit"
                className="w-full gap-2 bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    处理中...
                  </>
                ) : mode === "login" ? (
                  "登录"
                ) : (
                  "注册"
                )}
              </Button>
            </form>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
                <span className="text-xs text-gray-400">或使用第三方账号</span>
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-gray-200 to-transparent" />
              </div>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => {
                    console.log("[AuthUI] click oauth button", {
                      provider: "google",
                    });
                    void onOAuthLogin("google");
                  }}
                >
                  <Cloud className="w-4 h-4" />
                  Google
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => {
                    console.log("[AuthUI] click oauth button", {
                      provider: "github",
                    });
                    void onOAuthLogin("github");
                  }}
                >
                  <Cloud className="w-4 h-4" />
                  GitHub
                </Button>
              </div>
            </div>
            <form onSubmit={handleReset} className="space-y-3">
              <Label htmlFor="resetEmail">忘记密码？输入邮箱获取重置链接</Label>
              <div className="flex gap-2">
                <Input
                  id="resetEmail"
                  type="email"
                  value={resetEmail}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setResetEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                <Button type="submit" variant="outline">
                  发送
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const generateRandomString = (length: number): string => {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const result: string[] = [];
  const cryptoObj = typeof window !== "undefined" ? window.crypto || (window as any).msCrypto : undefined;
  if (cryptoObj && cryptoObj.getRandomValues) {
    const bytes = new Uint8Array(length);
    cryptoObj.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      result.push(charset[bytes[i] % charset.length]);
    }
  } else {
    for (let i = 0; i < length; i++) {
      const index = Math.floor(Math.random() * charset.length);
      result.push(charset[index]);
    }
  }
  return result.join("");
};

const createGoogleOAuthState = () => {
  return `googleDrive_${generateRandomString(24)}`;
};

const createGooglePkceVerifier = () => {
  return generateRandomString(64);
};

// Old keys for migration
const LEGACY_STORAGE_KEY = "health_records";
const LEGACY_INDICATOR_STORAGE_KEY = "health_indicator_categories";
const LEGACY_CHANGE_LOG_STORAGE_KEY = "health_change_logs";

const createLogId = () => `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const parseAliasText = (value?: string): string[] =>
  (value || "")
    .split(/[,，、;；\n]+/)
    .map(item => item.trim())
    .filter(Boolean);

const formatAliasText = (aliases?: string[]): string => (aliases || []).join("、");

const DEFAULT_INDICATOR_CATEGORIES: IndicatorCategory[] = [
  {
    id: "bloodPressure",
    name: "血压",
    items: [
      { id: "bloodPressureHigh", label: "收缩压 (高压)", unit: "mmHg" },
      { id: "bloodPressureLow", label: "舒张压 (低压)", unit: "mmHg" },
    ],
  },
  {
    id: "bloodSugar",
    name: "血糖",
    items: [
      { id: "bloodSugar", label: "血糖", unit: "mmol/L" },
    ],
  },
  {
    id: "cholesterolPanel",
    name: "血脂",
    items: [
      { id: "cholesterol", label: "总胆固醇", unit: "mmol/L" },
      { id: "triglycerides", label: "甘油三酯", unit: "mmol/L" },
      { id: "ldl", label: "低密度脂蛋白", unit: "mmol/L" },
      { id: "hdl", label: "高密度脂蛋白", unit: "mmol/L" },
    ],
  },
  {
    id: "liverFunction",
    name: "肝功能",
    items: [
      { id: "alt", label: "谷丙转氨酶", unit: "U/L" },
      { id: "ast", label: "谷草转氨酶", unit: "U/L" },
    ],
  },
  {
    id: "renalFunction",
    name: "肾功能",
    items: [
      { id: "creatinine", label: "肌酐", unit: "µmol/L" },
      { id: "bun", label: "尿素氮", unit: "mmol/L" },
    ],
  },
  {
    id: "weight",
    name: "体重",
    items: [
      { id: "weight", label: "体重", unit: "kg" },
    ],
  },
  {
    id: "bmi",
    name: "BMI",
    items: [
      { id: "bmi", label: "BMI", unit: "" },
    ],
  },
  {
    id: "heartRate",
    name: "心率",
    items: [
      { id: "heartRate", label: "心率", unit: "次/分" },
    ],
  },
];

interface RecordChangeLogEntry {
  id: string;
  timestamp: string;
  type: "create" | "update" | "delete" | "clear";
  recordId: string | null;
  before: HealthRecord | null;
  after: HealthRecord | null;
}

type IndicatorChangeTarget = "category" | "item";

type IndicatorChangeAction = "create" | "update" | "delete";

interface IndicatorChangeLogEntry {
  id: string;
  timestamp: string;
  target: IndicatorChangeTarget;
  action: IndicatorChangeAction;
  categoryId: string;
  itemId?: string | null;
  before: IndicatorCategory | IndicatorItem | null;
  after: IndicatorCategory | IndicatorItem | null;
}

interface IndicatorMaintenanceDialogProps {
  categories: IndicatorCategory[];
  onChangeCategories: (categories: IndicatorCategory[]) => void;
  usedIndicatorIds: Set<string>;
  indicatorChangeLogs: IndicatorChangeLogEntry[];
  onChangeIndicatorLogs: (logs: IndicatorChangeLogEntry[]) => void;
  triggerClassName?: string;
}

function IndicatorMaintenanceDialog({
  categories,
  onChangeCategories,
  usedIndicatorIds,
  indicatorChangeLogs,
  onChangeIndicatorLogs,
  triggerClassName,
}: IndicatorMaintenanceDialogProps) {
  const [open, setOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [categoryEnabled, setCategoryEnabled] = useState(true);
  const [items, setItems] = useState<
    Array<{
      id: string;
      name: string;
      unit: string;
      code?: string;
      referenceRange?: string;
      aliases?: string;
      dataType?: "number" | "text" | "boolean";
      enabled?: boolean;
    }>
  >([{ id: "item-1", name: "", unit: "" }]);

  const resetForm = () => {
    setEditingCategoryId(null);
    setCategoryName("");
    setCategoryCode("");
    setCategoryEnabled(true);
    setItems([{ id: "item-1", name: "", unit: "" }]);
  };

  const appendIndicatorLog = (entry: IndicatorChangeLogEntry) => {
    onChangeIndicatorLogs([...indicatorChangeLogs, entry]);
  };

  const loadCategory = (category: IndicatorCategory) => {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryCode(category.code || "");
    setCategoryEnabled(category.enabled !== false);
    setItems(
      category.items.map(item => ({
        id: item.id,
        name: item.label,
        unit: item.unit,
        code: item.code,
        referenceRange: item.referenceRange,
        aliases: formatAliasText(item.aliases),
        dataType: item.dataType || "number",
        enabled: item.enabled !== false,
      })),
    );
  };

  const handleAddRow = () => {
    setItems((prev) => [
      ...prev,
      { id: `item-${prev.length + 1}`, name: "", unit: "" },
    ]);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const trimmedName = categoryName.trim();
    if (!trimmedName) {
      alert("请填写检验指标种类名称。");
      return;
    }

    const trimmedCode = categoryCode.trim();

    const validItems = items
      .map(item => ({
        ...item,
        name: item.name.trim(),
        unit: item.unit.trim(),
        aliases: item.aliases?.trim(),
      }))
      .filter(item => item.name !== "");

    if (validItems.length === 0) {
      alert("请至少添加一个具体检验项目，并填写项目名称。");
      return;
    }

    const now = new Date().toISOString();
    const isUpdate = !!editingCategoryId;

    const existingCategoryCodes = categories
      .filter(c => !editingCategoryId || c.id !== editingCategoryId)
      .map(c => (c.code || "").trim())
      .filter(code => code !== "");

    if (trimmedCode && existingCategoryCodes.includes(trimmedCode)) {
      alert("指标种类编码已存在，请使用唯一编码。");
      return;
    }

    const timestamp = Date.now().toString();
    const baseId = editingCategoryId || `custom_${timestamp}`;

    const nextItems: IndicatorItem[] = validItems.map((item, index) => {
      const existing = categories
        .find(c => c.id === baseId)
        ?.items.find(i => i.id === item.id);
      const id = existing ? existing.id : `custom_${timestamp}_${index}`;
      return {
        id,
        label: item.name,
        unit: item.unit,
        code: item.code?.trim() || undefined,
        referenceRange: item.referenceRange?.trim() || undefined,
        aliases: parseAliasText(item.aliases).length > 0 ? parseAliasText(item.aliases) : undefined,
        dataType: item.dataType || "number",
        enabled: item.enabled !== false,
        order: index,
      };
    });

    const prevCategory = categories.find(c => c.id === baseId) || null;
    const nextCategory: IndicatorCategory = {
      id: baseId,
      name: trimmedName,
      code: trimmedCode || undefined,
      enabled: categoryEnabled,
      order: prevCategory?.order,
      items: nextItems,
    };

    let nextCategories: IndicatorCategory[];
    if (isUpdate) {
      nextCategories = categories.map(c => (c.id === baseId ? nextCategory : c));
    } else {
      nextCategory.order = categories.length;
      nextCategories = [...categories, nextCategory];
    }

    onChangeCategories(nextCategories);

    const logsToAppend: IndicatorChangeLogEntry[] = [];

    const categoryLog: IndicatorChangeLogEntry = {
      id: createLogId(),
      timestamp: now,
      target: "category",
      action: isUpdate ? "update" : "create",
      categoryId: nextCategory.id,
      itemId: null,
      before: prevCategory,
      after: nextCategory,
    };
    logsToAppend.push(categoryLog);

    if (prevCategory && isUpdate) {
      const prevMap = new Map<string, IndicatorItem>();
      prevCategory.items.forEach(item => {
        prevMap.set(item.id, item);
      });
      const nextMap = new Map<string, IndicatorItem>();
      nextItems.forEach(item => {
        nextMap.set(item.id, item);
      });

      nextItems.forEach(item => {
        if (!prevMap.has(item.id)) {
          logsToAppend.push({
            id: createLogId(),
            timestamp: now,
            target: "item",
            action: "create",
            categoryId: nextCategory.id,
            itemId: item.id,
            before: null,
            after: item,
          });
        }
      });

      prevCategory.items.forEach((prevItem) => {
        if (!nextMap.has(prevItem.id)) {
          logsToAppend.push({
            id: createLogId(),
            timestamp: now,
            target: "item",
            action: "delete",
            categoryId: nextCategory.id,
            itemId: prevItem.id,
            before: prevItem,
            after: null,
          });
        }
      });

      prevCategory.items.forEach((prevItem: IndicatorItem) => {
        const nextItem = nextMap.get(prevItem.id);
        if (!nextItem) {
          return;
        }
        const changed =
          prevItem.label !== nextItem.label ||
          prevItem.unit !== nextItem.unit ||
          (prevItem.code || "") !== (nextItem.code || "") ||
          (prevItem.referenceRange || "") !== (nextItem.referenceRange || "") ||
          formatAliasText(prevItem.aliases) !== formatAliasText(nextItem.aliases) ||
          (prevItem.dataType || "number") !== (nextItem.dataType || "number") ||
          (prevItem.enabled !== nextItem.enabled) ||
          (prevItem.order ?? 0) !== (nextItem.order ?? 0);
        if (changed) {
          logsToAppend.push({
            id: createLogId(),
            timestamp: now,
            target: "item",
            action: "update",
            categoryId: nextCategory.id,
            itemId: prevItem.id,
            before: prevItem,
            after: nextItem,
          });
        }
      });
    } else {
      nextItems.forEach(item => {
        logsToAppend.push({
          id: createLogId(),
          timestamp: now,
          target: "item",
          action: "create",
          categoryId: nextCategory.id,
          itemId: item.id,
          before: null,
          after: item,
        });
      });
    }

    if (logsToAppend.length > 0) {
      onChangeIndicatorLogs([...indicatorChangeLogs, ...logsToAppend]);
    }

    alert("检验指标分类已保存。");

    resetForm();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next);
        if (!next) {
          resetForm();
        } else if (categories[0]) {
          loadCategory(categories[0]);
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
          <Settings2 className="w-4 h-4" />
          检验指标维护
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[780px] max-h-[80vh] bg-white/95 backdrop-blur-xl border-0 shadow-2xl flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">
            检验指标维护
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-4 h-full">
          <div className="flex-1 overflow-hidden">
            <Tabs defaultValue="category" className="h-full flex flex-col">
              <TabsList className="grid grid-cols-2 w-full mb-3 bg-violet-50/60 border border-violet-100 rounded-xl">
                <TabsTrigger value="category" className="text-xs sm:text-sm">
                  分类管理
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs sm:text-sm">
                  变更历史
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                <TabsContent value="category" className="m-0 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4">
                    <div className="space-y-3 rounded-xl border border-violet-100 bg-white/80 px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="space-y-0.5">
                          <Label className="text-gray-700">检验指标种类</Label>
                          <p className="text-[11px] text-gray-400">
                            设置当前正在维护的分类名称与编码。
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={resetForm}
                          className="h-7 px-2 text-xs border-violet-200 hover:bg-violet-50"
                        >
                          新增分类
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Input
                          value={categoryName}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => setCategoryName(e.target.value)}
                          placeholder="例如：血脂、肝功能"
                          className="border-violet-200 focus:border-violet-400 focus:ring-violet-400"
                        />
                        <Input
                          value={categoryCode}
                          onChange={(e: ChangeEvent<HTMLInputElement>) => setCategoryCode(e.target.value)}
                          placeholder="可选：分类编码，例如：LIPID"
                          className="border-violet-200 focus:border-violet-400 focus:ring-violet-400"
                        />
                      </div>
                    </div>

                    <div className="space-y-2 rounded-xl border border-violet-100 bg-white/80 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700">已维护的检验指标种类</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto rounded-lg bg-white/60 text-xs text-gray-600 divide-y divide-violet-50">
                        {categories.length === 0 ? (
                          <div className="px-2 py-6 text-center text-gray-400">
                            暂无数据，请先新增检验指标分类。
                          </div>
                        ) : (
                          categories.map((category: IndicatorCategory, index) => (
                            <div
                              key={category.id}
                              className="flex items-start justify-between gap-2 px-2 py-2 hover:bg-violet-50/60 transition-colors"
                            >
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                  <div className="font-semibold text-violet-700 text-xs sm:text-sm">
                                    {category.name}
                                  </div>
                                  {category.enabled === false && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                                      已禁用
                                    </span>
                                  )}
                                </div>
                                {category.code && (
                                  <div className="text-[11px] text-gray-500">
                                    编码：{category.code}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-1 justify-end">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  onClick={() => loadCategory(category)}
                                  className="h-6 px-2 text-[11px] border-violet-200"
                                >
                                  编辑
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  onClick={() => {
                                    const next = categories.map(c =>
                                      c.id === category.id ? { ...c, enabled: c.enabled === false ? true : false } : c,
                                    );
                                    onChangeCategories(next);
                                    const logEntry: IndicatorChangeLogEntry = {
                                      id: createLogId(),
                                      timestamp: new Date().toISOString(),
                                      target: "category",
                                      action: "update",
                                      categoryId: category.id,
                                      itemId: null,
                                      before: category,
                                      after: next.find(c => c.id === category.id) || category,
                                    };
                                    appendIndicatorLog(logEntry);
                                  }}
                                  className="h-6 px-2 text-[11px] border-violet-200"
                                >
                                  {category.enabled === false ? "启用" : "禁用"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  disabled={index === 0}
                                  onClick={() => {
                                    const next = [...categories];
                                    const currentIndex = next.findIndex(c => c.id === category.id);
                                    if (currentIndex > 0) {
                                      const [removed] = next.splice(currentIndex, 1);
                                      next.splice(currentIndex - 1, 0, removed);
                                      onChangeCategories(next);
                                      const updated = next.find(c => c.id === category.id) || category;
                                      const logEntry: IndicatorChangeLogEntry = {
                                        id: createLogId(),
                                        timestamp: new Date().toISOString(),
                                        target: "category",
                                        action: "update",
                                        categoryId: category.id,
                                        itemId: null,
                                        before: category,
                                        after: updated,
                                      };
                                      appendIndicatorLog(logEntry);
                                    }
                                  }}
                                  className="h-6 px-2 text-[11px] border-violet-200"
                                >
                                  上移
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  disabled={index === categories.length - 1}
                                  onClick={() => {
                                    const next = [...categories];
                                    const currentIndex = next.findIndex(c => c.id === category.id);
                                    if (currentIndex !== -1 && currentIndex < next.length - 1) {
                                      const [removed] = next.splice(currentIndex, 1);
                                      next.splice(currentIndex + 1, 0, removed);
                                      onChangeCategories(next);
                                      const updated = next.find(c => c.id === category.id) || category;
                                      const logEntry: IndicatorChangeLogEntry = {
                                        id: createLogId(),
                                        timestamp: new Date().toISOString(),
                                        target: "category",
                                        action: "update",
                                        categoryId: category.id,
                                        itemId: null,
                                        before: category,
                                        after: updated,
                                      };
                                      appendIndicatorLog(logEntry);
                                    }
                                  }}
                                  className="h-6 px-2 text-[11px] border-violet-200"
                                >
                                  下移
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="xs"
                                  onClick={() => {
                                    const relatedItemIds = new Set(category.items.map(i => i.id));
                                    const hasRelatedRecords = Array.from(usedIndicatorIds).some(id =>
                                      relatedItemIds.has(id),
                                    );
                                    if (hasRelatedRecords) {
                                      alert("该分类下存在已使用的检验项目记录，无法删除。如需隐藏，请使用禁用功能。");
                                      return;
                                    }
                                    const confirmDelete = window.confirm(
                                      `确定要删除分类「${category.name}」及其下所有指标吗？此操作不可恢复。`,
                                    );
                                    if (!confirmDelete) {
                                      return;
                                    }
                                    const next = categories.filter(c => c.id !== category.id);
                                    onChangeCategories(next);
                                    const logEntry: IndicatorChangeLogEntry = {
                                      id: createLogId(),
                                      timestamp: new Date().toISOString(),
                                      target: "category",
                                      action: "delete",
                                      categoryId: category.id,
                                      itemId: null,
                                      before: category,
                                      after: null,
                                    };
                                    appendIndicatorLog(logEntry);
                                  }}
                                  className="h-6 px-2 text-[11px] border-rose-200 text-rose-500"
                                >
                                  删除
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-violet-100 bg-white/80 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-sm font-medium text-gray-700">项目管理</span>
                        <p className="text-[11px] text-gray-400">
                          为当前分类维护项目名称、单位、参考范围和数据类型。
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddRow}
                        className="h-8 px-3 text-xs border-violet-200 hover:bg-violet-50"
                      >
                        新增项目
                      </Button>
                    </div>
                    <div className="rounded-xl border border-violet-100 bg-white/80">
                      <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-violet-50 text-[11px] text-gray-500">
                        <div className="col-span-3">项目名称</div>
                        <div className="col-span-3">别名/缩写</div>
                        <div className="col-span-2">单位</div>
                        <div className="col-span-2">参考范围</div>
                        <div className="col-span-1">类型</div>
                        <div className="col-span-1 text-right">排序</div>
                      </div>
                      <div className="max-h-56 overflow-y-auto py-1 pr-1 space-y-1">
                        {items.map((item, index) => (
                          <div key={item.id} className="grid grid-cols-12 gap-2 items-center px-3 py-1.5">
                            <div className="col-span-3">
                              <Input
                                value={item.name}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                  setItems(prev =>
                                    prev.map((row, i) =>
                                      i === index ? { ...row, name: e.target.value } : row,
                                    ),
                                  )
                                }
                                placeholder="项目名称，例如：总胆固醇"
                                className="h-8 border-violet-200 focus:border-violet-400 focus:ring-violet-400"
                              />
                            </div>
                            <div className="col-span-3">
                              <Input
                                value={item.aliases || ""}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                  setItems(prev =>
                                    prev.map((row, i) =>
                                      i === index ? { ...row, aliases: e.target.value } : row,
                                    ),
                                  )
                                }
                                placeholder="GLU、葡萄糖、空腹血糖"
                                className="h-8 border-violet-200 focus:border-violet-400 focus:ring-violet-400"
                              />
                            </div>
                            <div className="col-span-2">
                              <Input
                                value={item.unit}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                  setItems(prev =>
                                    prev.map((row, i) =>
                                      i === index ? { ...row, unit: e.target.value } : row,
                                    ),
                                  )
                                }
                                placeholder="单位"
                                className="h-8 border-violet-200 focus:border-violet-400 focus:ring-violet-400"
                              />
                            </div>
                            <div className="col-span-2">
                              <Input
                                value={item.referenceRange || ""}
                                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                                  setItems(prev =>
                                    prev.map((row, i) =>
                                      i === index ? { ...row, referenceRange: e.target.value } : row,
                                    ),
                                  )
                                }
                                placeholder="参考范围"
                                className="h-8 border-violet-200 focus:border-violet-400 focus:ring-violet-400"
                              />
                            </div>
                            <div className="col-span-1">
                              <Select
                                value={item.dataType || "number"}
                                onValueChange={(value: "number" | "text" | "boolean") =>
                                  setItems(prev =>
                                    prev.map((row, i) =>
                                      i === index ? { ...row, dataType: value } : row,
                                    ),
                                  )
                                }
                              >
                                <SelectTrigger className="h-8 border-violet-200 focus:border-violet-400 focus:ring-violet-400">
                                  <SelectValue placeholder="数据类型" />
                                </SelectTrigger>
                                <SelectContent className="bg-white/95 backdrop-blur-xl border-violet-200">
                                  <SelectItem value="number">数值</SelectItem>
                                  <SelectItem value="text">文本</SelectItem>
                                  <SelectItem value="boolean">是/否</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="col-span-1 flex items-center gap-1 justify-end">
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                disabled={index === 0}
                                onClick={() => {
                                  setItems(prev => {
                                    const next = [...prev];
                                    const [removed] = next.splice(index, 1);
                                    next.splice(index - 1, 0, removed);
                                    return next;
                                  });
                                }}
                                className="h-6 px-1 text-[11px] border-violet-200"
                              >
                                ↑
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                disabled={index === items.length - 1}
                                onClick={() => {
                                  setItems(prev => {
                                    const next = [...prev];
                                    const [removed] = next.splice(index, 1);
                                    next.splice(index + 1, 0, removed);
                                    return next;
                                  });
                                }}
                                className="h-6 px-1 text-[11px] border-violet-200"
                              >
                                ↓
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="xs"
                                onClick={() => {
                                  if (items.length === 1) {
                                    setItems([{ id: "item-1", name: "", unit: "" }]);
                                    return;
                                  }
                                  setItems(prev => prev.filter((_, i) => i !== index));
                                }}
                                className="h-6 px-1 text-[11px] border-rose-200 text-rose-500"
                              >
                                删
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="history" className="m-0 space-y-3">
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-gray-700">最近修改历史</span>
                    <p className="text-[11px] text-gray-400">
                      查看最近对分类与指标所做的调整，便于追溯修改记录。
                    </p>
                  </div>
                  {indicatorChangeLogs.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-violet-100 bg-white/60 px-4 py-6 text-center text-xs text-gray-400">
                      暂无变更记录，保存分类或项目调整后会自动生成历史记录。
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto rounded-xl border border-violet-100 bg-white/60">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-violet-100 bg-violet-50/60">
                            <TableHead className="text-gray-700 text-xs w-32">时间</TableHead>
                            <TableHead className="text-gray-700 text-xs w-16">对象</TableHead>
                            <TableHead className="text-gray-700 text-xs w-16">操作</TableHead>
                            <TableHead className="text-gray-700 text-xs">详情</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...indicatorChangeLogs].reverse().slice(0, 30).map(log => {
                            const targetLabel = log.target === "category" ? "分类" : "指标";
                            let actionLabel = "";
                            if (log.action === "create") {
                              actionLabel = "新增";
                            } else if (log.action === "update") {
                              actionLabel = "修改";
                            } else if (log.action === "delete") {
                              actionLabel = "删除";
                            }
                            let detail = "";
                            if (log.target === "category") {
                              const beforeName =
                                (log.before as IndicatorCategory | null)?.name || "";
                              const afterName =
                                (log.after as IndicatorCategory | null)?.name || "";
                              if (log.action === "create") {
                                detail = `新增分类「${afterName}」`;
                              } else if (log.action === "delete") {
                                detail = `删除分类「${beforeName}」`;
                              } else if (log.action === "update") {
                                detail = `更新分类「${beforeName || afterName}」`;
                              }
                            } else if (log.target === "item") {
                              const beforeLabel =
                                (log.before as IndicatorItem | null)?.label || "";
                              const afterLabel =
                                (log.after as IndicatorItem | null)?.label || "";
                              if (log.action === "create") {
                                detail = `新增指标「${afterLabel}」`;
                              } else if (log.action === "delete") {
                                detail = `删除指标「${beforeLabel}」`;
                              } else if (log.action === "update") {
                                detail = `更新指标「${beforeLabel || afterLabel}」`;
                              }
                            }
                            return (
                              <TableRow key={log.id}>
                                <TableCell className="text-xs text-gray-600">
                                  {new Date(log.timestamp).toLocaleString("zh-CN")}
                                </TableCell>
                                <TableCell className="text-xs text-gray-700">
                                  {targetLabel}
                                </TableCell>
                                <TableCell className="text-xs text-gray-700">
                                  {actionLabel}
                                </TableCell>
                                <TableCell className="text-xs text-gray-600">
                                  {detail || "-"}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-violet-50 mt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                resetForm();
                setOpen(false);
              }}
              className="border-violet-200 hover:bg-violet-50"
            >
              取消
            </Button>
            <Button
              type="submit"
              className="bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600"
            >
              保存
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ClearAllDataDialogProps {
  disabled: boolean;
  onConfirm: () => void;
  triggerClassName?: string;
}

function ClearAllDataDialog({ disabled, onConfirm, triggerClassName }: ClearAllDataDialogProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "gap-2 bg-white/80 backdrop-blur-sm border-rose-200 text-rose-600 hover:bg-rose-50 hover:border-rose-300 disabled:opacity-40 disabled:cursor-not-allowed",
            triggerClassName,
          )}
        >
          <Trash2 className="w-4 h-4" />
          删除全部
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-white/95 backdrop-blur-xl border-0 shadow-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl bg-gradient-to-r from-rose-600 to-red-600 bg-clip-text text-transparent">
            确认删除所有数据？
          </AlertDialogTitle>
          <AlertDialogDescription className="text-gray-600">
            此操作将彻底清除当前系统中所有体检记录数据，包括本地存储中的所有相关信息，且无法恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-gray-200 hover:bg-gray-50">
            取消
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-600 hover:to-red-600 border-0"
          >
            确认永久删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface UserMenuProps {
  email?: string | null;
  onConfirm: () => void;
  onSetPassword: (password: string) => Promise<string | null> | string | null;
}

function UserMenu({ email, onConfirm, onSetPassword }: UserMenuProps) {
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  const resetPasswordForm = () => {
    setPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setPasswordSubmitting(false);
  };

  const handleSetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!isStrongPassword(password)) {
      setPasswordError(strongPasswordHint);
      return;
    }
    if (password !== confirmPassword) {
      setPasswordError("两次输入的密码不一致。");
      return;
    }
    setPasswordError(null);
    setPasswordSubmitting(true);
    const result = await onSetPassword(password);
    setPasswordSubmitting(false);
    if (result) {
      setPasswordError(result);
      return;
    }
    resetPasswordForm();
    setPasswordOpen(false);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 bg-white/80 backdrop-blur-sm border-violet-200 text-violet-700 hover:bg-violet-50 hover:border-violet-300"
        >
          <User className="w-4 h-4" />
          <span className="max-w-[180px] truncate">{email || "当前用户"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-white/95 backdrop-blur-xl border-violet-100">
        <DropdownMenuLabel className="text-xs text-gray-500">当前账号</DropdownMenuLabel>
        <div className="px-2 py-1 text-xs text-gray-700 truncate">{email || "未设置邮箱"}</div>
        <DropdownMenuSeparator />
        <Dialog
          open={passwordOpen}
          onOpenChange={(next) => {
            setPasswordOpen(next);
            if (!next) {
              resetPasswordForm();
            }
          }}
        >
          <DialogTrigger asChild>
            <DropdownMenuItem>设置登录密码</DropdownMenuItem>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[420px] bg-white/95 backdrop-blur-xl border-0 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">
                设置登录密码
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSetPassword} className="space-y-4 mt-3">
              <div className="space-y-2">
                <Label htmlFor="new-password">新密码</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  placeholder={strongPasswordHint}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">确认密码</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                  placeholder="再次输入密码"
                />
              </div>
              {passwordError && (
                <div className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                  {passwordError}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPasswordOpen(false)}
                  className="border-violet-200 hover:bg-violet-50"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={passwordSubmitting}
                  className="bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600"
                >
                  {passwordSubmitting ? "保存中..." : "保存密码"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <DropdownMenuItem className="text-rose-600 focus:text-rose-700 focus:bg-rose-50" onSelect={(e) => e.preventDefault()}>
              退出登录
            </DropdownMenuItem>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-white/95 backdrop-blur-xl border-0 shadow-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-lg bg-gradient-to-r from-rose-600 to-red-600 bg-clip-text text-transparent">
                确认退出当前账号？
              </AlertDialogTitle>
              <AlertDialogDescription className="text-gray-600">
                退出后将清除当前登录会话，需要重新登录才能继续访问体检数据。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-gray-200 hover:bg-gray-50">
                取消
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={onConfirm}
                className="bg-gradient-to-r from-rose-500 to-red-500 hover:from-rose-600 hover:to-red-600 border-0"
              >
                确认退出
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type CloudProvider = "none" | "googleDrive";

const CLOUD_SYNC_SCHEMA_VERSION = "health_sync_v2";

interface CloudSyncPayloadState {
  records: HealthRecord[];
  categories: IndicatorCategory[];
  changeLogs: RecordChangeLogEntry[];
  indicatorChangeLogs: IndicatorChangeLogEntry[];
}

interface CloudSyncSnapshot {
  schemaVersion: string;
  source: "web" | "miniprogram";
  generatedAt: string;
  updatedAt: string;
  payload: CloudSyncPayloadState;
}

interface ResolvedCloudPayload {
  payload: CloudSyncPayloadState;
  updatedAt: string;
}

const parseTimeValue = (value?: string | null): number => {
  if (!value) {
    return 0;
  }
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const cloneStatePayload = (payload: CloudSyncPayloadState): CloudSyncPayloadState => ({
  records: [...payload.records],
  categories: [...payload.categories],
  changeLogs: [...payload.changeLogs],
  indicatorChangeLogs: [...payload.indicatorChangeLogs],
});

const buildStateUpdatedAt = (payload: CloudSyncPayloadState): string => {
  let maxTime = 0;

  payload.records.forEach(record => {
    const candidate = parseTimeValue(record.operationAt || record.date);
    if (candidate > maxTime) {
      maxTime = candidate;
    }
  });

  payload.changeLogs.forEach(log => {
    const candidate = parseTimeValue(log.timestamp);
    if (candidate > maxTime) {
      maxTime = candidate;
    }
  });

  payload.indicatorChangeLogs.forEach(log => {
    const candidate = parseTimeValue(log.timestamp);
    if (candidate > maxTime) {
      maxTime = candidate;
    }
  });

  if (maxTime <= 0) {
    return new Date(0).toISOString();
  }
  return new Date(maxTime).toISOString();
};

const buildCloudSnapshot = (payload: CloudSyncPayloadState, source: "web" | "miniprogram"): CloudSyncSnapshot => {
  const safePayload = cloneStatePayload(payload);
  const updatedAt = buildStateUpdatedAt(safePayload);
  return {
    schemaVersion: CLOUD_SYNC_SCHEMA_VERSION,
    source,
    generatedAt: new Date().toISOString(),
    updatedAt,
    payload: safePayload,
  };
};

const resolveCloudPayload = (raw: unknown, fallbackUpdatedAt?: string): ResolvedCloudPayload | null => {
  if (Array.isArray(raw)) {
    return {
      payload: {
        records: raw as HealthRecord[],
        categories: [],
        changeLogs: [],
        indicatorChangeLogs: [],
      },
      updatedAt: fallbackUpdatedAt || new Date(0).toISOString(),
    };
  }

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as {
    schemaVersion?: string;
    updatedAt?: string;
    payload?: Partial<CloudSyncPayloadState>;
    records?: HealthRecord[];
    categories?: IndicatorCategory[];
    changeLogs?: RecordChangeLogEntry[];
    indicatorChangeLogs?: IndicatorChangeLogEntry[];
  };

  if (source.schemaVersion === CLOUD_SYNC_SCHEMA_VERSION && source.payload) {
    return {
      payload: {
        records: Array.isArray(source.payload.records) ? source.payload.records : [],
        categories: Array.isArray(source.payload.categories) ? source.payload.categories : [],
        changeLogs: Array.isArray(source.payload.changeLogs) ? source.payload.changeLogs : [],
        indicatorChangeLogs: Array.isArray(source.payload.indicatorChangeLogs)
          ? source.payload.indicatorChangeLogs
          : [],
      },
      updatedAt: source.updatedAt || fallbackUpdatedAt || new Date(0).toISOString(),
    };
  }

  const hasLegacyState =
    Array.isArray(source.records) ||
    Array.isArray(source.categories) ||
    Array.isArray(source.changeLogs) ||
    Array.isArray(source.indicatorChangeLogs);

  if (!hasLegacyState) {
    return null;
  }

  return {
    payload: {
      records: Array.isArray(source.records) ? source.records : [],
      categories: Array.isArray(source.categories) ? source.categories : [],
      changeLogs: Array.isArray(source.changeLogs) ? source.changeLogs : [],
      indicatorChangeLogs: Array.isArray(source.indicatorChangeLogs) ? source.indicatorChangeLogs : [],
    },
    updatedAt: source.updatedAt || fallbackUpdatedAt || new Date(0).toISOString(),
  };
};

const mergeCloudState = (
  local: CloudSyncPayloadState,
  remote: CloudSyncPayloadState,
) => {
  const localRecordMap = new Map(local.records.map(record => [record.id, record]));
  const mergedRecords: HealthRecord[] = [...local.records];
  let addedRecords = 0;
  let updatedRecords = 0;

  remote.records.forEach(record => {
    const localRecord = localRecordMap.get(record.id);
    if (!localRecord) {
      mergedRecords.push(record);
      localRecordMap.set(record.id, record);
      addedRecords += 1;
      return;
    }
    const localTime = parseTimeValue(localRecord.operationAt || localRecord.date);
    const remoteTime = parseTimeValue(record.operationAt || record.date);
    if (remoteTime > localTime) {
      const index = mergedRecords.findIndex(item => item.id === record.id);
      if (index >= 0) {
        mergedRecords[index] = record;
        localRecordMap.set(record.id, record);
        updatedRecords += 1;
      }
    }
  });

  const localCategoryMap = new Map(local.categories.map(category => [category.id, category]));
  const mergedCategories = [...local.categories];
  let mergedCategoriesCount = 0;

  remote.categories.forEach(category => {
    const localCategory = localCategoryMap.get(category.id);
    if (!localCategory) {
      mergedCategories.push(category);
      localCategoryMap.set(category.id, category);
      mergedCategoriesCount += 1;
      return;
    }
    const index = mergedCategories.findIndex(item => item.id === category.id);
    if (index >= 0 && JSON.stringify(localCategory) !== JSON.stringify(category)) {
      mergedCategories[index] = category;
      localCategoryMap.set(category.id, category);
      mergedCategoriesCount += 1;
    }
  });

  const mergeById = <T extends { id: string }>(base: T[], incoming: T[]) => {
    const map = new Map(base.map(item => [item.id, item]));
    incoming.forEach(item => {
      map.set(item.id, item);
    });
    return Array.from(map.values());
  };

  const mergedChangeLogs = mergeById(local.changeLogs, remote.changeLogs).sort(
    (a, b) => parseTimeValue(a.timestamp) - parseTimeValue(b.timestamp),
  );
  const mergedIndicatorLogs = mergeById(local.indicatorChangeLogs, remote.indicatorChangeLogs).sort(
    (a, b) => parseTimeValue(a.timestamp) - parseTimeValue(b.timestamp),
  );

  return {
    payload: {
      records: mergedRecords,
      categories: mergedCategories,
      changeLogs: mergedChangeLogs,
      indicatorChangeLogs: mergedIndicatorLogs,
    },
    stats: {
      addedRecords,
      updatedRecords,
      touchedCategories: mergedCategoriesCount,
      addedChangeLogs: Math.max(mergedChangeLogs.length - local.changeLogs.length, 0),
      addedIndicatorLogs: Math.max(mergedIndicatorLogs.length - local.indicatorChangeLogs.length, 0),
    },
  };
};

type CloudConnectionSuccessResult = {
  ok: true;
  provider: "googleDrive";
  accountName?: string;
  quotaText?: string;
  detailMessage?: string;
};

type CloudConnectionErrorResult = {
  ok: false;
  provider: "googleDrive";
  errorMessage: string;
};

export type CloudConnectionTestResult = CloudConnectionSuccessResult | CloudConnectionErrorResult;

export async function testCloudConnection(
  provider: "googleDrive",
  accessToken: string,
): Promise<CloudConnectionTestResult> {
  if (!accessToken) {
    return {
      ok: false,
      provider,
      errorMessage: "缺少访问令牌",
    };
  }

  const response = await fetch(
    "https://www.googleapis.com/drive/v3/about?fields=user,storageQuota",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    return {
      ok: false,
      provider,
      errorMessage: `Google Drive 返回状态 ${response.status}，请检查令牌是否有效以及是否具有访问云盘的权限。`,
    };
  }

  const data = (await response.json()) as {
    user?: { displayName?: string; emailAddress?: string };
    storageQuota?: { limit?: string; usage?: string };
  };

  const email = data.user?.emailAddress || data.user?.displayName;
  const quota = data.storageQuota;
  let quotaText = "";

  if (quota?.limit && quota?.usage) {
    const limit = Number(quota.limit);
    const usage = Number(quota.usage);
    if (Number.isFinite(limit) && Number.isFinite(usage) && limit > 0) {
      const limitGb = limit / (1024 * 1024 * 1024);
      const usageGb = usage / (1024 * 1024 * 1024);
      quotaText = `存储使用：${usageGb.toFixed(2)} GB / ${limitGb.toFixed(2)} GB`;
    }
  }

  return {
    ok: true,
    provider,
    accountName: email,
    quotaText,
    detailMessage: quotaText || "已成功访问云盘账户信息。",
  };
}

export interface GoogleDriveTokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  tokenType?: string;
}

interface GoogleDriveTokenExchangeResult {
  tokenInfo?: GoogleDriveTokenInfo;
  errorMessage?: string;
}

interface GoogleDriveTokenExchangeParams {
  code: string;
  verifier: string;
  clientId: string;
  redirectUri: string;
  clientSecret?: string;
  fetchImpl?: typeof fetch;
}

export const exchangeGoogleDriveCodeForToken = async (
  params: GoogleDriveTokenExchangeParams,
): Promise<GoogleDriveTokenExchangeResult> => {
  const { code, verifier, clientId, redirectUri, clientSecret, fetchImpl } = params;
  const impl = fetchImpl || fetch;
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    code_verifier: verifier,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }
  let response: Response;
  try {
    response = await impl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    } as RequestInit);
  } catch (error) {
    console.error("[CloudAuth] googleDrive token request network error", error);
    return {
      errorMessage: "无法连接到 Google 授权服务器，请检查网络后重试。",
    };
  }

  if (!response.ok) {
    let text = "";
    let jsonError: any = undefined;
    try {
      text = await response.text();
      try {
        jsonError = JSON.parse(text);
      } catch {
      }
    } catch {
    }
    console.error("[CloudAuth] googleDrive token request failed", {
      status: response.status,
      body: text,
    });
    if (
      response.status === 400 &&
      (text.includes("client_secret") || text.toLowerCase().includes("client secret")) &&
      text.toLowerCase().includes("missing")
    ) {
      return {
        errorMessage:
          "Google 授权服务器返回错误：缺少 client_secret。请在 Google Cloud Console 中为当前 OAuth 客户端配置客户端密钥，并在应用中设置对应的 VITE_GOOGLE_DRIVE_CLIENT_SECRET，或改用支持 PKCE 的桌面应用类型。",
      };
    }
    const errorMessageFromJson: string | undefined =
      typeof jsonError?.error_description === "string"
        ? jsonError.error_description
        : typeof jsonError?.error === "string"
          ? jsonError.error
          : undefined;
    return {
      errorMessage:
        errorMessageFromJson && errorMessageFromJson.trim().length > 0
          ? `Google 授权失败：${errorMessageFromJson}`
          : "未能从 Google 获取访问令牌，请稍后重试，或在云同步面板中重新发起授权。",
    };
  }

  let json: any;
  try {
    json = await response.json();
  } catch (error) {
    console.error("[CloudAuth] googleDrive token response json parse error", error);
    return {
      errorMessage: "解析 Google 授权返回数据失败，请稍后重试。",
    };
  }

  const accessToken: string | undefined = json?.access_token;
  if (!accessToken) {
    console.error("[CloudAuth] googleDrive token response missing access_token", json);
    return {
      errorMessage: "授权返回中缺少访问令牌，请重新在云同步面板发起授权。",
    };
  }

  const refreshToken: string | undefined = json?.refresh_token;
  const expiresIn: number | undefined =
    typeof json?.expires_in === "number"
      ? json.expires_in
      : typeof json?.expires_in === "string"
        ? Number(json.expires_in)
        : undefined;
  let expiresAt: string | undefined;
  if (Number.isFinite(expiresIn) && expiresIn && expiresIn > 0) {
    expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  }
  const scope: string | undefined = typeof json?.scope === "string" ? json.scope : undefined;
  const tokenType: string | undefined =
    typeof json?.token_type === "string" ? json.token_type : undefined;

  const requiredScopes = GOOGLE_DRIVE_OAUTH_SCOPE.split(" ").filter(Boolean);
  const grantedScopes = scope ? scope.split(" ").filter(Boolean) : [];
  const missing = requiredScopes.filter(s => !grantedScopes.includes(s));
  if (missing.length > 0) {
    console.error("[CloudAuth] googleDrive token missing required scopes", {
      requiredScopes,
      grantedScopes,
      missing,
    });
    return {
      errorMessage:
        "当前授权未包含访问云盘所需的全部权限，请重新授权并在 Google 授权页面中勾选访问 Google Drive 的相关权限。",
    };
  }

  return {
    tokenInfo: {
      accessToken,
      refreshToken,
      expiresAt,
      scope,
      tokenType,
    },
  };
};

type CloudUploadStatus = "pending" | "uploading" | "success" | "failed" | "waitingAuth";

interface CloudUploadTask {
  id: string;
  provider: CloudProvider;
  fileName: string;
  createdAt: string;
  progress: number;
  status: CloudUploadStatus;
  errorMessage?: string;
}

interface CloudSyncDialogProps {
  provider: CloudProvider;
  autoSync: boolean;
  tasks: CloudUploadTask[];
  availableStorageText: string;
  authConfig: CloudAuthConfig;
  onChangeProvider: (provider: CloudProvider) => void;
  onToggleAutoSync: () => void;
  onUpdateAuthConfig: (config: CloudAuthConfig) => void;
  onPullFromCloud: () => void;
  cloudPulling: boolean;
  triggerClassName?: string;
}

function CloudSyncDialog({
  provider,
  autoSync,
  tasks,
  availableStorageText,
  authConfig,
  onChangeProvider,
  onToggleAutoSync,
  onUpdateAuthConfig,
  onPullFromCloud,
  cloudPulling,
  triggerClassName,
}: CloudSyncDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [tokenPageLoading, setTokenPageLoading] = useState(false);

  // Form states for auth
  const [editingAuth, setEditingAuth] = useState<CloudProviderAuth>({
    permissions: { canUpload: true, canOverwrite: true, canDelete: false },
  });

  const providerLabel = provider === "googleDrive" ? "谷歌云盘" : "未配置";

  const hasTasks = tasks.length > 0;

  useEffect(() => {
    if (open) {
      // Load current auth config into form when dialog opens or provider changes
      const currentAuth = provider === "googleDrive" ? authConfig.googleDrive : undefined;
      
      if (currentAuth) {
        setEditingAuth({ ...currentAuth });
      } else {
        setEditingAuth({
          permissions: { canUpload: true, canOverwrite: true, canDelete: false },
          accountName: "",
          accessToken: "",
          expiresAt: "",
        });
      }
    }
  }, [open, provider, authConfig]);

  const commitAuthConfig = (auth: CloudProviderAuth) => {
    const newConfig = { ...authConfig };
    if (provider === "googleDrive") {
      newConfig.googleDrive = auth;
    }
    console.log("[CloudAuth] commitAuthConfig", {
      provider,
      hasToken: !!auth.accessToken,
      expiresAt: auth.expiresAt,
      lastVerified: auth.lastVerified,
    });
    onUpdateAuthConfig(newConfig);
  };

  const handleSaveAuth = () => {
    const auth: CloudProviderAuth = {
      ...editingAuth,
      lastVerified: new Date().toISOString(),
    };
    commitAuthConfig(auth);
    setEditingAuth(auth);
    alert("授权配置已保存");
  };

  const handleTestConnection = async () => {
    if (!editingAuth.accessToken) {
      alert("请先填写访问令牌");
      return;
    }
    console.log("[CloudAuth] start testConnection", {
      provider,
      accountName: editingAuth.accountName,
    });
    try {
      if (provider === "googleDrive") {
        const response = await fetch(
          "https://www.googleapis.com/drive/v3/about?fields=user,storageQuota",
          {
            headers: {
              Authorization: `Bearer ${editingAuth.accessToken}`,
            },
          },
        );
        if (!response.ok) {
          const text = await response.text();
          console.error("[CloudAuth] googleDrive testConnection failed", {
            status: response.status,
            body: text,
          });
          alert(
            `连接失败：Google Drive 返回状态 ${response.status}，请检查令牌是否有效以及是否具有访问云盘的权限。`,
          );
          return;
        }
        const data = (await response.json()) as {
          user?: { displayName?: string; emailAddress?: string };
          storageQuota?: { limit?: string; usage?: string };
        };
        let accountName = editingAuth.accountName;
        const email = data.user?.emailAddress || data.user?.displayName;
        if (!accountName && email) {
          accountName = email;
        }
        const quota = data.storageQuota;
        let quotaText = "";
        if (quota?.limit && quota?.usage) {
          const limit = Number(quota.limit);
          const usage = Number(quota.usage);
          if (Number.isFinite(limit) && Number.isFinite(usage) && limit > 0) {
            const limitGb = limit / (1024 * 1024 * 1024);
            const usageGb = usage / (1024 * 1024 * 1024);
            quotaText = `存储使用：${usageGb.toFixed(2)} GB / ${limitGb.toFixed(2)} GB`;
          }
        }
        const auth: CloudProviderAuth = {
          ...editingAuth,
          accountName,
          lastVerified: new Date().toISOString(),
          tokenInvalid: false,
          lastErrorMessage: undefined,
        };
        commitAuthConfig(auth);
        setEditingAuth(auth);
        console.log("[CloudAuth] googleDrive testConnection success", {
          provider,
          accountName: auth.accountName,
          quota: quotaText,
        });
        const detailLines = [];
        detailLines.push(`账号: ${auth.accountName || "未知"}`);
        if (quotaText) {
          detailLines.push(quotaText);
        } else {
          detailLines.push("已成功访问云盘账户信息。");
        }
        detailLines.push("当前配置可用于后续同步上传。");
        return;
      }
      alert("当前未选择任何云存储平台，无法测试连接。");
    } catch (error) {
      console.error("[CloudAuth] testConnection error", {
        provider,
        error,
      });
      const message = error instanceof Error ? error.message : "未知错误";
      alert(`连接失败：${message}`);
    }
  };

  const getAuthStatus = () => {
    const currentAuth = provider === "googleDrive" ? authConfig.googleDrive : undefined;

    if (!currentAuth || !currentAuth.accessToken) {
      return {
        label: "未授权",
        badgeClass: "bg-gray-100 text-gray-700 border border-gray-200",
        desc: "当前云平台尚未配置授权信息。",
      };
    }

    if (currentAuth.tokenInvalid) {
      return {
        label: "已失效",
        badgeClass: "bg-rose-50 text-rose-700 border border-rose-200",
        desc: "检测到云盘授权无效或权限错误，请点击上方按钮重新获取云盘 Token。",
      };
    }

    if (currentAuth.expiresAt) {
      const expiresAt = new Date(currentAuth.expiresAt);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
        return {
          label: "已过期",
          badgeClass: "bg-amber-50 text-amber-700 border border-amber-200",
          desc: "授权已过期，保存新的有效期后方可继续使用自动同步。",
        };
      }
    }

    return {
      label: "已授权",
      badgeClass: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      desc: "授权有效，可根据下方权限配置控制上传、覆盖和删除行为。",
    };
  };

  const getRoleLabel = () => {
    const { canUpload, canOverwrite, canDelete } = editingAuth.permissions;
    if (canDelete) {
      return "管理员（上传/覆盖/删除）";
    }
    if (canOverwrite) {
      return "维护者（上传/覆盖）";
    }
    if (canUpload) {
      return "协作者（仅上传）";
    }
    return "受限（仅查看）";
  };

  const handleOpenTokenPage = async () => {
    if (provider === "googleDrive") {
      const clientId = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID;
      const redirectUri = `${window.location.origin}${window.location.pathname}`;
      if (!clientId) {
        alert("连接失败：缺少 Google Drive OAuth 配置，请先配置 VITE_GOOGLE_DRIVE_CLIENT_ID。");
        return;
      }
      if (!redirectUri.startsWith(window.location.origin)) {
        alert("连接失败：回调地址无效，请检查 VITE_GOOGLE_DRIVE_REDIRECT_URI 配置。");
        return;
      }
      const state = createGoogleOAuthState();
      const verifier = createGooglePkceVerifier();
      const stored = {
        state,
        verifier,
        createdAt: Date.now(),
      };
      try {
        localStorage.setItem(GOOGLE_DRIVE_OAUTH_VERIFIER_KEY, JSON.stringify(stored));
        localStorage.setItem(GOOGLE_DRIVE_OAUTH_STATE_KEY, state);
      } catch {
      }
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: GOOGLE_DRIVE_OAUTH_SCOPE,
        access_type: "offline",
        include_granted_scopes: "true",
        state,
        code_challenge: verifier,
        code_challenge_method: "plain",
        prompt: "consent",
      });
      const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      try {
        new URL(url);
      } catch {
        alert("目标地址不合法，已取消跳转。");
        return;
      }
      setTokenPageLoading(true);
      try {
        window.location.href = url;
      } finally {
        setTimeout(() => {
          setTokenPageLoading(false);
        }, 500);
      }
      return;
    }

    alert("请先在“基础设置”中选择云存储平台。");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "gap-2 bg-white/80 backdrop-blur-sm border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300",
            triggerClassName,
          )}
        >
          <Cloud className="w-4 h-4" />
          云同步
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] bg-white/95 backdrop-blur-xl border-0 shadow-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent flex items-center gap-2">
            云端存储与同步管理
          </DialogTitle>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2 bg-blue-50/50">
            <TabsTrigger value="general" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
              基础设置
            </TabsTrigger>
            <TabsTrigger value="auth" className="data-[state=active]:bg-white data-[state=active]:shadow-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              授权管理
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-white/70 border border-blue-100 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <CloudUpload className="w-4 h-4 text-blue-500" />
                    <CardTitle className="text-sm">云存储目标</CardTitle>
                  </div>
                  <CardDescription className="text-xs mt-1">
                    选择导入数据将自动备份到的云存储平台。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => onChangeProvider("googleDrive")}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm border ${
                        provider === "googleDrive"
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 hover:border-blue-200 hover:bg-blue-50/60 text-gray-700"
                      }`}
                    >
                      <span>谷歌云盘</span>
                      {provider === "googleDrive" && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500 text-white">
                          已选择
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeProvider("none")}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm border ${
                        provider === "none"
                          ? "border-gray-400 bg-gray-50 text-gray-700"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-600"
                      }`}
                    >
                      <span>不启用云同步</span>
                      {provider === "none" && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-700 text-white">
                          已选择
                        </span>
                      )}
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <HardDrive className="w-3 h-3 text-blue-500" />
                      <span>可用存储空间</span>
                    </div>
                    <span className="text-xs font-medium text-gray-800">
                      {availableStorageText || "待同步后更新"}
                    </span>
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white/70 border border-blue-100 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Cloud className="w-4 h-4 text-blue-500" />
                    <CardTitle className="text-sm">同步策略</CardTitle>
                  </div>
                  <CardDescription className="text-xs mt-1">
                    控制导入后的自动上传行为，建议在网络良好时开启。
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <button
                    type="button"
                    onClick={onToggleAutoSync}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm border ${
                      autoSync
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-gray-200 hover:border-emerald-200 hover:bg-emerald-50/60 text-gray-700"
                    }`}
                  >
                    <div className="flex flex-col items-start">
                      <span>导入后自动上传</span>
                      <span className="text-[11px] text-gray-500 mt-0.5">
                        解析成功的数据导入本地后，自动上传对应 JSON 文件到云端。
                      </span>
                    </div>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-current">
                      {autoSync ? "已开启" : "已关闭"}
                    </span>
                  </button>
                  <div className="text-[11px] text-gray-400 leading-relaxed">
                    当前配置：
                    <span className="ml-1 font-medium text-gray-700">{providerLabel}</span>
                    {autoSync ? "，导入完成后将自动触发上传。" : "，导入完成后不会自动上传。"}
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-800">上传队列</span>
                </div>
                <span className="text-[11px] text-gray-400">
                  仅展示最近 10 次上传任务。
                </span>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onPullFromCloud}
                  disabled={cloudPulling || provider === "none"}
                  className="gap-1 border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300"
                >
                  {cloudPulling ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      正在从云端同步
                    </>
                  ) : (
                    <>
                      <CloudDownload className="w-3 h-3" />
                      从云端同步
                    </>
                  )}
                </Button>
              </div>
              {hasTasks ? (
                <div className="border border-blue-100 rounded-xl overflow-hidden bg-white/60 max-h-60">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-blue-50/60 border-blue-100">
                        <TableHead className="text-xs text-gray-700 w-32">时间</TableHead>
                        <TableHead className="text-xs text-gray-700 w-32">云平台</TableHead>
                        <TableHead className="text-xs text-gray-700">文件名</TableHead>
                        <TableHead className="text-xs text-gray-700 w-24 text-right">进度</TableHead>
                        <TableHead className="text-xs text-gray-700 w-32">状态</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tasks.slice(0, 10).map(task => (
                        <TableRow key={task.id}>
                          <TableCell className="text-xs text-gray-600">
                            {new Date(task.createdAt).toLocaleTimeString("zh-CN", {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </TableCell>
                          <TableCell className="text-xs text-gray-700">
                            {task.provider === "googleDrive" ? "谷歌云盘" : "未配置"}
                          </TableCell>
                          <TableCell className="text-xs text-gray-700 truncate max-w-[180px]">
                            {task.fileName}
                          </TableCell>
                          <TableCell className="text-xs text-right text-gray-700">
                            {task.status === "pending" || task.status === "waitingAuth"
                              ? "-"
                              : `${task.progress}%`}
                          </TableCell>
                          <TableCell className="text-xs">
                            {task.status === "pending" && (
                              <span className="text-gray-500">待开始</span>
                            )}
                            {task.status === "waitingAuth" && (
                              <span className="text-amber-600">等待授权</span>
                            )}
                            {task.status === "uploading" && (
                              <span className="text-blue-600">上传中</span>
                            )}
                            {task.status === "success" && (
                              <span className="text-emerald-600">成功</span>
                            )}
                            {task.status === "failed" && (
                              <span className="text-rose-600">
                                失败
                                {task.errorMessage && (
                                  <span className="ml-1 text-[10px] text-rose-500">
                                    {task.errorMessage}
                                  </span>
                                )}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="h-24 flex flex-col items-center justify-center text-gray-400 text-sm border border-dashed border-blue-100 rounded-xl bg-white/40">
                  <CloudUpload className="w-5 h-5 mb-1 text-blue-300" />
                  <p>暂无上传任务，将在导入数据并开启云同步后自动生成。</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="auth" className="mt-4">
            {provider === "none" ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <CloudUpload className="w-8 h-8 mb-2 text-gray-400" />
                <p>请先在“基础设置”中选择一个云存储平台。</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
                <Card className="border-blue-200 shadow-md overflow-hidden">
                  <div className="bg-blue-50/50 p-4 border-b border-blue-100 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <UserCog className="w-5 h-5 text-blue-600" />
                      <h3 className="font-medium text-blue-900">
                        {provider === "googleDrive" ? "Google Drive" : "云存储平台"} 授权配置
                      </h3>
                    </div>
                    {editingAuth.lastVerified && (
                      <div className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100">
                        <CheckCircle2 className="w-3 h-3" />
                        已验证 ({new Date(editingAuth.lastVerified).toLocaleDateString()})
                      </div>
                    )}
                  </div>
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-600">当前授权状态</span>
                        {(() => {
                          const status = getAuthStatus();
                          return (
                            <span className={`text-[11px] px-2 py-0.5 rounded-full ${status.badgeClass}`}>
                              {status.label}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="text-[11px] text-gray-500 max-w-xs text-right">
                        {getAuthStatus().desc}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>账号标识 / Email</Label>
                        <Input
                          value={editingAuth.accountName || ""}
                          onChange={e => setEditingAuth({ ...editingAuth, accountName: e.target.value })}
                          placeholder="例如: user@example.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>授权有效期至</Label>
                        <Input
                          type="date"
                          value={editingAuth.expiresAt?.split("T")[0] || ""}
                          onChange={e => setEditingAuth({ ...editingAuth, expiresAt: e.target.value })}
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>访问令牌 (Access Token / API Key)</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleOpenTokenPage}
                        disabled={tokenPageLoading || provider === "none"}
                        className="h-7 px-3 gap-1 border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300"
                      >
                        {tokenPageLoading ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            正在打开
                          </>
                        ) : (
                          <>获取/更新云盘Token</>
                        )}
                      </Button>
                      </div>
                      <div className="relative">
                        <Input
                          type="password"
                          value={editingAuth.accessToken || ""}
                          onChange={e => setEditingAuth({ ...editingAuth, accessToken: e.target.value })}
                          placeholder="在此粘贴您的授权令牌..."
                          className="pr-10 font-mono text-sm"
                        />
                        <EyeOff className="w-4 h-4 text-gray-400 absolute right-3 top-3 cursor-pointer hover:text-gray-600" />
                      </div>
                      <p className="text-[11px] text-gray-500">
                        注意：令牌将使用本地密钥加密存储。
                      </p>
                    </div>

                    <div className="pt-2 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="mb-0 block">权限控制 (Roles)</Label>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                          当前角色：{getRoleLabel()}
                        </span>
                      </div>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingAuth.permissions.canUpload}
                            onChange={e => setEditingAuth({
                              ...editingAuth,
                              permissions: { ...editingAuth.permissions, canUpload: e.target.checked }
                            })}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          允许上传
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingAuth.permissions.canOverwrite}
                            onChange={e => setEditingAuth({
                              ...editingAuth,
                              permissions: { ...editingAuth.permissions, canOverwrite: e.target.checked }
                            })}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          允许覆盖
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingAuth.permissions.canDelete}
                            onChange={e => setEditingAuth({
                              ...editingAuth,
                              permissions: { ...editingAuth.permissions, canDelete: e.target.checked }
                            })}
                            className="rounded border-gray-300 text-rose-600 focus:ring-rose-500"
                          />
                          <span className="text-rose-600">允许删除</span>
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-gray-100 text-xs text-gray-600">
                      <div className="flex flex-col gap-0.5">
                        <span>
                          绑定账号：
                          <span className="font-medium">
                            {editingAuth.accountName || "未配置"}
                          </span>
                        </span>
                        {editingAuth.lastVerified && (
                          <span className="text-[11px] text-gray-500">
                            最近验证时间：
                            {new Date(editingAuth.lastVerified).toLocaleString("zh-CN")}
                          </span>
                        )}
                        {editingAuth.lastErrorMessage && (
                          <span className="text-[11px] text-rose-500">
                            最近错误：{editingAuth.lastErrorMessage}
                          </span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-rose-200 text-rose-600 hover:bg-rose-50"
                        onClick={() => {
                          const newConfig = { ...authConfig };
                          if (provider === "googleDrive") {
                            delete newConfig.googleDrive;
                          }
                          onUpdateAuthConfig(newConfig);
                          setEditingAuth({
                            accountName: "",
                            accessToken: "",
                            expiresAt: "",
                            permissions: { canUpload: true, canOverwrite: true, canDelete: false },
                            tokenInvalid: false,
                            lastErrorMessage: undefined,
                          });
                          alert("已清除当前云平台的授权信息");
                        }}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        清除授权
                      </Button>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <Button onClick={handleSaveAuth} className="flex-1 bg-blue-600 hover:bg-blue-700">
                        保存配置
                      </Button>
                      <Button variant="outline" onClick={handleTestConnection} className="flex-1 border-blue-200 text-blue-600 hover:bg-blue-50">
                        测试连接
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export { CloudSyncDialog };

export default function App() {
  const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  console.log("[Auth Debug] SUPABASE_URL:", SUPABASE_URL);
  console.log("[Auth Debug] supabaseEnabled:", supabaseEnabled);
  const [supabaseSession, setSupabaseSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(supabaseEnabled);
  const [authError, setAuthError] = useState<string | null>(null);
  const activeUserId = supabaseEnabled ? supabaseSession?.user?.id ?? null : null;

  useEffect(() => {
    if (!supabaseEnabled) {
      setSupabaseSession(null);
      setAuthLoading(false);
      setAuthError(null);
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      setSupabaseSession(null);
      setAuthLoading(false);
      setAuthError("未检测到 Supabase 配置，登录功能已禁用。");
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    const timeoutId = window.setTimeout(() => {
      console.warn("[Auth] getSession timeout after 3s");
      setAuthLoading(false);
      setAuthError("登录状态加载超时，请检查网络连接后重试。");
    }, 3000);
    const init = async () => {
      try {
        const { data, error } = await client.auth.getSession();
        if (error) {
          console.error("[Auth] getSession error", error);
          setAuthError(error.message || "登录状态加载失败，请稍后重试。");
        }
        setSupabaseSession(data.session ?? null);
      } catch (error) {
        console.error("[Auth] getSession unexpected error", error);
        setSupabaseSession(null);
        setAuthError("登录状态加载失败，请检查网络连接后重试。");
      } finally {
        clearTimeout(timeoutId);
        setAuthLoading(false);
      }
    };
    void init();
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setSupabaseSession(session ?? null);
      setAuthLoading(false);
      setAuthError(null);
    });
    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [supabaseEnabled]);

  const [records, setRecords] = useState<HealthRecord[]>([]);
  const [indicatorCategories, setIndicatorCategories] = useState<IndicatorCategory[]>(DEFAULT_INDICATOR_CATEGORIES);
  const [historyStack, setHistoryStack] = useState<HealthRecord[][]>([]);
  const [futureStack, setFutureStack] = useState<HealthRecord[][]>([]);
  const [changeLogs, setChangeLogs] = useState<RecordChangeLogEntry[]>([]);
  const [indicatorChangeLogs, setIndicatorChangeLogs] = useState<IndicatorChangeLogEntry[]>([]);
  const [cloudProvider, setCloudProvider] = useState<CloudProvider>("none");
  const [cloudAutoSync, setCloudAutoSync] = useState(false);
  const [cloudUploadTasks, setCloudUploadTasks] = useState<CloudUploadTask[]>([]);
  const [cloudAvailableStorageText, setCloudAvailableStorageText] = useState("");
  const [manualSyncing, setManualSyncing] = useState(false);
  const [cloudPulling, setCloudPulling] = useState(false);
  const [authConfig, setAuthConfig] = useState<CloudAuthConfig>({});
  const [indicatorDataCategoryId, setIndicatorDataCategoryId] = useState<string>("");
  const [maintenanceCategoryId, setMaintenanceCategoryId] = useState<string>("__all__");

  useEffect(() => {
    if (indicatorCategories.length === 0) {
      setIndicatorDataCategoryId("");
      return;
    }
    setIndicatorDataCategoryId(prev =>
      prev && indicatorCategories.some(category => category.id === prev)
        ? prev
        : indicatorCategories[0].id,
    );
  }, [indicatorCategories]);

  useEffect(() => {
    if (indicatorCategories.length === 0) {
      setMaintenanceCategoryId("__all__");
      return;
    }
    if (maintenanceCategoryId !== "__all__") {
      const exists = indicatorCategories.some(category => category.id === maintenanceCategoryId);
      if (!exists) {
        setMaintenanceCategoryId("__all__");
      }
    }
  }, [indicatorCategories, maintenanceCategoryId]);

  const handleUpdateAuthConfig = (config: CloudAuthConfig) => {
    console.log("[CloudAuth] update authConfig", {
      hasGoogle: !!config.googleDrive?.accessToken,
      adminPinConfigured: !!config.adminPin,
    });
    setAuthConfig(config);
  };

  const updateGoogleDriveRootFolderId = (folderId: string) => {
    setAuthConfig(prev => {
      const prevGoogle = prev.googleDrive;
      if (prevGoogle && prevGoogle.rootFolderId === folderId) {
        return prev;
      }
      const nextGoogle: CloudProviderAuth = {
        ...(prevGoogle || { permissions: { canUpload: true, canOverwrite: true, canDelete: false } }),
        rootFolderId: folderId,
      };
      const next = { ...prev, googleDrive: nextGoogle };
      console.log("[CloudSync] update googleDrive rootFolderId", { folderId });
      return next;
    });
  };

  // 从 localStorage 加载数据 (包含版本迁移逻辑)
  useEffect(() => {
    if (supabaseEnabled && !activeUserId) {
      return;
    }
    const loadData = () => {
      try {
        const scopedKey = (baseKey: string) => buildUserStorageKey(baseKey, activeUserId);
        const allowLegacyMigration = (() => {
          if (!activeUserId) {
            return true;
          }
          try {
            const lastUser = localStorage.getItem(LAST_ACTIVE_USER_KEY);
            return !lastUser || lastUser === activeUserId;
          } catch {
            return false;
          }
        })();

        const readJson = (key: string) => {
          const raw = localStorage.getItem(key);
          if (!raw) {
            return null;
          }
          try {
            return JSON.parse(raw);
          } catch {
            return null;
          }
        };

        const readWithFallback = (baseKey: string, legacyKey?: string) => {
          const scoped = scopedKey(baseKey);
          const scopedRaw = localStorage.getItem(scoped);
          if (scopedRaw) {
            return readJson(scoped);
          }
          if (!allowLegacyMigration) {
            return null;
          }
          const legacyRaw = localStorage.getItem(baseKey) || (legacyKey ? localStorage.getItem(legacyKey) : null);
          if (!legacyRaw) {
            return null;
          }
          safeSetItem(scoped, legacyRaw);
          return readJson(scoped);
        };

        setRecords([]);
        setHistoryStack([]);
        setFutureStack([]);
        setChangeLogs([]);
        setIndicatorChangeLogs([]);
        setCloudProvider("none");
        setCloudAutoSync(false);
        setCloudUploadTasks([]);
        setCloudAvailableStorageText("");
        setCloudPulling(false);
        setManualSyncing(false);
        setAuthConfig({});
        setIndicatorCategories(DEFAULT_INDICATOR_CATEGORIES);

        // 1. Records
        const recordsData = readWithFallback(STORAGE_KEY, LEGACY_STORAGE_KEY);
        if (Array.isArray(recordsData)) {
          setRecords(recordsData);
        }

        // 2. Categories
        const categoriesData = readWithFallback(INDICATOR_STORAGE_KEY, LEGACY_INDICATOR_STORAGE_KEY);
        if (Array.isArray(categoriesData) && categoriesData.length > 0) {
          setIndicatorCategories(categoriesData);
        }

        // 3. Change Logs
        const changeLogsData = readWithFallback(CHANGE_LOG_STORAGE_KEY, LEGACY_CHANGE_LOG_STORAGE_KEY);
        if (Array.isArray(changeLogsData)) {
          setChangeLogs(changeLogsData);
        }

        const indicatorLogsData = readWithFallback(INDICATOR_CHANGE_LOG_STORAGE_KEY);
        if (Array.isArray(indicatorLogsData)) {
          setIndicatorChangeLogs(indicatorLogsData);
        }

        const savedProvider = localStorage.getItem(scopedKey("cloud_provider"));
        const savedAutoSync = localStorage.getItem(scopedKey("cloud_auto_sync"));
        if (savedProvider === "googleDrive" || savedProvider === "none") {
          setCloudProvider(savedProvider as CloudProvider);
        }
        if (savedAutoSync === "true") {
          setCloudAutoSync(true);
        }

        const savedAuthConfig = localStorage.getItem(scopedKey(AUTH_CONFIG_STORAGE_KEY));
        if (savedAuthConfig) {
          try {
            const parsed = JSON.parse(decryptData(savedAuthConfig));
            console.log("[CloudAuth] load authConfig from storage", {
              hasGoogle: !!parsed.googleDrive?.accessToken,
            });
            setAuthConfig(parsed);
          } catch (e) {
            console.error("Failed to load auth config", e);
          }
        }

        if (activeUserId) {
          safeSetItem(LAST_ACTIVE_USER_KEY, activeUserId);
        }
      } catch (error) {
        console.error("Failed to load data from storage:", error);
        // Fallback for privacy mode or storage errors
        if (typeof localStorage === 'undefined' || error instanceof DOMException) {
           alert("无法访问本地存储，可能是因为您处于隐私模式或存储空间已满。数据将无法持久化保存。");
        }
      }
    };

    loadData();
  }, [supabaseEnabled, activeUserId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description") || "";
    if (!code && !error) {
      return;
    }
    const storedState = localStorage.getItem(GOOGLE_DRIVE_OAUTH_STATE_KEY);
    const storedVerifierRaw = localStorage.getItem(GOOGLE_DRIVE_OAUTH_VERIFIER_KEY);

    const cleanUpUrl = () => {
      url.searchParams.delete("code");
      url.searchParams.delete("state");
      url.searchParams.delete("error");
      url.searchParams.delete("error_description");
      const clean = url.toString();
      window.history.replaceState(null, document.title, clean);
    };

    const clearStoredOAuth = () => {
      localStorage.removeItem(GOOGLE_DRIVE_OAUTH_STATE_KEY);
      localStorage.removeItem(GOOGLE_DRIVE_OAUTH_VERIFIER_KEY);
    };

    if (error) {
      clearStoredOAuth();
      cleanUpUrl();
      const message = errorDescription ? `${error}（${errorDescription}）` : error;
      console.error("[CloudAuth] googleDrive oauth error", {
        error,
        errorDescription,
      });
      alert(`Google Drive 授权失败：${message}`);
      return;
    }

    if (!code) {
      return;
    }

    if (!state || !storedState || state !== storedState) {
      clearStoredOAuth();
      cleanUpUrl();
      console.error("[CloudAuth] googleDrive oauth state mismatch", {
        state,
        storedState,
      });
      alert("Google Drive 授权回调状态无效，请重新在云同步面板中发起授权。");
      return;
    }

    if (!storedVerifierRaw) {
      clearStoredOAuth();
      cleanUpUrl();
      console.error("[CloudAuth] googleDrive oauth missing verifier");
      alert("未找到授权校验信息，请重新在云同步面板中发起授权。");
      return;
    }

    let verifier = "";
    try {
      const parsed = JSON.parse(storedVerifierRaw) as {
        state?: string;
        verifier?: string;
        createdAt?: number;
      };
      if (parsed.state && parsed.state !== state) {
        console.warn("[CloudAuth] googleDrive oauth stored state mismatch", {
          stored: parsed.state,
          state,
        });
      }
      verifier = parsed.verifier || "";
    } catch (e) {
      console.error("[CloudAuth] googleDrive oauth parse verifier error", e);
    }

    if (!verifier) {
      clearStoredOAuth();
      cleanUpUrl();
      alert("授权校验信息无效，请重新在云同步面板中发起授权。");
      return;
    }

    const clientId = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID;
    const redirectUri =
      import.meta.env.VITE_GOOGLE_DRIVE_REDIRECT_URI || `${window.location.origin}${window.location.pathname}`;
    if (!clientId) {
      clearStoredOAuth();
      cleanUpUrl();
      alert("连接失败：缺少 Google Drive OAuth 配置，请先配置 VITE_GOOGLE_DRIVE_CLIENT_ID。");
      return;
    }

    let cancelled = false;

    const run = async () => {
      const { tokenInfo, errorMessage } = await exchangeGoogleDriveCodeForToken({
        code,
        verifier,
        clientId,
        redirectUri,
        clientSecret: import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_SECRET,
      });
      if (cancelled) {
        return;
      }
      clearStoredOAuth();
      cleanUpUrl();
      if (!tokenInfo || errorMessage) {
        console.error("[CloudAuth] googleDrive oauth callback failed", {
          errorMessage,
        });
        alert(
          errorMessage ||
            "未能从 Google 获取访问令牌，请稍后重试，或在云同步面板中重新发起授权。",
        );
        return;
      }
      setAuthConfig(prev => {
        const prevGoogle = prev.googleDrive;
        const basePermissions =
          prevGoogle?.permissions || { canUpload: true, canOverwrite: true, canDelete: false };
        const nextGoogle: CloudProviderAuth = {
          ...(prevGoogle || {}),
          permissions: basePermissions,
          accessToken: tokenInfo.accessToken,
          refreshToken: tokenInfo.refreshToken,
          expiresAt: tokenInfo.expiresAt,
          lastVerified: new Date().toISOString(),
          tokenInvalid: false,
          lastErrorMessage: undefined,
        };
        const next: CloudAuthConfig = {
          ...prev,
          googleDrive: nextGoogle,
        };
        console.log("[CloudAuth] googleDrive oauth callback processed", {
          hasToken: !!nextGoogle.accessToken,
          expiresAt: nextGoogle.expiresAt,
        });
        return next;
      });
      setCloudProvider(prev => (prev === "none" ? "googleDrive" : prev));
      alert("Google Drive 授权成功，可以开始使用云同步。");
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  // 统一的存储错误处理函数
  const safeSetItem = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        alert("本地存储空间已满 (5MB限制)，无法保存新数据。请尝试清理历史数据或导出备份。");
      } else {
        console.error(`Failed to save to ${key}:`, error);
      }
    }
  };

  // 保存数据到 localStorage
  useEffect(() => {
    if (supabaseEnabled && !activeUserId) {
      return;
    }
    const scopedKey = buildUserStorageKey(STORAGE_KEY, activeUserId);
    if (records.length > 0) {
      safeSetItem(scopedKey, JSON.stringify(records));
    } else {
      localStorage.removeItem(scopedKey);
    }
  }, [records, supabaseEnabled, activeUserId]);

  useEffect(() => {
    if (supabaseEnabled && !activeUserId) {
      return;
    }
    const scopedKey = buildUserStorageKey(INDICATOR_STORAGE_KEY, activeUserId);
    if (indicatorCategories.length > 0) {
      safeSetItem(scopedKey, JSON.stringify(indicatorCategories));
    }
  }, [indicatorCategories, supabaseEnabled, activeUserId]);

  useEffect(() => {
    if (supabaseEnabled && !activeUserId) {
      return;
    }
    const scopedKey = buildUserStorageKey(CHANGE_LOG_STORAGE_KEY, activeUserId);
    if (changeLogs.length > 0) {
      safeSetItem(scopedKey, JSON.stringify(changeLogs));
    } else {
      localStorage.removeItem(scopedKey);
    }
  }, [changeLogs, supabaseEnabled, activeUserId]);

  useEffect(() => {
    if (supabaseEnabled && !activeUserId) {
      return;
    }
    const scopedKey = buildUserStorageKey(INDICATOR_CHANGE_LOG_STORAGE_KEY, activeUserId);
    if (indicatorChangeLogs.length > 0) {
      safeSetItem(scopedKey, JSON.stringify(indicatorChangeLogs));
    } else {
      localStorage.removeItem(scopedKey);
    }
  }, [indicatorChangeLogs, supabaseEnabled, activeUserId]);

  useEffect(() => {
    if (supabaseEnabled && !activeUserId) {
      return;
    }
    safeSetItem(buildUserStorageKey("cloud_provider", activeUserId), cloudProvider);
    safeSetItem(buildUserStorageKey("cloud_auto_sync", activeUserId), cloudAutoSync ? "true" : "false");
  }, [cloudProvider, cloudAutoSync, supabaseEnabled, activeUserId]);

  useEffect(() => {
    if (supabaseEnabled && !activeUserId) {
      return;
    }
    if (Object.keys(authConfig).length > 0) {
      console.log("[CloudAuth] persist authConfig to storage");
      safeSetItem(buildUserStorageKey(AUTH_CONFIG_STORAGE_KEY, activeUserId), encryptData(JSON.stringify(authConfig)));
    }
  }, [authConfig, supabaseEnabled, activeUserId]);

  const indicatorItems: IndicatorItem[] = indicatorCategories.flatMap((category) => category.items);
  const indicatorDataCategory =
    indicatorCategories.find(category => category.id === indicatorDataCategoryId) ??
    indicatorCategories[0] ??
    null;
  const indicatorDataItems = indicatorDataCategory
    ? indicatorDataCategory.items.filter(item => item.enabled !== false)
    : [];
  const indicatorDataIds = indicatorDataItems.map(item => item.id);
  const indicatorDataRows = (() => {
    if (!indicatorDataCategory || indicatorDataIds.length === 0) {
      return [];
    }
    const rowsByDate = new Map<string, Record<string, unknown>>();
    records
      .filter(record => indicatorDataIds.includes(record.indicatorType))
      .forEach(record => {
        const existing = rowsByDate.get(record.date) || { date: record.date };
        existing[record.indicatorType] = record.value;
        rowsByDate.set(record.date, existing);
      });
    return Array.from(rowsByDate.values()).sort(
      (a, b) => new Date(String(b.date)).getTime() - new Date(String(a.date)).getTime(),
    );
  })();

  const formatIndicatorValue = (value: unknown) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return "-";
    }
    if (Number.isInteger(value)) {
      return value;
    }
    return Number(value.toFixed(2));
  };

  const maintenanceCategory =
    maintenanceCategoryId === "__all__"
      ? null
      : indicatorCategories.find(category => category.id === maintenanceCategoryId) ?? null;
  const maintenanceIndicatorIds = maintenanceCategory
    ? maintenanceCategory.items.map(item => item.id)
    : indicatorItems.map(item => item.id);
  const maintenanceIndicators = maintenanceCategory ? maintenanceCategory.items : indicatorItems;
  const maintenanceRecords = maintenanceCategory
    ? records.filter(record => maintenanceIndicatorIds.includes(record.indicatorType))
    : records;
  const maintenanceLogs = maintenanceCategory
    ? changeLogs.filter(log => {
        const typeId = log.after?.indicatorType ?? log.before?.indicatorType ?? "";
        return maintenanceIndicatorIds.includes(typeId);
      })
    : changeLogs;
  const createCloudUploadId = () => `cloud_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const markGoogleDriveTokenInvalid = (info: {
    status: number;
    operation: string;
    apiMessage?: string;
    reason?: string;
  }) => {
    console.error("[CloudAuth] googleDrive token marked invalid", info);
    setAuthConfig(prev => {
      const prevGoogle = prev.googleDrive;
      if (!prevGoogle) {
        return prev;
      }
      const nextGoogle: CloudProviderAuth = {
        ...prevGoogle,
        tokenInvalid: true,
        lastErrorMessage:
          info.apiMessage ||
          info.reason ||
          `最近操作 ${info.operation} 返回状态 ${info.status}`,
      };
      return { ...prev, googleDrive: nextGoogle };
    });
  };

  const parseGoogleDriveError = (status: number, body: string) => {
    let apiMessage = "";
    let reason = "";
    try {
      const parsed = JSON.parse(body) as {
        error?: { message?: string; errors?: { reason?: string }[] };
      };
      if (parsed.error?.message) {
        apiMessage = parsed.error.message;
      }
      if (parsed.error?.errors && parsed.error.errors.length > 0) {
        reason = parsed.error.errors[0]?.reason || "";
      }
    } catch {
    }
    let userMessage = "";
    if (status === 401 || status === 403) {
      if (apiMessage) {
        userMessage = `Google Drive 返回 ${status}：${apiMessage}。请在云同步面板中点击“获取/更新云盘Token”重新完成授权后重试。`;
      } else {
        userMessage =
          "当前授权无效或权限不足，请在云同步面板中重新获取云盘 Token 后重试。";
      }
    }
    return { apiMessage, reason, userMessage };
  };

  const ensureGoogleDrivePersonalFolder = async (accessToken: string): Promise<string | undefined> => {
    try {
      const query = "name='个人' and mimeType='application/vnd.google-apps.folder' and trashed=false";
      const url =
        "https://www.googleapis.com/drive/v3/files?q=" +
        encodeURIComponent(query) +
        "&spaces=drive&fields=files(id,name)&pageSize=10";
      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const status = resp.status;
      if (!resp.ok) {
        const text = await resp.text();
        const parsed = parseGoogleDriveError(status, text);
        console.error("[CloudSync] list personal folder failed", {
          status,
          body: text,
          apiMessage: parsed.apiMessage,
          reason: parsed.reason,
        });
        if (status === 401 || status === 403) {
          markGoogleDriveTokenInvalid({
            status,
            operation: "list personal folder",
            apiMessage: parsed.apiMessage,
            reason: parsed.reason,
          });
        }
        return undefined;
      }
      const data = (await resp.json()) as { files?: { id: string; name: string }[] };
      if (data.files && data.files.length > 0) {
        const folder = data.files[0];
        console.log("[CloudSync] found personal folder", { id: folder.id });
        return folder.id;
      }
      const createResp = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "个人",
          mimeType: "application/vnd.google-apps.folder",
        }),
      });
      const createStatus = createResp.status;
      if (!createResp.ok) {
        const text = await createResp.text();
        const parsed = parseGoogleDriveError(createStatus, text);
        console.error("[CloudSync] create personal folder failed", {
          status: createStatus,
          body: text,
          apiMessage: parsed.apiMessage,
          reason: parsed.reason,
        });
        if (createStatus === 401 || createStatus === 403) {
          markGoogleDriveTokenInvalid({
            status: createStatus,
            operation: "create personal folder",
            apiMessage: parsed.apiMessage,
            reason: parsed.reason,
          });
        }
        return undefined;
      }
      const created = (await createResp.json()) as { id?: string };
      if (!created.id) {
        return undefined;
      }
      console.log("[CloudSync] created personal folder", { id: created.id });
      return created.id;
    } catch (error) {
      console.error("[CloudSync] ensure personal folder error", error);
      return undefined;
    }
  };

  const fetchCloudSnapshot = async (showAlert = true): Promise<ResolvedCloudPayload | null> => {
    const notify = (message: string) => {
      if (showAlert) {
        alert(message);
      }
    };

    if (cloudProvider === "none") {
      notify("请先在云同步中选择云存储平台。");
      return null;
    }
    const currentAuth =
      cloudProvider === "googleDrive"
        ? authConfig.googleDrive
        : undefined;
    if (!currentAuth || !currentAuth.accessToken) {
      notify("未检测到有效授权，请在云同步面板完成授权后重试。");
      return null;
    }
    if (currentAuth.tokenInvalid) {
      notify("检测到最近一次访问云端返回权限错误或令牌无效，请在云同步面板中重新获取云盘 Token 后重试。");
      return null;
    }
    if (currentAuth.expiresAt) {
      const expiresAt = new Date(currentAuth.expiresAt);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
        notify("授权信息已过期，请在云同步面板更新授权后重试。");
        return null;
      }
    }
    if (cloudProvider === "googleDrive") {
      const accessToken = currentAuth.accessToken;
      let folderId = currentAuth.rootFolderId;
      if (!folderId) {
        folderId = await ensureGoogleDrivePersonalFolder(accessToken);
        if (!folderId) {
          notify("无法获取或创建云端个人文件夹，请稍后重试。");
          return null;
        }
        updateGoogleDriveRootFolderId(folderId);
      }
      try {
        const query = `'${folderId}' in parents and mimeType='application/json' and trashed=false`;
        const url =
          "https://www.googleapis.com/drive/v3/files?q=" +
          encodeURIComponent(query) +
          "&spaces=drive&fields=files(id,name,modifiedTime,createdTime)&orderBy=modifiedTime desc&pageSize=1";
        const listResp = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
        const listStatus = listResp.status;
        if (!listResp.ok) {
          const text = await listResp.text();
          const parsed = parseGoogleDriveError(listStatus, text);
          console.error("[CloudSync] list backup files failed", {
            status: listStatus,
            body: text,
            apiMessage: parsed.apiMessage,
            reason: parsed.reason,
          });
          if (listStatus === 401 || listStatus === 403) {
            markGoogleDriveTokenInvalid({
              status: listStatus,
              operation: "list backup files",
              apiMessage: parsed.apiMessage,
              reason: parsed.reason,
            });
            const message =
              parsed.userMessage ||
              "无法获取云端备份列表：当前授权无效或权限不足，请在云同步面板中重新获取云盘 Token 后重试。";
            notify(message);
          } else {
            notify("无法获取云端备份列表，请稍后重试。");
          }
          return null;
        }
        const listData = (await listResp.json()) as {
          files?: { id: string; name: string; modifiedTime?: string; createdTime?: string }[];
        };
        if (!listData.files || listData.files.length === 0) {
          notify("云端个人文件夹中暂无备份数据。");
          return null;
        }
        const file = listData.files[0];
        console.log("[CloudSync] fetch latest backup file", {
          id: file.id,
          name: file.name,
        });
        const fileResp = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );
        const fileStatus = fileResp.status;
        if (!fileResp.ok) {
          const text = await fileResp.text();
          const parsed = parseGoogleDriveError(fileStatus, text);
          console.error("[CloudSync] download backup file failed", {
            status: fileStatus,
            body: text,
            apiMessage: parsed.apiMessage,
            reason: parsed.reason,
          });
          if (fileStatus === 401 || fileStatus === 403) {
            markGoogleDriveTokenInvalid({
              status: fileStatus,
              operation: "download backup file",
              apiMessage: parsed.apiMessage,
              reason: parsed.reason,
            });
            const message =
              parsed.userMessage ||
              "下载云端备份失败：当前授权无效或权限不足，请在云同步面板中重新获取云盘 Token 后重试。";
            notify(message);
          } else {
            notify("下载云端备份失败，请稍后重试。");
          }
          return null;
        }
        const text = await fileResp.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          console.error("[CloudSync] parse backup json failed", e);
          notify("云端备份数据格式错误，无法解析。");
          return null;
        }
        const resolved = resolveCloudPayload(
          parsed,
          file.modifiedTime || file.createdTime || new Date(0).toISOString(),
        );
        if (!resolved) {
          notify("云端备份数据格式不完整，无法合并。");
          return null;
        }

        resolved.payload.records = resolved.payload.records.filter(item => {
          return (
            typeof item.id === "string" &&
            typeof item.date === "string" &&
            typeof item.indicatorType === "string" &&
            typeof item.value === "number" &&
            typeof item.unit === "string"
          );
        });

        if (resolved.payload.records.length === 0) {
          notify("云端备份中没有可用的体检记录。");
          return null;
        }

        return resolved;
      } catch (error) {
        console.error("[CloudSync] fetchCloudSnapshot error", error);
        notify("从云端获取数据时发生错误，请稍后重试。");
        return null;
      }
    }
    return null;
  };
  const enqueueCloudUpload = async (
    provider: CloudProvider,
    payload: { fileName: string; json: string },
  ): Promise<CloudUploadStatus> => {
    if (provider === "none") {
      return "failed";
    }
    const id = createCloudUploadId();
    const createdAt = new Date().toISOString();
    const task: CloudUploadTask = {
      id,
      provider,
      fileName: payload.fileName,
      createdAt,
      progress: 0,
      status: "pending",
    };
    console.log("[CloudSync] enqueueCloudUpload", {
      id,
      provider,
      fileName: payload.fileName,
    });
    setCloudUploadTasks(prev => [task, ...prev].slice(0, 20));

    let currentAuth = provider === "googleDrive" ? authConfig.googleDrive : undefined;

    if (!currentAuth || !currentAuth.accessToken) {
      const savedAuthConfig = localStorage.getItem(buildUserStorageKey(AUTH_CONFIG_STORAGE_KEY, activeUserId));
      if (savedAuthConfig) {
        try {
          const parsed = JSON.parse(decryptData(savedAuthConfig)) as CloudAuthConfig;
          const fallbackAuth = provider === "googleDrive" ? parsed.googleDrive : undefined;
          if (fallbackAuth && fallbackAuth.accessToken) {
            currentAuth = fallbackAuth;
            setAuthConfig(prev => ({ ...prev, ...parsed }));
          }
        } catch (error) {
          console.error("[CloudSync] failed to load authConfig from storage in enqueueCloudUpload", error);
        }
      }
    }

    if (!currentAuth || !currentAuth.accessToken) {
      console.log("[CloudSync] missing auth for provider", { provider });
      setCloudUploadTasks(prev =>
        prev.map(t =>
          t.id === id
            ? { ...t, status: "waitingAuth", errorMessage: "未检测到授权，请先在云同步面板完成授权。" }
            : t,
        ),
      );
      return "waitingAuth";
    }

    if (currentAuth.expiresAt) {
      const expiresAt = new Date(currentAuth.expiresAt);
      if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
        console.log("[CloudSync] auth expired for provider", {
          provider,
          expiresAt: currentAuth.expiresAt,
        });
        setCloudUploadTasks(prev =>
          prev.map(t =>
            t.id === id
              ? { ...t, status: "waitingAuth", errorMessage: "授权信息已过期，请重新授权。" }
              : t,
          ),
        );
        return "waitingAuth";
      }
    }

    const accessToken = currentAuth.accessToken;

    setCloudUploadTasks(prev =>
      prev.map(t =>
        t.id === id
          ? { ...t, status: "uploading", progress: 0, errorMessage: undefined }
          : t,
      ),
    );

    try {
      if (provider === "googleDrive") {
        const apiKey = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY;
        let folderId = currentAuth.rootFolderId;
        if (!folderId) {
          folderId = await ensureGoogleDrivePersonalFolder(accessToken);
          if (!folderId) {
            throw new Error("无法获取或创建云端个人文件夹");
          }
          updateGoogleDriveRootFolderId(folderId);
        }
        const metadata = {
          name: payload.fileName,
          mimeType: "application/json",
          parents: [folderId],
        };
        const boundary = `-------314159265358979323846`;
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelimiter = `\r\n--${boundary}--`;
        const body =
          delimiter +
          "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
          JSON.stringify(metadata) +
          delimiter +
          "Content-Type: application/json\r\n\r\n" +
          payload.json +
          closeDelimiter;
        const url =
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart" +
          (apiKey ? `&key=${encodeURIComponent(apiKey)}` : "");
        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `HTTP ${response.status}`);
        }
        setCloudUploadTasks(prev =>
          prev.map(t => (t.id === id ? { ...t, status: "success", progress: 100 } : t)),
        );
        setCloudAvailableStorageText("已更新，具体空间以云盘为准");
        return "success";
      }

      return "failed";
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setCloudUploadTasks(prev =>
        prev.map(t => (t.id === id ? { ...t, status: "failed", errorMessage: message } : t)),
      );
      return "failed";
    }
  };

  const handleManualSync = async () => {
    let effectiveProvider: CloudProvider = cloudProvider;
    if (effectiveProvider === "none") {
      const savedProvider = localStorage.getItem(buildUserStorageKey("cloud_provider", activeUserId));
      if (savedProvider === "googleDrive") {
        effectiveProvider = savedProvider;
      }
    }
    if (effectiveProvider === "none") {
      alert("请先在云同步中选择云存储平台。");
      return;
    }
    let effectiveRecords = records;
    let effectiveCategories = indicatorCategories;
    let effectiveChangeLogs = changeLogs;
    let effectiveIndicatorChangeLogs = indicatorChangeLogs;
    if (effectiveRecords.length === 0) {
      try {
        const saved = localStorage.getItem(buildUserStorageKey(STORAGE_KEY, activeUserId));
        if (saved) {
          const parsed = JSON.parse(saved) as HealthRecord[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            effectiveRecords = parsed;
          }
        }
      } catch (error) {
        console.error("[CloudSync] failed to load records from storage for manual sync", error);
      }
    }
    if (effectiveCategories.length === 0) {
      try {
        const saved = localStorage.getItem(buildUserStorageKey(INDICATOR_STORAGE_KEY, activeUserId));
        if (saved) {
          const parsed = JSON.parse(saved) as IndicatorCategory[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            effectiveCategories = parsed;
          }
        }
      } catch (error) {
        console.error("[CloudSync] failed to load categories from storage for manual sync", error);
      }
    }
    if (effectiveChangeLogs.length === 0) {
      try {
        const saved = localStorage.getItem(buildUserStorageKey(CHANGE_LOG_STORAGE_KEY, activeUserId));
        if (saved) {
          const parsed = JSON.parse(saved) as RecordChangeLogEntry[];
          if (Array.isArray(parsed)) {
            effectiveChangeLogs = parsed;
          }
        }
      } catch (error) {
        console.error("[CloudSync] failed to load change logs from storage for manual sync", error);
      }
    }
    if (effectiveIndicatorChangeLogs.length === 0) {
      try {
        const saved = localStorage.getItem(buildUserStorageKey(INDICATOR_CHANGE_LOG_STORAGE_KEY, activeUserId));
        if (saved) {
          const parsed = JSON.parse(saved) as IndicatorChangeLogEntry[];
          if (Array.isArray(parsed)) {
            effectiveIndicatorChangeLogs = parsed;
          }
        }
      } catch (error) {
        console.error("[CloudSync] failed to load indicator logs from storage for manual sync", error);
      }
    }
    if (effectiveRecords.length === 0) {
      alert("暂无数据可同步。");
      return;
    }
    if (manualSyncing) {
      return;
    }
    console.log("[CloudSync] manual sync requested", {
      provider: effectiveProvider,
      recordCount: records.length,
    });
    setManualSyncing(true);
    try {
      const now = new Date();
      const date = now.toISOString().split("T")[0];
      const time = now.toTimeString().slice(0, 8).replace(/:/g, "");
      const snapshot = buildCloudSnapshot(
        {
          records: effectiveRecords,
          categories: effectiveCategories,
          changeLogs: effectiveChangeLogs,
          indicatorChangeLogs: effectiveIndicatorChangeLogs,
        },
        "web",
      );
      const payload = {
        fileName: `体检数据手动同步_${date}_${time}.json`,
        json: JSON.stringify(snapshot),
      };
      const status = await enqueueCloudUpload(effectiveProvider, payload);
      console.log("[CloudSync] manual sync finished", { status });
      if (status === "success") {
        alert("云端同步完成。");
      } else if (status === "waitingAuth") {
        alert("未检测到有效授权，请在云同步面板完成授权后重试。");
      } else {
        alert("云端同步失败，请检查网络或稍后重试。");
      }
    } finally {
      setManualSyncing(false);
    }
  };

  const handleCloudPull = async () => {
    if (cloudProvider === "none") {
      alert("请先在云同步中选择云存储平台。");
      return;
    }
    if (cloudProvider !== "googleDrive") {
      alert("网页端同步到本地当前仅支持 Google Drive。");
      return;
    }
    if (cloudPulling) {
      return;
    }
    console.log("[CloudSync] cloud pull requested", {
      provider: cloudProvider,
    });
    setCloudPulling(true);
    try {
      const remoteSnapshot = await fetchCloudSnapshot(false);
      if (!remoteSnapshot) {
        alert("云端个人文件夹中暂无备份数据。");
        return;
      }

      const localPayload: CloudSyncPayloadState = {
        records,
        categories: indicatorCategories,
        changeLogs,
        indicatorChangeLogs,
      };

      const localUpdatedAtMs = parseTimeValue(buildStateUpdatedAt(localPayload));
      const remoteUpdatedAtMs = parseTimeValue(remoteSnapshot.updatedAt);
      if (remoteUpdatedAtMs <= localUpdatedAtMs) {
        alert("云端数据并不比本地更新，已跳过同步。");
        return;
      }

      const merged = mergeCloudState(localPayload, remoteSnapshot.payload);
      setRecords(merged.payload.records);
      setIndicatorCategories(merged.payload.categories);
      setChangeLogs(merged.payload.changeLogs);
      setIndicatorChangeLogs(merged.payload.indicatorChangeLogs);
      setHistoryStack([]);
      setFutureStack([]);

      alert(
        `已同步云端更新：新增记录 ${merged.stats.addedRecords} 条，更新记录 ${merged.stats.updatedRecords} 条，更新分类 ${merged.stats.touchedCategories} 项。`,
      );
    } finally {
      setCloudPulling(false);
    }
  };
  const applyRecordsUpdate = (
    updater: (prev: HealthRecord[]) => HealthRecord[],
    buildLogs?: (prev: HealthRecord[], next: HealthRecord[]) => RecordChangeLogEntry[],
  ) => {
    setRecords(prev => {
      const next = updater(prev);
      if (next === prev) {
        return prev;
      }
      setHistoryStack(history => {
        const updatedHistory = [...history, prev];
        if (updatedHistory.length > 50) {
          updatedHistory.shift();
        }
        return updatedHistory;
      });
      setFutureStack([]);
      if (buildLogs) {
        setChangeLogs(logs => {
          const additions = buildLogs(prev, next) || [];
          if (additions.length === 0) {
            return logs;
          }
          return [...logs, ...additions];
        });
      }
      return next;
    });
  };

  const supabaseClientInstance = supabaseEnabled ? getSupabaseClient() : null;

  const handleEmailPasswordLogin = async (email: string, password: string) => {
    if (!supabaseClientInstance) {
      setAuthError("未检测到 Supabase 配置，无法登录。");
      return;
    }
    setAuthError(null);
    const safeEmail = email.trim().toLowerCase();
    if (!safeEmail) {
      setAuthError("请输入邮箱。");
      return;
    }
    if (!isStrongPassword(password)) {
      setAuthError(`密码强度不足：${strongPasswordHint}`);
      return;
    }
    try {
      const { error } = await supabaseClientInstance.auth.signInWithPassword({ email: safeEmail, password });
      if (error) {
        console.error("[Auth] email login error", error);
        const lowerMessage = (error.message || "").toLowerCase();
        if (lowerMessage.includes("invalid login credentials")) {
          setAuthError("登录失败：账号或密码错误，或该邮箱通过第三方登录创建且未设置密码。请使用 Google/GitHub 登录或先设置密码。");
        } else if (lowerMessage.includes("email not confirmed")) {
          setAuthError("该邮箱尚未验证，请先前往邮箱完成验证。");
        } else if (lowerMessage.includes("load failed") || lowerMessage.includes("failed to fetch")) {
          setAuthError("无法连接 Supabase（可能项目被冻结、网络异常或跨域被阻止）。");
        } else {
          setAuthError(error.message || "登录失败，请稍后重试。");
        }
      }
    } catch (error) {
      console.error("[Auth] email login unexpected error", error);
      const message = error instanceof Error ? error.message : "登录失败，请稍后重试。";
      if (message.toLowerCase().includes("load failed") || message.toLowerCase().includes("failed to fetch")) {
        setAuthError("无法连接 Supabase（可能项目被冻结、网络异常或跨域被阻止）。");
      } else {
        setAuthError(message);
      }
    }
  };

  const handleEmailPasswordSignUp = async (email: string, password: string) => {
    if (!supabaseClientInstance) {
      setAuthError("未检测到 Supabase 配置，无法注册。");
      return false;
    }
    setAuthError(null);
    const safeEmail = email.trim().toLowerCase();
    if (!safeEmail) {
      setAuthError("请输入邮箱。");
      return false;
    }
    if (!isStrongPassword(password)) {
      setAuthError(`密码强度不足：${strongPasswordHint}`);
      return false;
    }
    const redirectTo = window.location.origin + window.location.pathname;
    try {
      const { data, error } = await supabaseClientInstance.auth.signUp({
        email: safeEmail,
        password,
        options: {
          emailRedirectTo: redirectTo,
        },
      });
      if (error) {
        console.error("[Auth] sign up error", error);
        const lowerMessage = (error.message || "").toLowerCase();
        if (
          lowerMessage.includes("user already registered") ||
          lowerMessage.includes("user already exists") ||
          lowerMessage.includes("user_already_exists")
        ) {
          setAuthError("该邮箱已注册，请直接登录或使用找回密码。");
          return false;
        }
        if (lowerMessage.includes("load failed") || lowerMessage.includes("failed to fetch")) {
          setAuthError("无法连接 Supabase（可能项目被冻结、网络异常或跨域被阻止）。");
        } else {
          setAuthError(error.message || "注册失败，请稍后重试。");
        }
        return false;
      }
      if (data?.session) {
        try {
          await supabaseClientInstance.auth.signOut({ scope: "local" });
        } catch (signOutError) {
          console.warn("[Auth] sign out after signup failed", signOutError);
        }
      }
      alert("注册成功，请使用刚才的邮箱和密码登录。");
      return true;
    } catch (error) {
      console.error("[Auth] sign up unexpected error", error);
      const message = error instanceof Error ? error.message : "注册失败，请稍后重试。";
      if (message.toLowerCase().includes("load failed") || message.toLowerCase().includes("failed to fetch")) {
        setAuthError("无法连接 Supabase（可能项目被冻结、网络异常或跨域被阻止）。");
      } else {
        setAuthError(message);
      }
      return false;
    }
  };

  const handleResetPassword = async (email: string) => {
    if (!supabaseClientInstance) {
      setAuthError("未检测到 Supabase 配置，无法发送重置邮件。");
      return;
    }
    setAuthError(null);
    const redirectTo = window.location.origin + window.location.pathname;
    try {
      const { error } = await supabaseClientInstance.auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      if (error) {
        console.error("[Auth] reset password error", error);
        const lowerMessage = (error.message || "").toLowerCase();
        if (lowerMessage.includes("load failed") || lowerMessage.includes("failed to fetch")) {
          setAuthError("无法连接 Supabase（可能项目被冻结、网络异常或跨域被阻止）。");
        } else {
          setAuthError(error.message || "重置密码请求失败，请稍后重试。");
        }
      } else {
        alert("重置密码链接已发送至邮箱，请按邮件提示操作。");
      }
    } catch (error) {
      console.error("[Auth] reset password unexpected error", error);
      const message = error instanceof Error ? error.message : "重置密码请求失败，请稍后重试。";
      if (message.toLowerCase().includes("load failed") || message.toLowerCase().includes("failed to fetch")) {
        setAuthError("无法连接 Supabase（可能项目被冻结、网络异常或跨域被阻止）。");
      } else {
        setAuthError(message);
      }
    }
  };

  const handleOAuthLogin = async (provider: "google" | "github") => {
    if (!supabaseClientInstance) {
      setAuthError("未检测到 Supabase 配置，无法使用第三方登录。");
      return;
    }
    setAuthError(null);
    const redirectTo = window.location.origin + window.location.pathname;
    const queryParams = provider === "google" ? { prompt: "select_account" } : undefined;
    try {
      const { data, error } = await supabaseClientInstance.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams,
        },
      });
      if (error) {
        console.error("[Auth] oauth login error", { provider, error });
        setAuthError(error.message || "第三方登录失败，请稍后重试。");
        return;
      }
      const targetUrl = data?.url;
      if (targetUrl) {
        window.location.href = targetUrl;
        return;
      }
      setAuthError("无法获取第三方登录跳转地址，请检查 Supabase OAuth 配置或回调地址。");
    } catch (error) {
      console.error("[Auth] oauth login unexpected error", { provider, error });
      const message = error instanceof Error ? error.message : "第三方登录失败，请稍后重试。";
      setAuthError(message);
    }
  };

  const handleSetUserPassword = async (password: string) => {
    if (!supabaseClientInstance) {
      return "未检测到 Supabase 配置，无法设置密码。";
    }
    if (!isStrongPassword(password)) {
      return strongPasswordHint;
    }
    try {
      const { error } = await supabaseClientInstance.auth.updateUser({ password });
      if (error) {
        console.error("[Auth] update password error", error);
        return error.message || "设置密码失败，请稍后重试。";
      }
      alert("密码设置成功，可以使用邮箱密码登录。");
      return null;
    } catch (error) {
      console.error("[Auth] update password unexpected error", error);
      const message = error instanceof Error ? error.message : "设置密码失败，请稍后重试。";
      if (message.toLowerCase().includes("load failed") || message.toLowerCase().includes("failed to fetch")) {
        return "无法连接 Supabase（可能项目被冻结、网络异常或跨域被阻止）。";
      }
      return message;
    }
  };


  const handleSignOut = async () => {
    const redirectToLogin = () => {
      setSupabaseSession(null);
      clearSupabaseAuthStorage();
      if (typeof window !== "undefined") {
        const target = window.location.origin + window.location.pathname;
        window.location.href = target;
      }
    };

    if (!supabaseClientInstance) {
      redirectToLogin();
      return;
    }

    let signOutFailed = false;
    try {
      const { error } = await supabaseClientInstance.auth.signOut({
        scope: "global",
      });
      if (error) {
        console.error("[Auth] sign out error", error);
        signOutFailed = true;
      }
    } catch (error) {
      console.error("[Auth] sign out unexpected error", error);
      signOutFailed = true;
    }

    try {
      await supabaseClientInstance.auth.signOut({ scope: "local" });
    } catch (error) {
      console.error("[Auth] local sign out error", error);
    } finally {
      if (signOutFailed) {
        console.warn("[Auth] global sign out failed, cleared local session only.");
      }
      redirectToLogin();
    }
  };

  const handleAddRecord = (record: HealthRecord) => {
    const operationAt = record.operationAt ?? new Date().toISOString();
    const nextRecord = { ...record, operationAt };
    applyRecordsUpdate(
      prev => [...prev, nextRecord],
      () => [
        {
          id: createLogId(),
          timestamp: new Date().toISOString(),
          type: "create",
          recordId: nextRecord.id,
          before: null,
          after: nextRecord,
        },
      ],
    );
  };

  const handleImportRecords = (newRecords: HealthRecord[]) => {
    if (!newRecords || newRecords.length === 0) {
      return;
    }
    const importTimestamp = new Date().toISOString();
    const normalizedRecords = newRecords.map(record =>
      record.operationAt ? record : { ...record, operationAt: importTimestamp },
    );
    if (cloudProvider !== "none" && cloudAutoSync) {
      const date = new Date().toISOString().split("T")[0];
      const snapshot = buildCloudSnapshot(
        {
          records: [...records, ...normalizedRecords],
          categories: indicatorCategories,
          changeLogs,
          indicatorChangeLogs,
        },
        "web",
      );
      const payload = {
        fileName: `体检数据导入_${date}.json`,
        json: JSON.stringify(snapshot),
      };
      void (async () => {
        await enqueueCloudUpload(cloudProvider, payload);
      })();
    }
    applyRecordsUpdate(
      prev => [...prev, ...normalizedRecords],
      () => {
        const timestamp = new Date().toISOString();
        return normalizedRecords.map(record => ({
          id: createLogId(),
          timestamp,
          type: "create",
          recordId: record.id,
          before: null,
          after: record,
        }));
      },
    );
  };
  const handleDeleteRecord = (id: string) => {
    applyRecordsUpdate(
      prev => prev.filter(r => r.id !== id),
      (prev, next) => {
        const removed = prev.find(r => r.id === id);
        if (!removed) {
          return [];
        }
        return [
          {
            id: createLogId(),
            timestamp: new Date().toISOString(),
            type: "delete",
            recordId: id,
            before: removed,
            after: null,
          },
        ];
      },
    );
  };

  const handleClearAllRecords = () => {
    if (records.length === 0) {
      return;
    }
    const deletedCount = records.length;
    applyRecordsUpdate(
      () => [],
      (prev, next) => {
        if (prev.length === 0) {
          return [];
        }
        return [
          {
            id: createLogId(),
            timestamp: new Date().toISOString(),
            type: "clear",
            recordId: null,
            before: null,
            after: null,
          },
        ];
      },
    );
    localStorage.removeItem(CHART_VIEW_STORAGE_KEY);
    try {
      const scopedDeleteKey = buildUserStorageKey(DELETE_LOG_STORAGE_KEY, activeUserId);
      const raw = localStorage.getItem(scopedDeleteKey);
      const existing = raw ? JSON.parse(raw) : [];
      const entry = {
        timestamp: new Date().toISOString(),
        deletedCount,
      };
      const next = Array.isArray(existing) ? [...existing, entry] : [entry];
      safeSetItem(scopedDeleteKey, JSON.stringify(next));
    } catch {
    }

    // 清理旧版本数据 (如果有)
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(LEGACY_INDICATOR_STORAGE_KEY);
    localStorage.removeItem(LEGACY_CHANGE_LOG_STORAGE_KEY);
  };

  const handleUpdateRecord = (record: HealthRecord) => {
    const operationAt = new Date().toISOString();
    const nextRecord = { ...record, operationAt };
    applyRecordsUpdate(
      prev => prev.map(r => (r.id === record.id ? nextRecord : r)),
      (prev, next) => {
        const before = prev.find(r => r.id === record.id);
        if (!before) {
          return [];
        }
        return [
          {
            id: createLogId(),
            timestamp: new Date().toISOString(),
            type: "update",
            recordId: nextRecord.id,
            before,
            after: nextRecord,
          },
        ];
      },
    );
  };

  const handleAddFollowupRecord = (base: HealthRecord, payload: { date: string; value: number }) => {
    const newRecord: HealthRecord = {
      id: `${Date.now()}_${base.indicatorType}_${Math.random().toString(36).slice(2, 8)}`,
      date: payload.date,
      indicatorType: base.indicatorType,
      value: payload.value,
      unit: base.unit,
      operationAt: new Date().toISOString(),
    };
    applyRecordsUpdate(
      prev => [...prev, newRecord],
      () => [
        {
          id: createLogId(),
          timestamp: new Date().toISOString(),
          type: "create",
          recordId: newRecord.id,
          before: null,
          after: newRecord,
        },
      ],
    );
  };

  const handleRestoreFromLog = (log: RecordChangeLogEntry) => {
    if (log.type === "delete" && log.before) {
      const record = { ...log.before, operationAt: new Date().toISOString() };
      applyRecordsUpdate(
        prev => {
          if (prev.some(r => r.id === record.id)) {
            return prev;
          }
          return [...prev, record];
        },
        (prev) => {
          if (prev.some(r => r.id === record.id)) {
            return [];
          }
          return [
            {
              id: createLogId(),
              timestamp: new Date().toISOString(),
              type: "create",
              recordId: record.id,
              before: null,
              after: record,
            },
          ];
        },
      );
      return;
    }

    if (log.type === "update" && log.before) {
      const record = { ...log.before, operationAt: new Date().toISOString() };
      applyRecordsUpdate(
        prev => {
          const exists = prev.some(r => r.id === record.id);
          if (exists) {
            return prev.map(r => (r.id === record.id ? record : r));
          }
          return [...prev, record];
        },
        (prev) => {
          const existed = prev.find(r => r.id === record.id) || null;
          return [
            {
              id: createLogId(),
              timestamp: new Date().toISOString(),
              type: existed ? "update" : "create",
              recordId: record.id,
              before: existed,
              after: record,
            },
          ];
        },
      );
    }
  };

  // 撤销/重做按钮已移除，保留历史记录用于按条恢复

  const handleExport = (
    indicatorIds: string[] | null,
    format: "xlsx" | "csv",
    onProgress?: (value: number) => void,
  ) => {
    if (records.length === 0) {
      alert("暂无数据可导出");
      return;
    }

    const baseRecords =
      indicatorIds && indicatorIds.length > 0
        ? records.filter(record => indicatorIds.includes(record.indicatorType))
        : records;

    if (baseRecords.length === 0) {
      alert("所选指标暂无可导出的数据");
      return;
    }

    const isValidDateString = (value: string) => {
      if (!value) {
        return false;
      }
      const date = new Date(value);
      return !Number.isNaN(date.getTime());
    };

    const isValidNumberValue = (value: number) => {
      return typeof value === "number" && Number.isFinite(value);
    };

    let invalidTimeCount = 0;
    let invalidValueCount = 0;

    const filteredRecords = baseRecords.filter(record => {
      const invalidTime = !isValidDateString(record.date);
      const invalidValue = !isValidNumberValue(record.value);
      if (invalidTime) {
        invalidTimeCount++;
      }
      if (invalidValue) {
        invalidValueCount++;
      }
      return !invalidTime && !invalidValue;
    });

    if (filteredRecords.length === 0) {
      alert("数据校验后，所选指标暂无可导出的有效数据");
      return;
    }

    if (onProgress) {
      onProgress(5);
    }

    const indicatorOrder = indicatorCategories.flatMap(category =>
      category.items.map((item: IndicatorItem) => item.id),
    );
    const effectiveIndicatorIds = indicatorIds && indicatorIds.length > 0
      ? indicatorOrder.filter(id => indicatorIds.includes(id))
      : indicatorOrder;

    const recordMap = new Map<string, HealthRecord>();
    filteredRecords.forEach(record => {
      recordMap.set(`${record.date}__${record.indicatorType}`, record);
    });

    const formatDate = (value: string) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value;
      }
      return date.toISOString().split("T")[0];
    };

    const formatNumber = (value: number) => {
      if (Number.isInteger(value)) {
        return value;
      }
      return Number(value.toFixed(2));
    };

    const exportStats = {
      totalSheets: 0,
      emptySheets: 0,
      totalRows: 0,
    };

    if (format === "csv") {
      const uniqueDates = Array.from(
        new Set(filteredRecords.map(record => record.date)),
      ).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

      const headerRow = [
        "数据日期",
        ...effectiveIndicatorIds.map(id => {
          const info = indicatorItems.find(item => item.id === id);
          if (!info) {
            return id;
          }
          return info.unit ? `${info.label}(${info.unit})` : info.label;
        }),
      ];

      const bodyRows = uniqueDates.map(date => {
        const row: (string | number | "")[] = [formatDate(date)];
        effectiveIndicatorIds.forEach(id => {
          const key = `${date}__${id}`;
          const record = recordMap.get(key);
          if (!record) {
            row.push("");
          } else {
            row.push(formatNumber(record.value));
          }
        });
        return row;
      });

      const aoa = [headerRow, ...bodyRows];
      const escapeCSV = (value: unknown) => {
        const s = value === null || value === undefined ? "" : String(value);
        if (/[",\n]/.test(s)) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };
      const csvContent = aoa
        .map(row => row.map(cell => escapeCSV(cell)).join(","))
        .join("\n");
      const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const date = new Date().toISOString().split("T")[0];
      link.download = `体检数据_${date}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      if (onProgress) {
        onProgress(100);
      }
      return;
    }

    const wb = XLSX.utils.book_new();

    const logRows: string[][] = [["时间", "类型", "详情"]];
    const addLog = (type: string, detail: string) => {
        logRows.push([new Date().toLocaleTimeString(), type, detail]);
    };
    addLog("开始导出", "初始化导出任务");

    if (invalidTimeCount > 0 || invalidValueCount > 0) {
      if (invalidTimeCount > 0) {
        addLog("数据过滤", `已过滤无效时间字段记录 ${invalidTimeCount} 条`);
      }
      if (invalidValueCount > 0) {
        addLog("数据过滤", `已过滤无效数值记录 ${invalidValueCount} 条`);
      }
    }

    const indexRows: (string | number)[][] = [
      ["序号", "分类", "包含指标", "数据状态"],
    ];

    const categoriesForExport = indicatorCategories.filter(category => {
      const ids = category.items.map(item => item.id);
      const intersects = effectiveIndicatorIds.some(id => ids.includes(id));
      return intersects;
    });

    categoriesForExport.forEach((category, index) => {
      const categoryIndicatorIds = category.items
        .map(item => item.id)
        .filter(id => effectiveIndicatorIds.includes(id));
      
      const hasData = filteredRecords.some(r => categoryIndicatorIds.includes(r.indicatorType));

      const indicators = category.items
        .filter(item => effectiveIndicatorIds.includes(item.id))
        .map(item => (item.unit ? `${item.label}(${item.unit})` : item.label))
        .join("、");
      indexRows.push([index + 1, category.name, indicators || "-", hasData ? "有数据" : "无数据 (空白)"]);
    });

    const indexSheet = XLSX.utils.aoa_to_sheet(indexRows);
    XLSX.utils.book_append_sheet(wb, indexSheet, "目录");

    if (onProgress) {
      onProgress(30);
    }

    categoriesForExport.forEach((category, index) => {
      exportStats.totalSheets++;
      const categoryIndicatorIds = category.items
        .map(item => item.id)
        .filter(id => effectiveIndicatorIds.includes(id));
      if (categoryIndicatorIds.length === 0) {
        return;
      }

      // Filter records specifically for this category to determine valid dates
      const categoryRecords = filteredRecords.filter(r => categoryIndicatorIds.includes(r.indicatorType));

      if (categoryRecords.length === 0) {
        exportStats.emptySheets++;
        addLog("空数据跳过", `分类 [${category.name}] 无有效数据，生成空Sheet`);
        // Create empty sheet with headers only
         const headerRow = [
          "数据日期",
          ...categoryIndicatorIds.map(id => {
            const info = indicatorItems.find(item => item.id === id);
            if (!info) {
              return id;
            }
            return info.unit ? `${info.label}(${info.unit})` : info.label;
          }),
        ];
        const sheet = XLSX.utils.aoa_to_sheet([headerRow]);
        let sheetName = category.name;
        if (sheetName.length > 31) {
          sheetName = sheetName.slice(0, 31);
        }
        XLSX.utils.book_append_sheet(wb, sheet, sheetName);
        return;
      }

      const uniqueDates = Array.from(
        new Set(categoryRecords.map(record => record.date)),
      ).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

      exportStats.totalRows += uniqueDates.length;
      addLog("数据导出", `分类 [${category.name}] 导出 ${uniqueDates.length} 条记录`);

      const headerRow = [
        "数据日期",
        ...categoryIndicatorIds.map(id => {
          const info = indicatorItems.find(item => item.id === id);
          if (!info) {
            return id;
          }
          return info.unit ? `${info.label}(${info.unit})` : info.label;
        }),
      ];

      const bodyRows = uniqueDates.map(date => {
        const row: (string | number | "")[] = [formatDate(date)];
        categoryIndicatorIds.forEach(id => {
          const key = `${date}__${id}`;
          const record = recordMap.get(key);
          if (!record) {
            row.push("");
          } else {
            row.push(formatNumber(record.value));
          }
        });
        return row;
      });

      const aoa = [headerRow, ...bodyRows];
      const sheet = XLSX.utils.aoa_to_sheet(aoa);

      let sheetName = category.name;
      if (sheetName.length > 31) {
        sheetName = sheetName.slice(0, 31);
      }
      XLSX.utils.book_append_sheet(wb, sheet, sheetName);

      if (onProgress) {
        const base = 30;
        const perSheet = 70 / Math.max(categoriesForExport.length, 1);
        const value = Math.min(100, Math.floor(base + perSheet * (index + 1)));
        onProgress(value);
      }
    });

    // Append Log Sheet
    addLog("导出完成", `共导出 ${exportStats.totalSheets} 个Sheet，${exportStats.totalRows} 条数据`);
    const logSheet = XLSX.utils.aoa_to_sheet(logRows);
    XLSX.utils.book_append_sheet(wb, logSheet, "导出日志");

    const date = new Date().toISOString().split("T")[0];
    XLSX.writeFile(wb, `体检数据_${date}.xlsx`);
    
    console.log("Export completed:", exportStats);
    if (onProgress) {
      onProgress(100);
    }
  };

  if (supabaseEnabled) {
    if (authLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-100 via-blue-50 to-pink-50">
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 rounded-full bg-white/80 shadow-lg shadow-violet-100">
              <Loader2 className="w-6 h-6 text-violet-600 animate-spin" />
            </div>
            <div className="text-gray-700 text-sm">正在检测登录状态...</div>
            <div className="text-gray-400 text-xs">通常会在 3 秒内完成，如长时间无响应请检查网络。</div>
          </div>
        </div>
      );
    }
    if (!supabaseSession) {
      return (
        <LoginPage
          onLogin={handleEmailPasswordLogin}
          onSignUp={handleEmailPasswordSignUp}
          onResetPassword={handleResetPassword}
          onOAuthLogin={handleOAuthLogin}
          errorMessage={authError}
        />
      );
    }
  }

  const actionTriggerClassName = "h-10 w-full px-4 justify-center whitespace-nowrap text-sm";

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-blue-50 to-pink-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* 头部 */}
        <div className="mb-10">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-gradient-to-br from-violet-500 to-blue-500 rounded-2xl shadow-lg shadow-violet-200">
                <Activity className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-violet-600 via-blue-600 to-pink-600 bg-clip-text text-transparent">
                  体检数据管理
                </h1>
                <p className="text-gray-600 mt-2">智能记录，轻松管理您的健康数据</p>
              </div>
            </div>
            {supabaseEnabled && supabaseSession && (
              <div className="mt-2">
                <UserMenu
                  email={supabaseSession.user.email}
                  onConfirm={handleSignOut}
                  onSetPassword={handleSetUserPassword}
                />
              </div>
            )}
          </div>
          
          <div className="grid w-full grid-cols-2 items-center gap-3 pb-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              <AddRecordDialog
                onAddRecord={handleAddRecord}
                indicatorCategories={indicatorCategories}
                triggerClassName={actionTriggerClassName}
              />
              <IndicatorMaintenanceDialog
                categories={indicatorCategories}
                onChangeCategories={setIndicatorCategories}
                usedIndicatorIds={new Set(records.map(r => r.indicatorType))}
                indicatorChangeLogs={indicatorChangeLogs}
                onChangeIndicatorLogs={setIndicatorChangeLogs}
                triggerClassName={actionTriggerClassName}
              />
              <MedicalReportImportDialog
                onImportRecords={handleImportRecords}
                existingCategories={indicatorCategories.map(category => ({
                  id: category.id,
                  name: category.name,
                  code: category.code,
                  items: category.items.map(item => ({
                    id: item.id,
                    label: item.label,
                    unit: item.unit,
                    code: item.code,
                    referenceRange: item.referenceRange,
                    aliases: item.aliases,
                  })),
                }))}
                triggerClassName={actionTriggerClassName}
              />
              <ConsultationBriefDialog
                categories={indicatorCategories}
                records={records}
                triggerClassName={actionTriggerClassName}
              />
              <ImportRecordsDialog
                categories={indicatorCategories}
                onImportRecords={handleImportRecords}
                triggerClassName={actionTriggerClassName}
              />
              <ExportDialog
                categories={indicatorCategories}
                onExport={handleExport}
                triggerClassName={actionTriggerClassName}
              />
              <CloudSyncDialog
                provider={cloudProvider}
                autoSync={cloudAutoSync}
                tasks={cloudUploadTasks}
                availableStorageText={cloudAvailableStorageText}
                authConfig={authConfig}
                onChangeProvider={setCloudProvider}
                onToggleAutoSync={() => setCloudAutoSync(prev => !prev)}
                onUpdateAuthConfig={handleUpdateAuthConfig}
                onPullFromCloud={handleCloudPull}
                cloudPulling={cloudPulling}
                triggerClassName={actionTriggerClassName}
              />
              <Button
                variant="outline"
                disabled={manualSyncing}
                onClick={handleManualSync}
                className={cn(
                  "gap-2 bg-white/80 backdrop-blur-sm border-blue-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300 disabled:opacity-40 disabled:cursor-not-allowed",
                  actionTriggerClassName,
                )}
              >
                {manualSyncing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    正在同步
                  </>
                ) : (
                  <>
                    <CloudUpload className="w-4 h-4" />
                    立即同步
                  </>
                )}
              </Button>
              <ClearAllDataDialog
                disabled={records.length === 0}
                onConfirm={handleClearAllRecords}
                triggerClassName={actionTriggerClassName}
              />
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-white/60 backdrop-blur-xl border-0 shadow-xl shadow-violet-100/50 hover:shadow-2xl hover:shadow-violet-100/70 transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-violet-400 to-blue-400 rounded-lg">
                  <Database className="w-4 h-4 text-white" />
                </div>
                <CardDescription className="text-gray-600">总记录数</CardDescription>
              </div>
              <CardTitle className="text-4xl bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">
                {records.length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-white/60 backdrop-blur-xl border-0 shadow-xl shadow-blue-100/50 hover:shadow-2xl hover:shadow-blue-100/70 transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-blue-400 to-cyan-400 rounded-lg">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <CardDescription className="text-gray-600">检验指标种类</CardDescription>
              </div>
              <CardTitle className="text-4xl bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                {indicatorCategories.length}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="bg-white/60 backdrop-blur-xl border-0 shadow-xl shadow-pink-100/50 hover:shadow-2xl hover:shadow-pink-100/70 transition-all duration-300">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-pink-400 to-rose-400 rounded-lg">
                  <Calendar className="w-4 h-4 text-white" />
                </div>
                <CardDescription className="text-gray-600">最后更新</CardDescription>
              </div>
              <CardTitle className="text-xl bg-gradient-to-r from-pink-600 to-rose-600 bg-clip-text text-transparent">
                {records.length > 0
                  ? new Date(Math.max(...records.map(r => new Date(r.date).getTime()))).toLocaleDateString('zh-CN')
                  : "暂无数据"}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* 主内容区 */}
        <Tabs defaultValue="table" className="space-y-6">
          <TabsList className="bg-white/60 backdrop-blur-xl border-0 shadow-lg p-1">
            <TabsTrigger 
              value="table" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500 data-[state=active]:to-blue-500 data-[state=active]:text-white rounded-lg"
            >
              数据列表
            </TabsTrigger>
            <TabsTrigger 
              value="chart"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-pink-500 data-[state=active]:text-white rounded-lg"
            >
              图表分析
            </TabsTrigger>
            <TabsTrigger
              value="maintenance"
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-violet-500 data-[state=active]:to-blue-500 data-[state=active]:text-white rounded-lg"
            >
              数据维护
            </TabsTrigger>
          </TabsList>

          <TabsContent value="table">
            <Card className="bg-white/60 backdrop-blur-xl border-0 shadow-xl shadow-violet-100/50">
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle className="text-2xl bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">
                    指标数据
                  </CardTitle>
                  <CardDescription>按指标种类查看具体检测数据</CardDescription>
                </div>
                <Select
                  value={indicatorDataCategory?.id ?? ""}
                  onValueChange={(value: string) => setIndicatorDataCategoryId(value)}
                >
                  <SelectTrigger className="w-[220px] border-violet-200 focus:border-violet-400 focus:ring-violet-400 bg-white/80">
                    <SelectValue placeholder="选择检验指标种类" />
                  </SelectTrigger>
                  <SelectContent className="bg-white/95 backdrop-blur-xl border-violet-200">
                    {indicatorCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                {indicatorDataItems.length === 0 ? (
                  <div className="border border-violet-100 rounded-xl bg-white/40 h-40 flex flex-col items-center justify-center text-gray-400 text-sm">
                    暂无可展示的指标数据
                  </div>
                ) : indicatorDataRows.length === 0 ? (
                  <div className="border border-violet-100 rounded-xl bg-white/40 h-40 flex flex-col items-center justify-center text-gray-400 text-sm">
                    当前分类暂无数据
                  </div>
                ) : (
                  <div className="border border-violet-100 rounded-xl overflow-hidden bg-white/40">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-violet-100 bg-violet-50/60">
                          <TableHead className="text-gray-700 text-sm font-semibold w-32 py-3">数据日期</TableHead>
                          {indicatorDataItems.map(item => (
                            <TableHead key={item.id} className="text-gray-700 text-sm font-semibold py-3">
                              {item.label}
                              {item.unit && (
                                <span className="ml-1 text-[11px] text-gray-400">
                                  ({item.unit})
                                </span>
                              )}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {indicatorDataRows.map(row => (
                          <TableRow
                            key={String(row.date)}
                            className="border-violet-100 hover:bg-violet-50/40 transition-colors even:bg-white/60"
                          >
                            <TableCell className="text-sm text-gray-700 w-32 py-3">
                              {String(row.date)}
                            </TableCell>
                            {indicatorDataItems.map(item => (
                              <TableCell key={item.id} className="text-sm text-gray-700 py-3">
                                {formatIndicatorValue((row as Record<string, unknown>)[item.id])}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chart">
            <RecordChart
              records={records}
              indicators={indicatorItems}
              categories={indicatorCategories}
            />
          </TabsContent>
          <TabsContent value="maintenance">
            <Card className="bg-white/60 backdrop-blur-xl border-0 shadow-xl shadow-violet-100/50">
              <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-violet-400 to-blue-400 rounded-lg">
                    <History className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">
                      数据维护
                    </CardTitle>
                    <CardDescription>集中管理体检记录与修改历史</CardDescription>
                  </div>
                </div>
                <Select value={maintenanceCategoryId} onValueChange={setMaintenanceCategoryId}>
                  <SelectTrigger className="w-[220px] border-violet-200 focus:border-violet-400 focus:ring-violet-400 bg-white/80">
                    <SelectValue placeholder="全部指标分类" />
                  </SelectTrigger>
                  <SelectContent className="bg-white/95 backdrop-blur-xl border-violet-200">
                    <SelectItem value="__all__">全部指标分类</SelectItem>
                    {indicatorCategories.map(category => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <div className="text-sm font-medium text-gray-700 mb-3">记录列表</div>
                  <RecordTable
                    records={maintenanceRecords}
                    indicators={maintenanceIndicators}
                    onDeleteRecord={handleDeleteRecord}
                    onUpdateRecord={handleUpdateRecord}
                    onAddFollowupRecord={handleAddFollowupRecord}
                  />
                </div>
                <div>
                  <div className="text-base font-semibold bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent mb-3">
                    变更记录
                  </div>
                  {maintenanceLogs.length === 0 ? (
                    <div className="border border-violet-100 rounded-2xl bg-white/40 h-32 flex items-center justify-center text-gray-400 text-sm">
                      暂无变更记录
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                      {[...maintenanceLogs].reverse().slice(0, 50).map(log => {
                        const indicatorType =
                          log.after?.indicatorType ?? log.before?.indicatorType ?? "";
                        const indicator =
                          indicatorItems.find(item => item.id === indicatorType) ?? null;
                        const label = indicator ? indicator.label : indicatorType || "-";
                        const date = log.after?.date ?? log.before?.date ?? "-";
                        let actionLabel = "";
                        let actionTone = "text-gray-600 bg-gray-50 border-gray-100";
                        if (log.type === "create") {
                          actionLabel = "新增";
                          actionTone = "text-emerald-600 bg-emerald-50 border-emerald-100";
                        } else if (log.type === "update") {
                          actionLabel = "修改";
                          actionTone = "text-blue-600 bg-blue-50 border-blue-100";
                        } else if (log.type === "delete") {
                          actionLabel = "删除";
                          actionTone = "text-rose-600 bg-rose-50 border-rose-100";
                        } else if (log.type === "clear") {
                          actionLabel = "清空";
                          actionTone = "text-amber-600 bg-amber-50 border-amber-100";
                        }
                        let changeText = "";
                        if (log.type === "update" && log.before && log.after) {
                          changeText = `${log.before.value}${log.before.unit} → ${log.after.value}${log.after.unit}`;
                        } else if (log.type === "create" && log.after) {
                          changeText = `新增 ${log.after.value}${log.after.unit}`;
                        } else if (log.type === "delete" && log.before) {
                          changeText = `删除 ${log.before.value}${log.before.unit}`;
                        } else if (log.type === "clear") {
                          changeText = "清空所有体检记录";
                        }
                        const canRestore = (log.type === "delete" && log.before) || (log.type === "update" && log.before);
                        return (
                          <div
                            key={log.id}
                            className="flex flex-col gap-3 rounded-2xl border border-violet-100 bg-white/70 px-4 py-3 shadow-sm"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span className={`px-2 py-0.5 rounded-full border text-[11px] ${actionTone}`}>
                                  {actionLabel}
                                </span>
                                <span>{new Date(log.timestamp).toLocaleString("zh-CN")}</span>
                              </div>
                              {canRestore && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRestoreFromLog(log)}
                                  className="h-7 px-2 text-xs border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                                >
                                  <RotateCcw className="w-3 h-3 mr-1" />
                                  恢复
                                </Button>
                              )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-2 text-sm text-gray-700">
                              <div className="text-gray-500">数据日期</div>
                              <div>{date}</div>
                              <div className="text-gray-500">检验指标</div>
                              <div>{label}</div>
                              <div className="text-gray-500">变更内容</div>
                              <div>{changeText || "-"}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
