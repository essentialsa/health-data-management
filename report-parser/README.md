# 体检报告解析服务

基于 FastAPI + PaddleOCR + LLM 结构化的体检报告解析服务，支持 PDF/JPG/PNG。

## 快速开始

### 本地运行（推荐）
```bash
cd report-parser
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Mock 模式（开发调试，无需 OCR 模型）
```bash
USE_MOCK=true uvicorn main:app --host 0.0.0.0 --port 8000
```

## API

### 健康检查
`GET /api/health`

### 解析报告
`POST /api/parse`（`multipart/form-data`，字段名 `file`）

## CORS 配置（异地访问必看）

默认允许：
- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `https://health-data-mgmt.vercel.app`

可通过环境变量覆盖：

```bash
# 多域名逗号分隔
ALLOWED_ORIGINS=https://your-frontend.vercel.app,http://localhost:5173

# 若要允许所有来源（调试用）
ALLOWED_ORIGINS=*
# ALLOWED_ORIGINS=* 时，服务会自动关闭 credentials
```

## 前端端点配置（云端优先 + 本地兜底）

前端会按顺序尝试 `VITE_REPORT_PARSER_URLS` 中的地址，并自动回退。

```bash
VITE_REPORT_PARSER_URLS=https://essentialsa-health-data-ocr.onrender.com,http://127.0.0.1:8000
```

如果只想配置一个端点，也可使用：

```bash
VITE_REPORT_PARSER_URL=https://essentialsa-health-data-ocr.onrender.com
```

## Render 部署

仓库根目录已提供 `render.yaml`，用于创建公网 OCR 服务：

```text
https://essentialsa-health-data-ocr.onrender.com
```

部署步骤：

```text
Render Dashboard -> New -> Blueprint -> Connect GitHub repo -> Deploy Blueprint
```

## LLM 结构化配置

当前方案不是直接把图片发给多模态模型，而是：
1. PaddleOCR 先识别图片/PDF 文本
2. 再把 OCR 文本交给大模型输出结构化指标
3. 如果大模型不可用，自动回退到本地规则解析

支持的环境变量：

```bash
OCR_LLM_ENABLED=true
OCR_LLM_API_KEY=your-openai-compatible-key
OCR_LLM_BASE_URL=https://api.openai.com/v1
OCR_LLM_MODEL=gpt-4o-mini
OCR_LLM_TIMEOUT_SEC=45
OCR_LLM_MAX_OUTPUT_TOKENS=1600
```

## 性能参考
- CPU：约 2-5 秒/页
- GPU：约 <1 秒/页
- Mock：近实时返回
