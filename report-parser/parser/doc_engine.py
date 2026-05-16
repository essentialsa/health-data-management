"""文档提取引擎 - OpenDataLoader PDF + Pillow 图片转 PDF

职责：只做文字/表格提取，不做指标正则解析。结构化交给 LLM。
"""
import gc
import io
import logging
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

from PIL import Image

from parser.llm_structurer import LLMStructurer

try:
    import opendataloader_pdf
    ODL_AVAILABLE = True
    ODL_IMPORT_ERROR = None
except Exception as exc:
    ODL_AVAILABLE = False
    ODL_IMPORT_ERROR = repr(exc)

logger = logging.getLogger("medical-report-parser")


def get_engine_status(use_mock: bool = False) -> Dict[str, Any]:
    if use_mock:
        return {"engine": "mock", "available": True, "error": None}
    return {
        "engine": "opendataloader",
        "available": ODL_AVAILABLE,
        "error": ODL_IMPORT_ERROR,
    }


class DocEngine:
    """OpenDataLoader PDF 文档提取引擎"""

    def __init__(self, use_mock: bool = False):
        self.use_mock = use_mock
        self.backend = "mock" if use_mock else "opendataloader"
        self._llm_structurer = LLMStructurer()
        self.runtime_config: Dict[str, Any] = {
            "engine": self.backend,
            "llm_structuring": self._llm_structurer.runtime_config,
        }
        if not use_mock and not ODL_AVAILABLE:
            raise RuntimeError(f"OpenDataLoader PDF 不可用: {ODL_IMPORT_ERROR}")

    def parse_pdf(self, file_content: bytes, filename: str = "report.pdf") -> dict:
        if self.use_mock:
            return self._mock_parse(file_content, filename)
        return _real_parse(file_content, filename, self._llm_structurer)

    @staticmethod
    def _mock_parse(file_content: bytes, filename: str) -> dict:
        return {
            "success": True,
            "pageCount": 1,
            "reportDate": "2024-01-01",
            "tables": [],
            "indicators": [
                {"rawLabel": "白细胞(WBC)", "value": 6.5, "unit": "×10^9/L", "referenceRange": "3.5-9.5", "pageIndex": 0},
                {"rawLabel": "血红蛋白(HGB)", "value": 145.0, "unit": "g/L", "referenceRange": "130-175", "pageIndex": 0},
            ],
            "markdown": "| 检验项目 | 结果 | 单位 | 参考范围 |\n|---|---|---|---|\n| 白细胞(WBC) | 6.5 | ×10^9/L | 3.5-9.5 |\n| 血红蛋白(HGB) | 145 | g/L | 130-175 |",
        }


def _is_pdf(file_content: bytes, filename: str) -> bool:
    return file_content.startswith(b"%PDF") or filename.lower().endswith(".pdf")


def _image_to_pdf_bytes(image_bytes: bytes) -> bytes:
    """将图片字节转为单页 PDF 字节"""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="PDF")
    return buf.getvalue()


def _extract_with_odl(pdf_bytes: bytes) -> Dict[str, Any]:
    """用 OpenDataLoader PDF 提取 PDF 内容"""
    input_tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    input_tmp.write(pdf_bytes)
    input_tmp.close()
    output_dir = tempfile.mkdtemp(prefix="odl_out_")

    try:
        opendataloader_pdf.convert(
            input_path=input_tmp.name,
            output_dir=output_dir,
            format="markdown",
        )

        # 读取输出目录中的 .md 文件
        markdown_parts: List[str] = []
        md_files = sorted(Path(output_dir).rglob("*.md"))
        if md_files:
            for md_file in md_files:
                content = md_file.read_text(encoding="utf-8", errors="replace")
                if content.strip():
                    markdown_parts.append(content)

        # 如果没有 .md 文件，尝试读取其他文本文件
        if not markdown_parts:
            for ext in ("*.txt", "*.html", "*.json"):
                for f in sorted(Path(output_dir).rglob(ext)):
                    content = f.read_text(encoding="utf-8", errors="replace")
                    if content.strip():
                        markdown_parts.append(content)
                        break
                if markdown_parts:
                    break

        # 最后兜底：读取输出目录下所有文件
        if not markdown_parts:
            for f in sorted(Path(output_dir).iterdir()):
                if f.is_file():
                    try:
                        content = f.read_text(encoding="utf-8", errors="replace")
                        if content.strip():
                            markdown_parts.append(content)
                    except Exception:
                        continue

        all_text = "\n\n".join(markdown_parts)
        if not all_text.strip():
            raise RuntimeError("OpenDataLoader PDF 未提取到任何文本内容")

        return {
            "page_count": max(1, len(markdown_parts)),
            "markdown": all_text,
            "all_text": all_text,
        }
    finally:
        try:
            os.unlink(input_tmp.name)
        except OSError:
            pass
        try:
            shutil.rmtree(output_dir, ignore_errors=True)
        except Exception:
            pass


def _extract_date_from_text(text: str) -> Optional[str]:
    """从文本中提取报告日期"""
    import re
    patterns = [
        r"(\d{4})[年/\-.](\d{1,2})[月/\-.](\d{1,2})[日]?",
        r"(\d{4})\s+(\d{1,2})\s+(\d{1,2})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            year, month, day = match.groups()
            try:
                return f"{year}-{int(month):02d}-{int(day):02d}"
            except (ValueError, TypeError):
                continue
    return None


def _real_parse(file_content: bytes, filename: str, llm_structurer: LLMStructurer) -> dict:
    """提取文档内容 → LLM 结构化"""
    try:
        # 图片转 PDF
        if _is_pdf(file_content, filename):
            pdf_bytes = file_content
        else:
            pdf_bytes = _image_to_pdf_bytes(file_content)

        # OpenDataLoader 提取
        extracted = _extract_with_odl(pdf_bytes)
        page_count = extracted["page_count"]
        markdown = extracted["markdown"]
        all_text = extracted["all_text"]

        if not all_text.strip():
            raise RuntimeError("未能从文档中提取到文本内容")

        report_date = _extract_date_from_text(all_text)

        # 构建 LLM 所需的 page_contexts
        page_contexts = [{
            "pageIndex": 0,
            "allText": all_text[:7000],
            "markdown": markdown[:3500],
        }]

        # LLM 结构化（只传空的 heuristic_indicators，让 LLM 全权处理）
        llm_result = llm_structurer.structure_report(
            page_count=page_count,
            report_date_candidate=report_date,
            page_contexts=page_contexts,
            heuristic_indicators=[],
        )

        indicators: List[Dict[str, Any]] = []
        if llm_result:
            llm_report_date = llm_result.get("reportDate")
            llm_indicators = llm_result.get("indicators") or []
            if llm_report_date:
                report_date = llm_report_date
            if llm_indicators:
                indicators = llm_indicators
                logger.info(
                    "llm_structuring_applied page_count=%s indicator_count=%s model=%s",
                    page_count, len(indicators),
                    llm_structurer.runtime_config.get("model"),
                )

        return {
            "success": True,
            "pageCount": page_count,
            "reportDate": report_date,
            "tables": [],
            "indicators": indicators,
            "markdown": markdown,
        }
    except Exception as e:
        return {
            "success": False,
            "pageCount": 0,
            "reportDate": None,
            "tables": [],
            "indicators": [],
            "markdown": "",
            "error": str(e),
        }
