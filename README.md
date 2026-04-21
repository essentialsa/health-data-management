# 🏥 Health Data Management Site

> 健康数据管理系统 — 支持体检报告 OCR 识别导入、数据可视化、云同步

[![React](https://img.shields.io/badge/React-18-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.3-646CFF.svg)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Auth-Supabase-3ECF8E.svg)](https://supabase.com/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind-4.1-06B6D4.svg)](https://tailwindcss.com/)

---

## ✨ 功能特性

### 📊 数据管理
- **手动录入** — 按分类手动添加健康指标数据
- **批量导入** — 支持 Excel/CSV 格式的批量数据导入
- **数据导出** — 导出为 Excel 格式，支持按分类筛选

### 📄 体检报告 OCR 导入
- **智能识别** — 自动识别体检报告中的指标数据
- **多格式支持** — 支持 PDF、JPG、PNG 格式
- **指标匹配** — 自动匹配系统内置的 50+ 指标分类
- **置信度评分** — 高/中/低三级置信度，确保数据准确性
- **未匹配处理** — 未识别指标归入"未命名"区域，用户可自行命名

### 📈 数据可视化
- **趋势图表** — 多指标趋势对比，支持时间范围筛选
- **分类管理** — 可自定义指标分类和项目
- **变更历史** — 完整的指标修改变更记录

### ☁️ 云同步
- **Supabase 认证** — 安全的用户登录和权限管理
- **Google Drive 备份** — 支持 Google Drive 云端数据备份
- **自动同步** — 可配置导入后自动上传

### 🎨 UI/UX
- **现代设计** — 简洁优雅的渐变色界面
- **响应式布局** — 适配桌面和移动端
- **流畅动画** — 精心设计的交互动画

---

## 🛠️ 技术栈

| 类别 | 技术 |
|------|------|
| **前端框架** | React 18 + TypeScript |
| **构建工具** | Vite 6 |
| **UI 组件** | Radix UI (shadcn/ui) + TailwindCSS |
| **图表** | Recharts |
| **认证** | Supabase Auth |
| **后端解析** | FastAPI + PaddleOCR-VL (Mock) |
| **云存储** | Google Drive API |
| **测试** | Vitest + Playwright |

---

## 📦 快速开始

### 前置要求

- Node.js ≥ 18
- pnpm ≥ 8
- Python 3.11+（可选，用于后端 OCR 服务）

### 安装

```bash
# 克隆项目
git clone https://github.com/essentialsa/health-data-management.git
cd health-data-management

# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的 Supabase 和 Google Drive 配置

# 启动开发服务器
pnpm dev
```

### 环境变量

创建 `.env` 文件并填入以下配置：

```env
# Supabase 配置
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_SYNC_TABLE=health_sync_snapshots

# Google Drive OAuth
VITE_GOOGLE_DRIVE_CLIENT_ID=your-client-id
VITE_GOOGLE_DRIVE_CLIENT_SECRET=your-client-secret
VITE_GOOGLE_DRIVE_REDIRECT_URI=http://localhost:5173/
```

#### 🔑 如何获取密钥

**Supabase 密钥获取：**
1. 访问 [supabase.com](https://supabase.com/) 注册账号
2. 创建新项目，进入 **Settings → API**
3. 复制 `Project URL` → `VITE_SUPABASE_URL`
4. 复制 `anon public` key → `VITE_SUPABASE_ANON_KEY`

**Google Drive OAuth 密钥获取：**
1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 创建或选择项目 → 启用 **Google Drive API**
3. 进入 **APIs & Services → OAuth consent screen**，配置应用信息
4. 进入 **Credentials → Create Credentials → OAuth client ID**
5. 选择 **Web application**，添加授权回调地址
6. 复制 `Client ID` → `VITE_GOOGLE_DRIVE_CLIENT_ID`
7. 复制 `Client Secret` → `VITE_GOOGLE_DRIVE_CLIENT_SECRET`

### 构建生产版本

```bash
pnpm build
pnpm preview
```

---

## 🏗️ 项目结构

```
Health Data Management Site/
├── src/
│   ├── app/
│   │   ├── components/          # React 组件
│   │   │   ├── MedicalReportImportDialog.tsx  # 体检报告导入
│   │   │   ├── ImportRecordsDialog.tsx        # Excel/CSV 导入
│   │   │   ├── AddRecordDialog.tsx            # 手动录入
│   │   │   ├── RecordTable.tsx                # 数据表格
│   │   │   ├── RecordChart.tsx                # 趋势图表
│   │   │   └── ui/                            # shadcn/ui 组件
│   │   ├── services/
│   │   │   └── medicalReport.ts               # 报告解析 + 指标匹配
│   │   └── App.tsx                            # 主应用
│   └── index.css                              # 全局样式
├── report-parser/                             # 后端 OCR 服务
│   ├── main.py                                # FastAPI 入口
│   ├── parser/
│   │   ├── paddle_engine.py                   # PaddleOCR 引擎
│   │   ├── table_extractor.py                 # 表格提取
│   │   └── date_extractor.py                  # 日期提取
│   └── tests/
├── .env                                       # 环境变量
├── vite.config.ts
├── package.json
└── README.md
```

---

## 🧪 测试

```bash
# 运行单元测试
pnpm test

# 运行 E2E 测试
node e2e-final.cjs
```

---

## 📸 截图

### 登录页面
![登录](screenshots/demo/01-homepage.png)

### 报告导入
![报告导入](screenshots/demo/03-dialog.png)

### 数据看板
![数据看板](screenshots/demo/06-dashboard.png)

---

## 🔐 测试账号

项目使用 Supabase 认证，你可以通过以下方式创建测试账号：

1. 访问 http://localhost:5173
2. 点击"注册"标签
3. 输入邮箱和密码完成注册

或者使用 API 直接创建：

```bash
curl -X POST "https://your-project.supabase.co/auth/v1/signup" \
  -H "apikey: your-anon-key" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123456!"}'
```

---

## 📝 开发计划

- [ ] 支持更多体检报告格式（PDF 结构化解析）
- [ ] 增加更多指标分类（50+ → 100+）
- [ ] 移动端适配优化
- [ ] 多语言支持（中/英/日）
- [ ] 数据分享功能
- [ ] AI 健康建议

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📄 许可证

MIT License

---

**Made with ❤️ by LeoClaw**
