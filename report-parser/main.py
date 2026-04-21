"""体检报告解析服务 - FastAPI"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import os

from parser.paddle_engine import PaddleEngine
from parser.table_extractor import extract_table_structure
from parser.date_extractor import extract_report_date

app = FastAPI(title="Medical Report Parser", version="1.0.0")

# CORS - 允许前端本地访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化引擎（默认 mock 模式）
USE_MOCK = os.getenv("USE_MOCK", "true").lower() == "true"
engine = PaddleEngine(use_mock=USE_MOCK)


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


@app.get("/api/health")
async def health_check():
    return {"status": "ok", "model": "PaddleOCR-VL-1.5", "mock_mode": USE_MOCK}


@app.post("/api/parse", response_model=ParseResponse)
async def parse_report(file: UploadFile = File(...)):
    """解析体检报告 PDF/图片"""
    # 验证文件类型
    allowed_types = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/jpg",
    ]
    
    if file.content_type not in allowed_types and not file.filename:
        raise HTTPException(status_code=400, detail="不支持的文件类型")
    
    content = await file.read()
    
    if len(content) > 50 * 1024 * 1024:  # 50MB
        raise HTTPException(status_code=400, detail="文件大小超过 50MB 限制")
    
    try:
        result = engine.parse_pdf(content, file.filename or "unknown")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"解析失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)