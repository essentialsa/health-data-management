"""PaddleOCR 引擎封装 - PaddleOCR 2.7.3 + PP-OCRv4"""
import io
import re
from typing import Optional, List, Dict, Any
from PIL import Image
import numpy as np

try:
    from paddleocr import PaddleOCR
    PADDLE_AVAILABLE = True
except ImportError:
    PADDLE_AVAILABLE = False


class PaddleEngine:
    """PaddleOCR 解析引擎"""
    
    def __init__(self, use_mock: bool = False):
        self.use_mock = use_mock
        self._ocr = None
        if not use_mock and PADDLE_AVAILABLE:
            # PaddleOCR 2.7.3 API
            self._ocr = PaddleOCR(use_angle_cls=True, lang='ch', show_log=False)
    
    def parse_pdf(self, file_content: bytes, filename: str = "report.pdf") -> dict:
        """解析 PDF 或图片文件，返回结构化数据"""
        if self.use_mock:
            return self._mock_parse(file_content, filename)
        return self._real_parse(file_content, filename)
    
    def _real_parse(self, file_content: bytes, filename: str) -> dict:
        """真实 PaddleOCR 解析"""
        if not self._ocr:
            raise RuntimeError("PaddleOCR 未安装")
        
        # 尝试打开图片
        try:
            image = Image.open(io.BytesIO(file_content)).convert('RGB')
            img_array = np.array(image)
            result = self._ocr.ocr(img_array, cls=True)
            return self._format_result(result, filename)
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
    
    def _format_result(self, ocr_result, filename: str) -> dict:
        """格式化 PaddleOCR 输出为统一结构"""
        tables = []
        indicators = []
        markdown_lines = []
        
        if not ocr_result or not ocr_result[0]:
            return {
                "success": True,
                "pageCount": 1,
                "reportDate": None,
                "tables": tables,
                "indicators": indicators,
                "markdown": ""
            }
        
        # 收集所有 OCR 文本块
        text_blocks = []
        for line in ocr_result[0]:
            if line and len(line) >= 2:
                bbox = line[0]
                text, confidence = line[1]
                
                # bbox 格式: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
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
        
        # 按位置排序（从上到下，从左到右）
        text_blocks.sort(key=lambda b: (b["center_y"], b["center_x"]))
        
        # 尝试检测表格结构
        table_structure = self._detect_table_structure(text_blocks)
        
        if table_structure:
            tables.append({
                "pageIndex": 0,
                "cells": table_structure["cells"]
            })
            
            # 从表格提取指标
            indicators = self._extract_indicators_from_table(table_structure, 0)
            
            # 生成 Markdown
            markdown_lines = self._generate_table_markdown(table_structure)
        
        # 如果没有找到表格，尝试从文本块直接提取指标
        if not indicators:
            indicators = self._extract_indicators_from_text_blocks(text_blocks, 0)
        
        # 提取日期
        all_text = " ".join([b["text"] for b in text_blocks])
        report_date = self._extract_date(all_text)
        
        return {
            "success": True,
            "pageCount": 1,
            "reportDate": report_date,
            "tables": tables,
            "indicators": indicators,
            "markdown": "\n".join(markdown_lines) if markdown_lines else ""
        }
    
    def _detect_table_structure(self, text_blocks: List[Dict]) -> Optional[Dict]:
        """检测表格结构"""
        if len(text_blocks) < 4:
            return None
        
        # 尝试按 Y 坐标聚类行
        y_coords = [b["center_y"] for b in text_blocks]
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
        
        # 检查每行是否有相似的列数
        cells = []
        for i, cluster in enumerate(y_clusters):
            row_blocks = [b for b in text_blocks if any(abs(b["center_y"] - y) < 20 for y in cluster)]
            row_blocks.sort(key=lambda b: b["center_x"])
            
            for j, block in enumerate(row_blocks):
                cells.append({
                    "row": i,
                    "col": j,
                    "text": block["text"],
                    "bbox": block["bbox"],
                    "confidence": block["confidence"]
                })
        
        return {
            "cells": cells,
            "num_rows": len(y_clusters),
            "num_cols": max(len([c for c in cells if c["row"] == i]) for i in range(len(y_clusters)))
        }
    
    def _extract_indicators_from_table(self, table_structure: Dict, page_index: int) -> List[Dict]:
        """从表格提取指标"""
        indicators = []
        cells = table_structure["cells"]
        
        # 假设第一行是表头，从第二行开始提取
        for cell in cells:
            if cell["row"] == 0:
                continue
            
            text = cell["text"].strip()
            if not text:
                continue
            
            # 尝试匹配指标模式
            patterns = [
                r'^(.+?)\s+(\d+\.?\d*)\s*(×10[̂]⁹?/?L|×10\^?\d+/L|%|mmol/L|mg/dL|g/L|U/L|μmol/L|µmol/L|mmHg|bpm|次/分|秒|ng/mL|mg/L|nmol/L|pmol/L|mIU/L|kg/m²|kg|斤|kPa)?',
                r'^(.+?)[:：]\s*(\d+\.?\d*)',
                r'^([\u4e00-\u9fa5a-zA-Z()（）]+)\s+(\d+\.?\d*)',
            ]
            
            for pat in patterns:
                m = re.match(pat, text, re.IGNORECASE)
                if m:
                    label = m.group(1).strip().rstrip(':：')
                    value_str = m.group(2)
                    try:
                        value = float(value_str)
                    except ValueError:
                        continue
                    
                    unit = m.group(3) if m.lastindex and m.lastindex >= 3 else ''
                    if unit:
                        unit = unit.strip()
                    
                    indicators.append({
                        "rawLabel": label,
                        "value": value,
                        "unit": unit or '',
                        "referenceRange": '',
                        "pageIndex": page_index,
                        "confidence": round(float(cell.get("confidence", 0.9)), 3)
                    })
                    break
        
        return indicators
    
    def _extract_indicators_from_text_blocks(self, text_blocks: List[Dict], page_index: int) -> List[Dict]:
        """从文本块提取指标"""
        indicators = []
        
        for block in text_blocks:
            text = block["text"].strip()
            
            patterns = [
                r'^(.+?)\s+(\d+\.?\d*)\s*(×10[̂]⁹?/?L|×10\^?\d+/L|%|mmol/L|mg/dL|g/L|U/L|μmol/L|µmol/L|mmHg|bpm|次/分|秒|ng/mL|mg/L|nmol/L|pmol/L|mIU/L|kg/m²|kg|斤|kPa)?',
                r'^(.+?)[:：]\s*(\d+\.?\d*)',
            ]
            
            for pat in patterns:
                m = re.match(pat, text, re.IGNORECASE)
                if m:
                    label = m.group(1).strip().rstrip(':：')
                    value_str = m.group(2)
                    try:
                        value = float(value_str)
                    except ValueError:
                        continue
                    
                    unit = m.group(3) if m.lastindex and m.lastindex >= 3 else ''
                    if unit:
                        unit = unit.strip()
                    
                    indicators.append({
                        "rawLabel": label,
                        "value": value,
                        "unit": unit or '',
                        "referenceRange": '',
                        "pageIndex": page_index,
                        "confidence": round(float(block.get("confidence", 0.9)), 3)
                    })
                    break
        
        return indicators
    
    def _generate_table_markdown(self, table_structure: Dict) -> List[str]:
        """生成表格 Markdown"""
        cells = table_structure["cells"]
        if not cells:
            return []
        
        num_cols = table_structure["num_cols"]
        markdown_lines = []
        
        # 表头
        headers = [c["text"] for c in cells if c["row"] == 0]
        markdown_lines.append("| " + " | ".join(headers) + " |")
        markdown_lines.append("| " + " | ".join(["---"] * len(headers)) + " |")
        
        # 数据行
        for row in range(1, table_structure["num_rows"]):
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
                {"rawLabel": "白细胞(WBC)", "value": 6.5, "unit": "×10^9/L", "referenceRange": "3.5-9.5", "pageIndex": 0, "confidence": 0.98},
                {"rawLabel": "血红蛋白(HGB)", "value": 145.0, "unit": "g/L", "referenceRange": "130-175", "pageIndex": 0, "confidence": 0.97},
                {"rawLabel": "血糖(GLU)", "value": 5.2, "unit": "mmol/L", "referenceRange": "3.9-6.1", "pageIndex": 0, "confidence": 0.96},
            ],
            "markdown": "| 检验项目 | 结果 | 单位 | 参考范围 |\n|---------|------|------|---------|\n| 白细胞(WBC) | 6.5 | ×10^9/L | 3.5-9.5 |\n| 血红蛋白(HGB) | 145 | g/L | 130-175 |\n| 血糖(GLU) | 5.2 | mmol/L | 3.9-6.1 |"
        }
