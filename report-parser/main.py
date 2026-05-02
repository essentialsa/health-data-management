"""体检报告解析服务 - FastAPI"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import logging
import os
import time

from parser.paddle_engine import PaddleEngine, get_ocr_status
from parser.table_extractor import extract_table_structure
from parser.date_extractor import extract_report_date

app = FastAPI(title="Medical Report Parser", version="1.0.0")

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper())
logger = logging.getLogger("medical-report-parser")

# CORS - 默认允许本地开发 + 已部署前端域名。
# 若需要允许任意来源可设置 ALLOWED_ORIGINS=*（此时会自动关闭 credentials）。
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,https://health-data-mgmt.vercel.app",
    ).split(",")
    if origin.strip()
]
ALLOW_ALL_ORIGINS = "*" in ALLOWED_ORIGINS
ALLOW_CREDENTIALS = os.getenv(
    "CORS_ALLOW_CREDENTIALS",
    "false" if ALLOW_ALL_ORIGINS else "true",
).lower() == "true"

if ALLOW_ALL_ORIGINS and ALLOW_CREDENTIALS:
    ALLOW_CREDENTIALS = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if ALLOW_ALL_ORIGINS else ALLOWED_ORIGINS,
    allow_credentials=ALLOW_CREDENTIALS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# 初始化引擎（默认使用真实 PaddleOCR）
USE_MOCK = os.getenv("USE_MOCK", "false").lower() == "true"
engine: Optional[PaddleEngine] = None


def get_engine() -> PaddleEngine:
    global engine
    if engine is None:
        engine = PaddleEngine(use_mock=USE_MOCK)
    return engine


@app.on_event("startup")
async def warmup_ocr_engine():
    """服务启动时预热 OCR，确保 Render 只上线可用实例。"""
    if USE_MOCK:
        logger.info("ocr_engine_warmup_skip mock_mode=true")
        return

    try:
        loaded_engine = get_engine()
        logger.info(
            "ocr_engine_warmup_done engine=%s config=%s",
            loaded_engine.backend,
            loaded_engine.runtime_config,
        )
    except Exception as exc:
        logger.exception("ocr_engine_warmup_failed: %s", exc)
        raise


class TableCell(BaseModel):
    row: int
    col: int
    text: str
    bbox: list


class ParsedTable(BaseModel):
    pageIndex: int
    cells: List[TableCell]


class ExtractedIndicator(BaseModel):
    rawLabel: str
    value: float
    unit: str
    referenceRange: Optional[str] = None
    pageIndex: int


class ParseResponse(BaseModel):
    success: bool
    pageCount: int
    reportDate: Optional[str] = None
    tables: List[ParsedTable]
    indicators: List[ExtractedIndicator]
    markdown: str
    error: Optional[str] = None


@app.get("/api/health")
async def health_check():
    ocr_status = get_ocr_status(USE_MOCK)
    ocr_ready = ocr_status["available"]
    if not ocr_ready:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "OCR 引擎未就绪：请检查 OCR_ENGINE 和系统依赖",
                "engine": ocr_status["engine"],
                "import_error": ocr_status["error"],
            },
        )
    loaded_engine = get_engine()
    return {
        "status": "ok",
        "model": ocr_status["engine"],
        "mock_mode": USE_MOCK,
        "ocr_ready": ocr_ready,
        "engine_config": loaded_engine.runtime_config if loaded_engine else {},
    }


@app.get("/api/healthz")
async def service_health_check():
    """Render 部署健康检查：确认 OCR 引擎依赖与初始化都就绪。"""
    ocr_status = get_ocr_status(USE_MOCK)
    if not ocr_status["available"]:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "OCR 引擎依赖不可用",
                "engine": ocr_status["engine"],
                "import_error": ocr_status["error"],
            },
        )
    try:
        loaded_engine = get_engine()
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "OCR 引擎初始化失败",
                "engine": ocr_status["engine"],
                "error": str(exc),
            },
        ) from exc
    return {
        "status": "ok",
        "ocr_ready": True,
        "model": ocr_status["engine"],
        "engine_config": loaded_engine.runtime_config if loaded_engine else {},
    }


@app.post("/api/parse", response_model=ParseResponse)
async def parse_report(file: UploadFile = File(...)):
    """解析体检报告 PDF/图片"""
    started_at = time.perf_counter()
    allowed_types = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/jpg",
    ]

    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()
    allowed_ext = (".pdf", ".jpg", ".jpeg", ".png")
    # 优先按 content-type 判断；若浏览器/客户端未正确传递，则退回扩展名兜底。
    if content_type not in allowed_types and not filename.endswith(allowed_ext):
        raise HTTPException(status_code=400, detail="不支持的文件类型")
    
    content = await file.read()
    
    if len(content) > 50 * 1024 * 1024:  # 50MB
        raise HTTPException(status_code=400, detail="文件大小超过 50MB 限制")
    
    try:
        logger.info(
            "ocr_parse_start filename=%s content_type=%s size_bytes=%d engine=%s",
            file.filename or "unknown",
            content_type or "unknown",
            len(content),
            get_ocr_status(USE_MOCK)["engine"],
        )
        result = get_engine().parse_pdf(content, file.filename or "unknown")
        logger.info(
            "ocr_parse_done filename=%s success=%s elapsed_sec=%.2f page_count=%s indicator_count=%s",
            file.filename or "unknown",
            result.get("success"),
            time.perf_counter() - started_at,
            result.get("pageCount"),
            len(result.get("indicators", [])),
        )
        return result
    except Exception as e:
        logger.exception(
            "ocr_parse_exception filename=%s elapsed_sec=%.2f",
            file.filename or "unknown",
            time.perf_counter() - started_at,
        )
        raise HTTPException(status_code=500, detail=f"解析失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
