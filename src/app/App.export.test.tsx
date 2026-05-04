import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import * as XLSX from "xlsx";

const supabaseGetSessionMock = vi.fn();
const supabaseOnAuthStateChangeMock = vi.fn();

vi.mock("@supabase/supabase-js", async actualImport => {
  const actual = await actualImport<typeof import("@supabase/supabase-js")>();
  return {
    ...actual,
    createClient: vi.fn(() => {
      return {
        auth: {
          getSession: supabaseGetSessionMock,
          onAuthStateChange: supabaseOnAuthStateChangeMock,
          signInWithPassword: vi.fn(),
          signUp: vi.fn(),
          resetPasswordForEmail: vi.fn(),
          signInWithOAuth: vi.fn(),
          signOut: vi.fn(),
        },
      };
    }),
  };
});

import App, { testCloudConnection, exchangeGoogleDriveCodeForToken } from "./App";

const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string) {
      store[key] = value;
    },
    removeItem(key: string) {
      delete store[key];
    },
    clear() {
      store = {};
    },
  };
};

if (!(globalThis as any).localStorage) {
  (globalThis as any).localStorage = createLocalStorageMock();
}

describe("Excel 导出空指标与数据过滤", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.spyOn(window, "alert").mockImplementation(() => {});
    delete (window as any).VITE_SUPABASE_URL;
    delete (window as any).VITE_SUPABASE_ANON_KEY;
  });

  it("当某个指标分类无数据时，仅生成表头行的空 Sheet", async () => {
    const categories = [
      {
        id: "catWithData",
        name: "有数据分类",
        items: [{ id: "indWithData", label: "有数据指标", unit: "" }],
      },
      {
        id: "catEmpty",
        name: "空数据分类",
        items: [{ id: "indEmpty", label: "空指标", unit: "" }],
      },
    ];
    const records = [
      {
        id: "r1",
        indicatorType: "indWithData",
        date: "2024-01-01",
        value: 1,
      },
    ];

    localStorage.setItem("health_indicator_categories_v1", JSON.stringify(categories));
    localStorage.setItem("health_records_v1", JSON.stringify(records));

    const appendedSheets: { name: string; aoa: unknown[][] }[] = [];

    vi.spyOn(XLSX.utils, "book_new").mockReturnValue({ Sheets: {}, SheetNames: [] } as any);
    vi.spyOn(XLSX.utils, "aoa_to_sheet").mockImplementation((aoa: unknown[][]) => {
      return { __aoa: aoa } as any;
    });
    vi.spyOn(XLSX.utils, "book_append_sheet").mockImplementation((wb: any, sheet: any, name?: string) => {
      if (!name) {
        return;
      }
      if (!wb.Sheets) {
        wb.Sheets = {};
      }
      if (!wb.SheetNames) {
        wb.SheetNames = [];
      }
      wb.Sheets[name] = sheet;
      wb.SheetNames.push(name);
      appendedSheets.push({ name, aoa: sheet.__aoa });
    });
    render(<App />);

    const openButton = await screen.findByRole("button", { name: /导出Excel/ });
    fireEvent.click(openButton);

    const confirmButton = await screen.findByRole("button", { name: /开始导出/ });
    fireEvent.click(confirmButton);

    const emptyCategorySheet = appendedSheets.find(sheet => sheet.name === "空数据分类");
    expect(emptyCategorySheet).toBeTruthy();
    expect(emptyCategorySheet?.aoa.length).toBe(1);
  }, 15000);

  it("在导出前过滤无效时间字段并在导出日志中记录数据过滤情况", async () => {
    const categories = [
      {
        id: "cholesterolPanel",
        name: "血脂",
        items: [{ id: "cholesterol", label: "总胆固醇", unit: "mmol/L" }],
      },
    ];
    const records = [
      {
        id: "r1",
        indicatorType: "cholesterol",
        date: "",
        value: 5,
      },
      {
        id: "r2",
        indicatorType: "cholesterol",
        date: "invalid-date",
        value: 6,
      },
      {
        id: "r3",
        indicatorType: "cholesterol",
        date: "2024-01-01",
        value: null,
      },
      {
        id: "r4",
        indicatorType: "cholesterol",
        date: "2024-01-02",
        value: 7,
      },
    ];

    localStorage.setItem("health_indicator_categories_v1", JSON.stringify(categories));
    localStorage.setItem("health_records_v1", JSON.stringify(records));

    const appendedSheets: { name: string; aoa: unknown[][] }[] = [];

    vi.spyOn(XLSX.utils, "book_new").mockReturnValue({ Sheets: {}, SheetNames: [] } as any);
    vi.spyOn(XLSX.utils, "aoa_to_sheet").mockImplementation((aoa: unknown[][]) => {
      return { __aoa: aoa } as any;
    });
    vi.spyOn(XLSX.utils, "book_append_sheet").mockImplementation((wb: any, sheet: any, name?: string) => {
      if (!name) {
        return;
      }
      if (!wb.Sheets) {
        wb.Sheets = {};
      }
      if (!wb.SheetNames) {
        wb.SheetNames = [];
      }
      wb.Sheets[name] = sheet;
      wb.SheetNames.push(name);
      appendedSheets.push({ name, aoa: sheet.__aoa });
    });
    render(<App />);

    const openButton = await screen.findByRole("button", { name: /导出Excel/ });
    fireEvent.click(openButton);

    const confirmButton = await screen.findByRole("button", { name: /开始导出/ });
    fireEvent.click(confirmButton);

    const cholesterolSheet = appendedSheets.find(sheet => sheet.name === "血脂");
    expect(cholesterolSheet).toBeTruthy();
    expect(cholesterolSheet?.aoa.length).toBe(2);

    const logSheet = appendedSheets.find(sheet => sheet.name === "导出日志");
    expect(logSheet).toBeTruthy();
    const hasFilterLog = logSheet?.aoa.some((row, index) => {
      if (index === 0) {
        return false;
      }
      return row[1] === "数据过滤";
    });
    expect(hasFilterLog).toBe(true);
  }, 15000);
});

describe("云存储授权测试连接", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("未填写访问令牌时返回缺少令牌错误", async () => {
    const fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;

    const result = await testCloudConnection("googleDrive", "");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toBe("缺少访问令牌");
    }
  });

  it("Google Drive 令牌有效时返回账号与配额信息", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        user: { emailAddress: "tester@example.com" },
        storageQuota: {
          limit: String(10 * 1024 * 1024 * 1024),
          usage: String(2 * 1024 * 1024 * 1024),
        },
      }),
    } as any);
    (globalThis as any).fetch = fetchMock;

    const result = await testCloudConnection("googleDrive", "google-token-123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://www.googleapis.com/drive/v3/about?fields=user,storageQuota",
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.accountName).toBe("tester@example.com");
      expect(result.quotaText).toContain("存储使用：");
      expect(result.detailMessage).toBe(result.quotaText);
    }
  });

  it("Google Drive 返回非 2xx 状态时返回清晰错误信息", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    } as any);
    (globalThis as any).fetch = fetchMock;

    const result = await testCloudConnection("googleDrive", "expired-token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorMessage).toBe(
        "Google Drive 返回状态 401，请检查令牌是否有效以及是否具有访问云盘的权限。",
      );
    }
  });

  it("Google Drive 授权码成功交换为令牌时返回完整信息", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "google-access-token-1",
        refresh_token: "google-refresh-token-1",
        expires_in: 3600,
        scope:
          "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.metadata.readonly",
        token_type: "Bearer",
      }),
    } as any);

    const result = await exchangeGoogleDriveCodeForToken({
      code: "code-123",
      verifier: "verifier-xyz",
      clientId: "client-abc",
      redirectUri: "http://127.0.0.1:5173/",
      clientSecret: "secret-xyz",
      fetchImpl: fetchMock as any,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("https://oauth2.googleapis.com/token");
    const body = String(call[1]?.body || "");
    expect(body).toContain("code=code-123");
    expect(body).toContain("client_id=client-abc");
    expect(body).toContain("code_verifier=verifier-xyz");
    expect(body).toContain("client_secret=secret-xyz");

    expect(result.errorMessage).toBeUndefined();
    expect(result.tokenInfo).toBeTruthy();
    if (result.tokenInfo) {
      expect(result.tokenInfo.accessToken).toBe("google-access-token-1");
      expect(result.tokenInfo.refreshToken).toBe("google-refresh-token-1");
      expect(result.tokenInfo.expiresAt).toBeTruthy();
      if (result.tokenInfo.expiresAt) {
        expect(Number.isNaN(new Date(result.tokenInfo.expiresAt).getTime())).toBe(false);
      }
    }
  });

  it("Google Drive 授权缺少必要 scope 时返回错误", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "google-access-token-2",
        scope: "https://www.googleapis.com/auth/drive.metadata.readonly",
      }),
    } as any);

    const result = await exchangeGoogleDriveCodeForToken({
      code: "code-456",
      verifier: "verifier-xyz",
      clientId: "client-abc",
      redirectUri: "http://127.0.0.1:5173/",
      fetchImpl: fetchMock as any,
    });

    expect(result.tokenInfo).toBeUndefined();
    expect(result.errorMessage).toBeTruthy();
    if (result.errorMessage) {
      expect(result.errorMessage).toContain("权限");
    }
  });

  it("Google Drive token 请求缺少 client_secret 时返回清晰错误提示", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({
          error: "invalid_request",
          error_description: "client_secret is missing",
        }),
    } as any);

    const result = await exchangeGoogleDriveCodeForToken({
      code: "code-789",
      verifier: "verifier-xyz",
      clientId: "client-abc",
      redirectUri: "http://127.0.0.1:5173/",
      fetchImpl: fetchMock as any,
    });

    expect(result.tokenInfo).toBeUndefined();
    expect(result.errorMessage).toBeTruthy();
    if (result.errorMessage) {
      expect(result.errorMessage).toContain("client_secret");
      expect(result.errorMessage).toContain("Google Cloud Console");
    }
  });

});

describe("登录状态加载逻辑", () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseGetSessionMock.mockReset();
    supabaseOnAuthStateChangeMock.mockReset();
    (window as any).VITE_SUPABASE_URL = "https://test.supabase.co";
    (window as any).VITE_SUPABASE_ANON_KEY = "anon-key";
  });

  it("网络正常时快速完成登录状态判断并展示登录页", async () => {
    supabaseGetSessionMock.mockResolvedValue({
      data: { session: null },
      error: null,
    });
    supabaseOnAuthStateChangeMock.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });

    const { default: AppWithAuth } = await import("./App");

    const { queryByText } = render(<AppWithAuth />);

    await waitFor(() => {
      expect(queryByText("正在检测登录状态...")).toBeNull();
      expect(
        screen.getByText("登录后安全访问您的健康数据"),
      ).toBeTruthy();
    });
  });
});
