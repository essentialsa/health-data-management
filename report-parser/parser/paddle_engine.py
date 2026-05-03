"""PaddleOCR 引擎封装 - PaddleOCR 2.7.3（Render 默认 PP-OCRv2）"""
import io
import os
import re
from typing import Optional, List, Dict, Any
from PIL import Image
import numpy as np

try:
    from paddleocr import PaddleOCR
    PADDLE_AVAILABLE = True
    PADDLE_IMPORT_ERROR = None
except Exception as exc:
    PADDLE_AVAILABLE = False
    PADDLE_IMPORT_ERROR = repr(exc)

try:
    import pytesseract
    from pytesseract import Output
    TESSERACT_AVAILABLE = True
    TESSERACT_IMPORT_ERROR = None
except Exception as exc:
    pytesseract = None  # type: ignore[assignment]
    Output = None  # type: ignore[assignment]
    TESSERACT_AVAILABLE = False
    TESSERACT_IMPORT_ERROR = repr(exc)

try:
    import fitz
    PDF_RENDER_AVAILABLE = True
except ImportError:
    fitz = None  # type: ignore[assignment]
    PDF_RENDER_AVAILABLE = False


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _resolve_model_dir(env_name: str, default_path: str) -> Optional[str]:
    configured = os.getenv(env_name, "").strip()
    candidate = configured or default_path
    if candidate and os.path.isdir(candidate):
        return candidate
    return None


def get_ocr_status(use_mock: bool = False) -> Dict[str, Any]:
    requested_engine = os.getenv("OCR_ENGINE", "paddle").strip().lower()
    if use_mock:
        return {"engine": "mock", "available": True, "error": None}

    # 兼容旧配置：线上曾使用 tesseract，现统一收敛到 paddle，避免继续走低精度路径。
    if requested_engine in ("tesseract", "tesseract-ocr", "", "default"):
        requested_engine = "paddle"

    if requested_engine == "paddle":
        return {
            "engine": "paddle",
            "available": PADDLE_AVAILABLE,
            "error": PADDLE_IMPORT_ERROR,
        }

    if requested_engine == "auto":
        return {
            "engine": "paddle",
            "available": PADDLE_AVAILABLE,
            "error": PADDLE_IMPORT_ERROR,
        }

    return {
        "engine": requested_engine,
        "available": False,
        "error": f"未知 OCR_ENGINE: {requested_engine}",
    }


class PaddleEngine:
    """PaddleOCR 解析引擎"""

    def __init__(self, use_mock: bool = False):
        self.use_mock = use_mock
        self._ocr = None
        self.runtime_config: Dict[str, Any] = {}
        self.backend = "mock" if use_mock else get_ocr_status(use_mock)["engine"]

        if use_mock:
            return

        if self.backend == "paddle":
            if not PADDLE_AVAILABLE:
                raise RuntimeError(f"PaddleOCR 不可用: {PADDLE_IMPORT_ERROR}")

            # Render 免费实例在部分 CPU 指令集上会触发 SIGILL，
            # 这里关闭 IR 优化并限制线程，优先保证 PaddleOCR 可用性。
            ocr_version = os.getenv("PADDLE_OCR_VERSION", "PP-OCRv2").strip() or "PP-OCRv2"
            ir_optim = _env_bool("PADDLE_IR_OPTIM", False)
            enable_mkldnn = _env_bool("PADDLE_ENABLE_MKLDNN", False)
            cpu_threads = max(1, int(os.getenv("PADDLE_CPU_THREADS", "1")))
            # Render free(512Mi) 在加载 det/rec/cls 三套模型时容易 OOM。
            # 体检单大多是正向扫描件，默认关闭角度分类器，优先保证线上稳定。
            use_angle_cls = _env_bool("PADDLE_USE_ANGLE_CLS", False)

            # PP-OCRv2 在低规格 CPU 上兼容性更高，默认使用 CRNN 并适配 rec_image_shape。
            is_legacy_v2 = "v2" in ocr_version.lower()
            rec_algorithm = os.getenv("PADDLE_REC_ALGORITHM", "CRNN" if is_legacy_v2 else "").strip()
            rec_image_shape = os.getenv("PADDLE_REC_IMAGE_SHAPE", "3,32,320" if is_legacy_v2 else "3,48,320").strip()
            det_model_dir = _resolve_model_dir(
                "PADDLE_DET_MODEL_DIR",
                "/opt/paddleocr/models/ch_PP-OCRv2_det_infer",
            )
            rec_model_dir = _resolve_model_dir(
                "PADDLE_REC_MODEL_DIR",
                "/opt/paddleocr/models/ch_PP-OCRv2_rec_infer",
            )
            cls_model_dir = _resolve_model_dir(
                "PADDLE_CLS_MODEL_DIR",
                "/opt/paddleocr/models/ch_ppocr_mobile_v2.0_cls_infer",
            ) if use_angle_cls else None

            paddle_kwargs: Dict[str, Any] = {
                "use_angle_cls": use_angle_cls,
                "lang": "ch",
                "show_log": False,
                "use_gpu": False,
                "ir_optim": ir_optim,
                "enable_mkldnn": enable_mkldnn,
                "cpu_threads": cpu_threads,
                "ocr_version": ocr_version,
                "rec_image_shape": rec_image_shape,
            }
            if det_model_dir:
                paddle_kwargs["det_model_dir"] = det_model_dir
            if rec_model_dir:
                paddle_kwargs["rec_model_dir"] = rec_model_dir
            if cls_model_dir:
                paddle_kwargs["cls_model_dir"] = cls_model_dir
            if rec_algorithm:
                paddle_kwargs["rec_algorithm"] = rec_algorithm

            self._ocr = PaddleOCR(**paddle_kwargs)
            self.runtime_config = {
                "ocr_version": ocr_version,
                "rec_algorithm": rec_algorithm or "default",
                "rec_image_shape": rec_image_shape,
                "use_angle_cls": use_angle_cls,
                "ir_optim": ir_optim,
                "enable_mkldnn": enable_mkldnn,
                "cpu_threads": cpu_threads,
                "det_model_dir": det_model_dir or "auto-download",
                "rec_model_dir": rec_model_dir or "auto-download",
                "cls_model_dir": cls_model_dir or "auto-download",
            }
            return

        if self.backend == "tesseract":
            if not TESSERACT_AVAILABLE:
                raise RuntimeError(f"Tesseract OCR 不可用: {TESSERACT_IMPORT_ERROR}")
            return

        raise RuntimeError(f"未知 OCR 引擎: {self.backend}")

    def parse_pdf(self, file_content: bytes, filename: str = "report.pdf") -> dict:
        """解析 PDF 或图片文件，返回结构化数据"""
        if self.use_mock:
            return self._mock_parse(file_content, filename)
        return self._real_parse(file_content, filename)

    def _real_parse(self, file_content: bytes, filename: str) -> dict:
        """真实 PaddleOCR 解析"""
        if self.backend == "paddle" and not self._ocr:
            raise RuntimeError("PaddleOCR 未安装")

        try:
            ocr_results = self._run_ocr(file_content, filename)
            tables: List[Dict[str, Any]] = []
            indicators: List[Dict[str, Any]] = []
            markdown_sections: List[str] = []
            report_date: Optional[str] = None
            all_text_parts: List[str] = []

            for page_index, ocr_result in enumerate(ocr_results):
                page_result = self._parse_single_page(ocr_result, page_index)
                tables.extend(page_result["tables"])
                indicators.extend(page_result["indicators"])
                if page_result["markdown"]:
                    markdown_sections.append(page_result["markdown"])
                if not report_date and page_result["reportDate"]:
                    report_date = page_result["reportDate"]
                if page_result["allText"]:
                    all_text_parts.append(page_result["allText"])

            if not report_date and all_text_parts:
                report_date = self._extract_date(" ".join(all_text_parts))

            return {
                "success": True,
                "pageCount": max(1, len(ocr_results)),
                "reportDate": report_date,
                "tables": tables,
                "indicators": indicators,
                "markdown": "\n\n".join(markdown_sections),
            }
        except Exception as e:
            return {
                "success": False,
                "pageCount": 0,
                "reportDate": None,
                "tables": [],
                "indicators": [],
                "markdown": "",
                "error": str(e)
            }

    def _run_ocr(self, file_content: bytes, filename: str):
        if self._is_pdf(file_content, filename):
            page_images = self._render_pdf_pages(file_content)
        else:
            image = self._prepare_image_for_ocr(Image.open(io.BytesIO(file_content)).convert("RGB"))
            page_images = [np.array(image)]

        if not page_images:
            raise RuntimeError("未能读取到可解析的页面内容")

        if self.backend == "tesseract":
            return [self._run_tesseract(page_image) for page_image in page_images]

        return [self._ocr.ocr(page_image, cls=True) for page_image in page_images]

    def _run_tesseract(self, page_image: np.ndarray):
        """将 Tesseract 输出转换为 PaddleOCR 兼容结构。"""
        if not pytesseract or not Output:
            raise RuntimeError("Tesseract OCR 未安装")

        image = Image.fromarray(page_image)
        lang = os.getenv("TESSERACT_LANG", "chi_sim+eng")
        config = os.getenv("TESSERACT_CONFIG", "--oem 1 --psm 6")
        data = pytesseract.image_to_data(image, lang=lang, config=config, output_type=Output.DICT)

        line_groups: Dict[tuple, List[Dict[str, Any]]] = {}
        for i, text in enumerate(data.get("text", [])):
            text = (text or "").strip()
            if not text:
                continue

            try:
                confidence = float(data.get("conf", [0])[i])
            except (TypeError, ValueError):
                confidence = 0.0

            key = (
                data.get("block_num", [0])[i],
                data.get("par_num", [0])[i],
                data.get("line_num", [0])[i],
            )
            line_groups.setdefault(key, []).append({
                "text": text,
                "confidence": confidence,
                "left": int(data.get("left", [0])[i]),
                "top": int(data.get("top", [0])[i]),
                "width": int(data.get("width", [0])[i]),
                "height": int(data.get("height", [0])[i]),
            })

        lines = []
        for group in line_groups.values():
            x_min = min(item["left"] for item in group)
            y_min = min(item["top"] for item in group)
            x_max = max(item["left"] + item["width"] for item in group)
            y_max = max(item["top"] + item["height"] for item in group)
            text = " ".join(item["text"] for item in group)
            confidence = sum(item["confidence"] for item in group) / max(1, len(group))
            lines.append([
                [[x_min, y_min], [x_max, y_min], [x_max, y_max], [x_min, y_max]],
                (text, confidence),
            ])

        return [lines]

    def _is_pdf(self, file_content: bytes, filename: str) -> bool:
        if file_content.startswith(b"%PDF"):
            return True
        return filename.lower().endswith(".pdf")

    def _render_pdf_pages(self, file_content: bytes) -> List[np.ndarray]:
        if not PDF_RENDER_AVAILABLE:
            raise RuntimeError("当前环境缺少 PyMuPDF（pymupdf），无法解析 PDF 文件")

        doc = fitz.open(stream=file_content, filetype="pdf")
        pages: List[np.ndarray] = []
        try:
            for page in doc:
                # 使用 2x 缩放提高 OCR 识别稳定性
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                mode = "RGB" if pix.n < 4 else "RGBA"
                image = Image.frombytes(mode, [pix.width, pix.height], pix.samples)
                if mode == "RGBA":
                    image = image.convert("RGB")
                image = self._prepare_image_for_ocr(image)
                pages.append(np.array(image))
        finally:
            doc.close()

        return pages

    def _prepare_image_for_ocr(self, image: Image.Image) -> Image.Image:
        """限制超大图片尺寸，避免 Tesseract 在免费实例上长时间阻塞。"""
        max_side = int(os.getenv("OCR_MAX_IMAGE_SIDE", "2200"))
        if max_side <= 0:
            return image

        width, height = image.size
        current_max = max(width, height)
        if current_max <= max_side:
            return image

        scale = max_side / current_max
        target_size = (max(1, int(width * scale)), max(1, int(height * scale)))
        resample = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
        return image.resize(target_size, resample)

    def _parse_single_page(self, ocr_result, page_index: int) -> Dict[str, Any]:
        """格式化单页 OCR 输出为统一结构"""
        if not ocr_result or not ocr_result[0]:
            return {"tables": [], "indicators": [], "markdown": "", "reportDate": None, "allText": ""}

        # 收集所有 OCR 文本块
        text_blocks: List[Dict[str, Any]] = []
        for line in ocr_result[0]:
            if line and len(line) >= 2:
                bbox = line[0]
                text, confidence = line[1]
                if bbox and len(bbox) >= 4:
                    x_coords = [p[0] for p in bbox]
                    y_coords = [p[1] for p in bbox]
                    x_min, x_max = min(x_coords), max(x_coords)
                    y_min, y_max = min(y_coords), max(y_coords)
                    text_blocks.append({
                        "text": text,
                        "bbox": [x_min, y_min, x_max, y_max],
                        "confidence": confidence,
                        "center_y": (y_min + y_max) / 2,
                        "center_x": (x_min + x_max) / 2,
                    })

        text_blocks.sort(key=lambda b: (b["center_y"], b["center_x"]))

        # 检测表格结构
        table_structure = self._detect_table_structure(text_blocks)

        tables = []
        indicators = []
        markdown_lines = []

        if table_structure and table_structure["num_rows"] >= 2:
            tables.append({
                "pageIndex": page_index,
                "cells": table_structure["cells"]
            })

            # ★ 核心修复：按列位置提取指标（不再依赖单个 block 包含完整信息）
            indicators = self._extract_indicators_from_table(table_structure, page_index)
            markdown_lines = self._generate_table_markdown(table_structure)

        # 如果没有找到表格，尝试从文本块直接提取指标
        if not indicators:
            indicators = self._extract_indicators_from_text_blocks(text_blocks, page_index)

        # 提取日期
        all_text = " ".join([b["text"] for b in text_blocks])
        report_date = self._extract_date(all_text)

        return {
            "reportDate": report_date,
            "tables": tables,
            "indicators": indicators,
            "markdown": "\n".join(markdown_lines) if markdown_lines else "",
            "allText": all_text,
        }

    def _detect_table_structure(self, text_blocks: List[Dict]) -> Optional[Dict]:
        """检测表格结构 — 按 Y 坐标聚类行，按 X 坐标聚类列"""
        if len(text_blocks) < 4:
            return None

        # 按 Y 坐标聚类行
        y_coords = sorted(set(b["center_y"] for b in text_blocks))
        y_clusters = []
        current_cluster = [y_coords[0]]

        for y in y_coords[1:]:
            if abs(y - current_cluster[-1]) < 20:
                current_cluster.append(y)
            else:
                y_clusters.append(current_cluster)
                current_cluster = [y]
        y_clusters.append(current_cluster)

        if len(y_clusters) < 2:
            return None

        # 按 X 坐标聚类列
        x_coords = sorted(set(b["center_x"] for b in text_blocks))
        x_clusters = []
        current_cluster = [x_coords[0]]

        for x in x_coords[1:]:
            if abs(x - current_cluster[-1]) < 80:
                current_cluster.append(x)
            else:
                x_clusters.append(current_cluster)
                current_cluster = [x]
        x_clusters.append(current_cluster)

        if len(x_clusters) < 2:
            return None

        # 计算每个列的基准 X 坐标（取平均）
        col_centers = [sum(c) / len(c) for c in x_clusters]

        # 为每个文本块分配行和列
        cells = []
        for block in text_blocks:
            # 分配行
            row_idx = 0
            for i, cluster in enumerate(y_clusters):
                if any(abs(block["center_y"] - y) < 20 for y in cluster):
                    row_idx = i
                    break

            # 分配列（找最近的列中心）
            col_idx = 0
            min_dist = float('inf')
            for i, center in enumerate(col_centers):
                dist = abs(block["center_x"] - center)
                if dist < min_dist:
                    min_dist = dist
                    col_idx = i

            cells.append({
                "row": row_idx,
                "col": col_idx,
                "text": block["text"],
                "bbox": block["bbox"],
                "confidence": block["confidence"],
            })

        return {
            "cells": cells,
            "num_rows": len(y_clusters),
            "num_cols": len(x_clusters),
            "col_centers": col_centers,
        }

    def _extract_indicators_from_table(self, table_structure: Dict, page_index: int) -> List[Dict]:
        """
        ★ 修复后的提取逻辑：
        按行读取表格，将同一行的不同列组合成完整的指标记录。

        典型格式：
          列0=指标名, 列1=结果值, 列2=单位, 列3=参考范围
        也可能：
          列0=指标名, 列1=结果值+单位, 列2=参考范围
        或者：
          列0=指标名, 列1=结果, 列2=参考范围
        """
        cells = table_structure["cells"]
        num_rows = table_structure["num_rows"]
        num_cols = table_structure["num_cols"]

        # 构建 (row, col) -> cell 的映射
        cell_map = {}
        for cell in cells:
            key = (cell["row"], cell["col"])
            cell_map[key] = cell

        indicators = []

        # 第一行是表头，从第二行开始
        for row_idx in range(1, num_rows):
            row_text = []
            for col_idx in range(num_cols):
                cell = cell_map.get((row_idx, col_idx))
                row_text.append(cell["text"].strip() if cell else "")

            # 跳过空行
            if not any(row_text):
                continue

            # 尝试解析这一行为一个指标记录
            indicator = self._parse_row_as_indicator(row_text, num_cols, page_index)
            if indicator:
                indicators.append(indicator)

        return indicators

    def _parse_row_as_indicator(self, row: List[str], num_cols: int, page_index: int) -> Optional[Dict]:
        """
        将表格的一行解析为指标记录。

        策略：
        1. 第一个非空列通常是指标名称
        2. 后面的列尝试提取数值
        3. 包含单位的列（mmol/L, g/L, ×10^9/L 等）作为单位
        4. 包含范围模式的列（如 "3.5-9.5"）作为参考范围
        """
        # 指标名称：第一个非空列
        name = ""
        name_col = -1
        for i, text in enumerate(row):
            if text:
                name = text
                name_col = i
                break

        if not name:
            return None

        # 数值和单位列
        value = None
        unit = ""
        ref_range = ""

        # 单位模式 — 支持 ×10^9/L 等多种变体
        unit_pattern = re.compile(
            r'(×10[̂⁰¹²³⁴⁵⁶⁷⁸⁹\^\d]*/L|mmol/L|mg/dL|g/L|U/L|μmol/L|µmol/L|mmHg|bpm|次/分|秒|ng/mL|mg/L|nmol/L|pmol/L|mIU/L|kg/m²|kg|斤|kPa|%)',
            re.IGNORECASE
        )
        # 范围模式 (如 "3.5-9.5")
        range_pattern = re.compile(r'^\d+\.?\d*\s*[-~—–]\s*\d+\.?\d*$')
        # 纯数值
        value_pattern = re.compile(r'^(\d+\.?\d*)$')
        # 数值+单位
        value_unit_pattern = re.compile(r'^(\d+\.?\d*)\s*(×10[̂⁰¹²³⁴⁵⁶⁷⁸⁹]*\^?\d*[/L²]|mmol/L|mg/dL|g/L|U/L|μmol/L|µmol/L|mmHg|bpm|次/分|秒|ng/mL|mg/L|nmol/L|pmol/L|mIU/L|kg/m²|kg|斤|kPa|%)', re.IGNORECASE)

        for i in range(name_col + 1, num_cols):
            text = row[i].strip()
            if not text or text in ['-', '–', '—', '']:
                continue

            # 纯数值
            m = value_pattern.match(text)
            if m and value is None:
                value = float(m.group(1))
                continue

            # 数值+单位
            m = value_unit_pattern.match(text)
            if m:
                if value is None:
                    value = float(m.group(1))
                unit = m.group(2).strip()
                continue

            # 单位列
            m = unit_pattern.search(text)
            if m and not unit:
                unit = m.group(1).strip()
                continue

            # 范围列
            m = range_pattern.match(text)
            if m and not ref_range:
                ref_range = text
                continue

        if value is None:
            return None

        # 清理指标名称 — 去掉可能的英文括号缩写
        clean_label = name.strip()
        if self._is_metadata_label(clean_label):
            return None

        return {
            "rawLabel": clean_label,
            "value": value,
            "unit": unit or '',
            "referenceRange": ref_range or '',
            "pageIndex": page_index,
        }

    def _extract_indicators_from_text_blocks(self, text_blocks: List[Dict], page_index: int) -> List[Dict]:
        """从文本块直接提取指标（非表格格式的备选方案）"""
        indicators = []

        # 组合相邻文本块
        combined_lines = []
        current_line = []
        last_y = None

        for block in text_blocks:
            if last_y is not None and abs(block["center_y"] - last_y) > 25:
                if current_line:
                    combined_lines.append(" ".join(current_line))
                current_line = []
            current_line.append(block["text"].strip())
            last_y = block["center_y"]

        if current_line:
            combined_lines.append(" ".join(current_line))

        for line_text in combined_lines:
            patterns = [
                r'^(.+?)\s+(\d+\.?\d*)\s*(×10[̂⁰¹²³⁴⁵⁶⁷⁸⁹]*\^?\d*[/L²]|mmol/L|mg/dL|g/L|U/L|μmol/L|µmol/L|mmHg|bpm|次/分|秒|ng/mL|mg/L|nmol/L|pmol/L|mIU/L|kg/m²|kg|斤|kPa|%)?',
                r'^(.+?)[:：]\s*(\d+\.?\d*)',
            ]

            for pat in patterns:
                m = re.match(pat, line_text, re.IGNORECASE)
                if m:
                    label = m.group(1).strip().rstrip(':：')
                    value_str = m.group(2)
                    try:
                        value = float(value_str)
                    except ValueError:
                        continue
                    unit = m.group(3) if m.lastindex and m.lastindex >= 3 else ''
                    if self._is_metadata_label(label):
                        break
                    indicators.append({
                        "rawLabel": label,
                        "value": value,
                        "unit": unit or '',
                        "referenceRange": '',
                        "pageIndex": page_index,
                    })
                    break

        return indicators

    def _is_metadata_label(self, label: str) -> bool:
        normalized = re.sub(r'\s+', ' ', label.strip().lower())
        metadata_keywords = [
            "report date",
            "sample date",
            "test date",
            "collection date",
            "检验日期",
            "报告日期",
            "采样日期",
            "送检日期",
            "日期",
        ]
        return any(keyword in normalized for keyword in metadata_keywords)

    def _generate_table_markdown(self, table_structure: Dict) -> List[str]:
        """生成表格 Markdown"""
        cells = table_structure["cells"]
        if not cells:
            return []

        num_rows = table_structure["num_rows"]
        num_cols = table_structure["num_cols"]
        markdown_lines = []

        # 表头
        headers = [c["text"] for c in cells if c["row"] == 0]
        if not headers:
            headers = [""] * num_cols
        markdown_lines.append("| " + " | ".join(headers) + " |")
        markdown_lines.append("| " + " | ".join(["---"] * len(headers)) + " |")

        # 数据行
        for row in range(1, num_rows):
            row_cells = [c["text"] for c in cells if c["row"] == row]
            while len(row_cells) < num_cols:
                row_cells.append("")
            markdown_lines.append("| " + " | ".join(row_cells[:num_cols]) + " |")

        return markdown_lines

    def _extract_date(self, text: str) -> Optional[str]:
        """提取日期"""
        patterns = [
            (r'(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})', lambda m: f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"),
            (r'(\d{4})\.(\d{1,2})\.(\d{1,2})', lambda m: f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"),
        ]

        for pattern, formatter in patterns:
            match = re.search(pattern, text)
            if match:
                return formatter(match)

        return None

    def _mock_parse(self, file_content: bytes, filename: str) -> dict:
        """Mock 解析"""
        return {
            "success": True,
            "pageCount": 1,
            "reportDate": "2024-04-15",
            "tables": [{
                "pageIndex": 0,
                "cells": [
                    {"row": 0, "col": 0, "text": "检验项目", "bbox": [10, 20, 100, 40]},
                    {"row": 0, "col": 1, "text": "结果", "bbox": [110, 20, 150, 40]},
                    {"row": 0, "col": 2, "text": "单位", "bbox": [160, 20, 200, 40]},
                    {"row": 0, "col": 3, "text": "参考范围", "bbox": [210, 20, 280, 40]},
                    {"row": 1, "col": 0, "text": "白细胞(WBC)", "bbox": [10, 50, 100, 70]},
                    {"row": 1, "col": 1, "text": "6.5", "bbox": [110, 50, 150, 70]},
                    {"row": 1, "col": 2, "text": "×10^9/L", "bbox": [160, 50, 200, 70]},
                    {"row": 1, "col": 3, "text": "3.5-9.5", "bbox": [210, 50, 280, 70]},
                    {"row": 2, "col": 0, "text": "血红蛋白(HGB)", "bbox": [10, 80, 100, 100]},
                    {"row": 2, "col": 1, "text": "145", "bbox": [110, 80, 150, 100]},
                    {"row": 2, "col": 2, "text": "g/L", "bbox": [160, 80, 200, 100]},
                    {"row": 2, "col": 3, "text": "130-175", "bbox": [210, 80, 280, 100]},
                    {"row": 3, "col": 0, "text": "血糖(GLU)", "bbox": [10, 110, 100, 130]},
                    {"row": 3, "col": 1, "text": "5.2", "bbox": [110, 110, 150, 130]},
                    {"row": 3, "col": 2, "text": "mmol/L", "bbox": [160, 110, 200, 130]},
                    {"row": 3, "col": 3, "text": "3.9-6.1", "bbox": [210, 110, 280, 130]},
                ]
            }],
            "indicators": [
                {"rawLabel": "白细胞(WBC)", "value": 6.5, "unit": "×10^9/L", "referenceRange": "3.5-9.5", "pageIndex": 0},
                {"rawLabel": "血红蛋白(HGB)", "value": 145.0, "unit": "g/L", "referenceRange": "130-175", "pageIndex": 0},
                {"rawLabel": "血糖(GLU)", "value": 5.2, "unit": "mmol/L", "referenceRange": "3.9-6.1", "pageIndex": 0},
            ],
            "markdown": "| 检验项目 | 结果 | 单位 | 参考范围 |\n|---------|------|------|---------|\n| 白细胞(WBC) | 6.5 | ×10^9/L | 3.5-9.5 |\n| 血红蛋白(HGB) | 145 | g/L | 130-175 |\n| 血糖(GLU) | 5.2 | mmol/L | 3.9-6.1 |"
        }
