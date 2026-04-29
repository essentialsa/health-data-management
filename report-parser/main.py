"""体检报告解析服务 - FastAPI"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os

from parser.paddle_engine import PaddleEngine, get_ocr_status
from parser.table_extractor import extract_table_structure
from parser.date_extractor import extract_report_date

app = FastAPI(title="Medical Report Parser", version="1.0.0")

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
    return {
        "status": "ok",
        "model": ocr_status["engine"],
        "mock_mode": USE_MOCK,
        "ocr_ready": ocr_ready,
    }


@app.get("/api/healthz")
async def service_health_check():
    """Render 部署健康检查：只确认 Web 进程已启动。"""
    ocr_status = get_ocr_status(USE_MOCK)
    return {
        "status": "ok",
        "ocr_ready": ocr_status["available"],
        "model": ocr_status["engine"],
    }


@app.post("/api/parse", response_model=ParseResponse)
async def parse_report(file: UploadFile = File(...)):
    """解析体检报告 PDF/图片"""
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
        result = get_engine().parse_pdf(content, file.filename or "unknown")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"解析失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
