"""PaddleOCR-VL 引擎封装 - 支持真实调用和 mock 模式"""
import io
import re
from typing import Optional, List, Dict, Any
from PIL import Image

try:
    from paddleocr import PaddleOCR
    PADDLE_AVAILABLE = True
except ImportError:
    PADDLE_AVAILABLE = False


class PaddleEngine:
    """PaddleOCR-VL 解析引擎"""
    
    def __init__(self, use_mock: bool = True):
        self.use_mock = use_mock
        self._ocr = None
        if not use_mock and PADDLE_AVAILABLE:
            self._ocr = PaddleOCR(use_angle_cls=True, lang='ch')
    
    def parse_pdf(self, file_content: bytes, filename: str = "report.pdf") -> dict:
        """解析 PDF 或图片文件，返回结构化数据"""
        if self.use_mock:
            return self._mock_parse(file_content, filename)
        return self._real_parse(file_content, filename)
    
    def _real_parse(self, file_content: bytes, filename: str) -> dict:
        """真实 PaddleOCR 解析"""
        if not self._ocr:
            raise RuntimeError("PaddleOCR 未安装")
        
        # PDF 需要先转为图片
        is_pdf = filename.lower().endswith('.pdf')
        if is_pdf:
            # 使用 pdf2image 转换 PDF
            try:
                from pdf2image import convert_from_bytes
                images = convert_from_bytes(file_content)
                all_results = []
                for i, img in enumerate(images):
                    result = self._ocr.ocr(img, cls=True)
                    all_results.append((i, result))
                return self._format_pdf_result(all_results, filename)
            except ImportError:
                # 没有 pdf2image，抛出错误
                raise RuntimeError("需要安装 pdf2image 来处理 PDF 文件: pip install pdf2image")
        else:
            # 图片直接 OCR
            import numpy as np
            image = Image.open(io.BytesIO(file_content))
            img_array = np.array(image)
            result = self._ocr.ocr(img_array, cls=True)
            return self._format_result(result, filename, page_index=0)
    
    def _mock_parse(self, file_content: bytes, filename: str) -> dict:
        """Mock 解析 - 返回模拟数据用于开发测试"""
        # Mock 数据包含 18 项指标
        mock_indicators = [
            {"rawLabel": "白细胞(WBC)", "value": 6.5, "unit": "×10^9/L", "referenceRange": "3.5-9.5", "pageIndex": 0},
            {"rawLabel": "红细胞(RBC)", "value": 4.8, "unit": "×10^12/L", "referenceRange": "4.3-5.8", "pageIndex": 0},
            {"rawLabel": "血红蛋白(HGB)", "value": 145, "unit": "g/L", "referenceRange": "130-175", "pageIndex": 0},
            {"rawLabel": "血小板(PLT)", "value": 220, "unit": "×10^9/L", "referenceRange": "125-350", "pageIndex": 0},
            {"rawLabel": "血糖(GLU)", "value": 5.2, "unit": "mmol/L", "referenceRange": "3.9-6.1", "pageIndex": 0},
            {"rawLabel": "总胆固醇(TC)", "value": 4.5, "unit": "mmol/L", "referenceRange": "2.8-5.2", "pageIndex": 0},
            {"rawLabel": "甘油三酯(TG)", "value": 1.2, "unit": "mmol/L", "referenceRange": "0.56-1.7", "pageIndex": 0},
            {"rawLabel": "收缩压(SBP)", "value": 120, "unit": "mmHg", "referenceRange": "90-140", "pageIndex": 0},
            {"rawLabel": "舒张压(DBP)", "value": 80, "unit": "mmHg", "referenceRange": "60-90", "pageIndex": 0},
            {"rawLabel": "心率(HR)", "value": 72, "unit": "bpm", "referenceRange": "60-100", "pageIndex": 0},
            {"rawLabel": "谷丙转氨酶(ALT)", "value": 25, "unit": "U/L", "referenceRange": "0-40", "pageIndex": 0},
            {"rawLabel": "谷草转氨酶(AST)", "value": 22, "unit": "U/L", "referenceRange": "0-40", "pageIndex": 0},
            {"rawLabel": "肌酐(Cr)", "value": 78, "unit": "μmol/L", "referenceRange": "44-133", "pageIndex": 0},
            {"rawLabel": "尿素氮(BUN)", "value": 5.8, "unit": "mmol/L", "referenceRange": "2.5-7.1", "pageIndex": 0},
            {"rawLabel": "尿酸(UA)", "value": 320, "unit": "μmol/L", "referenceRange": "150-420", "pageIndex": 0},
            {"rawLabel": "钾(K)", "value": 4.2, "unit": "mmol/L", "referenceRange": "3.5-5.3", "pageIndex": 0},
            {"rawLabel": "钠(Na)", "value": 140, "unit": "mmol/L", "referenceRange": "137-147", "pageIndex": 0},
            {"rawLabel": "氯(Cl)", "value": 102, "unit": "mmol/L", "referenceRange": "99-110", "pageIndex": 0},
        ]
        
        mock_cells = []
        # 表头
        headers = ["检验项目", "结果", "单位", "参考范围"]
        for col, h in enumerate(headers):
            mock_cells.append({"row": 0, "col": col, "text": h, "bbox": [50 + col*180, 100, 50 + col*180 + 150, 130]})
        
        # 数据行
        for row, ind in enumerate(mock_indicators, start=1):
            mock_cells.append({"row": row, "col": 0, "text": ind["rawLabel"], "bbox": [50, 100 + row*30, 230, 130 + row*30]})
            mock_cells.append({"row": row, "col": 1, "text": str(ind["value"]), "bbox": [230, 100 + row*30, 410, 130 + row*30]})
            mock_cells.append({"row": row, "col": 2, "text": ind["unit"], "bbox": [410, 100 + row*30, 590, 130 + row*30]})
            mock_cells.append({"row": row, "col": 3, "text": ind["referenceRange"], "bbox": [590, 100 + row*30, 770, 130 + row*30]})
        
        markdown = "| 检验项目 | 结果 | 单位 | 参考范围 |\n|---------|------|------|---------|\n"
        for ind in mock_indicators:
            markdown += f"| {ind['rawLabel']} | {ind['value']} | {ind['unit']} | {ind['referenceRange']} |\n"
        
        return {
            "success": True,
            "pageCount": 1,
            "reportDate": "2024-04-15",
            "tables": [{"pageIndex": 0, "cells": mock_cells}],
            "indicators": mock_indicators,
            "markdown": markdown
        }
    
    def _format_pdf_result(self, pdf_results: List, filename: str) -> dict:
        """格式化 PDF 多页结果"""
        all_tables = []
        all_indicators = []
        all_markdown = []
        
        for page_index, result in pdf_results:
            page_data = self._format_result(result, filename, page_index)
            all_tables.extend(page_data["tables"])
            all_indicators.extend(page_data["indicators"])
            all_markdown.append(page_data["markdown"])
        
        return {
            "success": True,
            "pageCount": len(pdf_results),
            "reportDate": self._extract_date_from_indicators(all_indicators),
            "tables": all_tables,
            "indicators": all_indicators,
            "markdown": "\n\n---\n\n".join(all_markdown)
        }
    
    def _format_result(self, ocr_result, filename: str, page_index: int = 0) -> dict:
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
                text = line[1][0] if isinstance(line[1], (list, tuple)) else str(line[1])
                bbox = line[0] if isinstance(line[0], (list, tuple)) else []
                confidence = line[1][1] if isinstance(line[1], (list, tuple)) and len(line[1]) > 1 else 0.9
                
                # bbox 格式: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                if bbox and len(bbox) >= 4:
                    x_coords = [p[0] for p in bbox if isinstance(p, (list, tuple)) and len(p) >= 2]
                    y_coords = [p[1] for p in bbox if isinstance(p, (list, tuple)) and len(p) >= 2]
                    if x_coords and y_coords:
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
                "pageIndex": page_index,
                "cells": table_structure["cells"]
            })
            
            # 从表格提取指标
            indicators = self._extract_indicators_from_table(table_structure, page_index)
            
            # 生成 Markdown
            markdown_lines = self._generate_table_markdown(table_structure)
        
        # 如果没有找到表格，尝试从文本块直接提取指标
        if not indicators:
            indicators = self._extract_indicators_from_text_blocks(text_blocks, page_index)
        
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
        """从文本块检测表格结构"""
        if len(text_blocks) < 4:
            return None
        
        # 分析 Y 坐标分布，找出行
        y_coords = [b["center_y"] for b in text_blocks]
        
        # 使用聚类找出行（允许一定的垂直偏差）
        rows = []
        current_row = []
        last_y = None
        y_threshold = 15  # 允许的垂直偏差
        
        for block in sorted(text_blocks, key=lambda b: b["center_y"]):
            if last_y is None or abs(block["center_y"] - last_y) <= y_threshold:
                current_row.append(block)
                if last_y is None:
                    last_y = block["center_y"]
                else:
                    last_y = (last_y + block["center_y"]) / 2  # 更新行中心
            else:
                if current_row:
                    rows.append(current_row)
                current_row = [block]
                last_y = block["center_y"]
        
        if current_row:
            rows.append(current_row)
        
        # 需要至少 2 行（表头 + 1 数据行）
        if len(rows) < 2:
            return None
        
        # 分析第一行（表头）的 X 坐标分布，确定列
        header_row = rows[0]
        header_blocks = sorted(header_row, key=lambda b: b["center_x"])
        
        # 检查是否包含典型的表格关键词
        header_texts = [b["text"].lower() for b in header_blocks]
        table_keywords = ["项目", "指标", "检验", "结果", "数值", "单位", "参考", "范围"]
        keyword_count = sum(1 for t in header_texts for k in table_keywords if k in t)
        
        if keyword_count < 2:
            return None
        
        # 确定列边界
        column_boundaries = []
        for block in header_blocks:
            column_boundaries.append({
                "x_center": block["center_x"],
                "x_min": block["bbox"][0],
                "x_max": block["bbox"][2],
                "header": block["text"]
            })
        
        # 构建单元格结构
        cells = []
        for row_idx, row in enumerate(rows):
            row_blocks = sorted(row, key=lambda b: b["center_x"])
            
            # 将每个块分配到列
            for block in row_blocks:
                # 找到最匹配的列
                best_col = 0
                best_dist = float('inf')
                for col_idx, col_bound in enumerate(column_boundaries):
                    dist = abs(block["center_x"] - col_bound["x_center"])
                    if dist < best_dist:
                        best_dist = dist
                        best_col = col_idx
                
                cells.append({
                    "row": row_idx,
                    "col": best_col,
                    "text": block["text"],
                    "bbox": block["bbox"]
                })
        
        return {
            "rows": len(rows),
            "cols": len(column_boundaries),
            "cells": cells,
            "headers": [col["header"] for col in column_boundaries]
        }
    
    def _extract_indicators_from_table(self, table_structure: Dict, page_index: int) -> List[Dict]:
        """从表格结构提取指标"""
        indicators = []
        cells = table_structure["cells"]
        headers = table_structure["headers"]
        
        # 确定列索引
        name_col = self._find_column_index(headers, ["项目", "指标", "检验", "名称"])
        value_col = self._find_column_index(headers, ["结果", "数值", "测定值"])
        unit_col = self._find_column_index(headers, ["单位"])
        ref_col = self._find_column_index(headers, ["参考", "范围", "参考值"])
        
        # 默认假设列顺序
        if name_col is None:
            name_col = 0
        if value_col is None:
            value_col = 1
        if unit_col is None:
            unit_col = 2
        if ref_col is None:
            ref_col = 3
        
        # 按行分组
        max_row = max(c["row"] for c in cells)
        for row_idx in range(1, max_row + 1):  # 跳过表头行
            row_cells = [c for c in cells if c["row"] == row_idx]
            
            # 提取各列值
            def get_cell_text(col_idx):
                matching = [c for c in row_cells if c["col"] == col_idx]
                return matching[0]["text"].strip() if matching else ""
            
            raw_label = get_cell_text(name_col)
            value_str = get_cell_text(value_col)
            unit = get_cell_text(unit_col)
            ref_range = get_cell_text(ref_col)
            
            if not raw_label or not value_str:
                continue
            
            # 解析数值（处理可能的特殊格式）
            value = self._parse_value(value_str)
            if value is None:
                continue
            
            indicators.append({
                "rawLabel": raw_label,
                "value": value,
                "unit": unit,
                "referenceRange": ref_range,
                "pageIndex": page_index
            })
        
        return indicators
    
    def _extract_indicators_from_text_blocks(self, text_blocks: List[Dict], page_index: int) -> List[Dict]:
        """从文本块直接提取指标（非表格格式）"""
        indicators = []
        
        # 使用正则表达式匹配常见的指标格式
        # 格式1: "指标名 数值 单位"
        # 格式2: "指标名: 数值 单位"
        patterns = [
            r'([A-Za-z\u4e00-\u9fa5]+(?:\([A-Za-z]+\))?)\s*[:：]\s*([\d.]+)\s*([A-Za-z\u4e00-\u9fa5×μ^/]+)',
            r'([A-Za-z\u4e00-\u9fa5]+(?:\([A-Za-z]+\))?)\s+([\d.]+)\s+([A-Za-z\u4e00-\u9fa5×μ^/]+)',
        ]
        
        for block in text_blocks:
            text = block["text"]
            for pattern in patterns:
                match = re.search(pattern, text)
                if match:
                    raw_label = match.group(1).strip()
                    value = self._parse_value(match.group(2))
                    unit = match.group(3).strip()
                    
                    if value is not None and raw_label:
                        indicators.append({
                            "rawLabel": raw_label,
                            "value": value,
                            "unit": unit,
                            "referenceRange": "",
                            "pageIndex": page_index
                        })
                        break
        
        return indicators
    
    def _find_column_index(self, headers: List[str], keywords: List[str]) -> Optional[int]:
        """根据关键词查找列索引"""
        for idx, header in enumerate(headers):
            header_lower = header.lower()
            for keyword in keywords:
                if keyword.lower() in header_lower:
                    return idx
        return None
    
    def _parse_value(self, value_str: str) -> Optional[float]:
        """解析数值字符串"""
        # 去除空格和特殊字符
        value_str = value_str.strip()
        
        # 处理带方向的数值（如 >100, <50）
        if value_str.startswith(('>', '<', '≥', '≤')):
            value_str = value_str[1:]
        
        # 处理范围值（如 10-20，取平均值或第一个值）
        if '-' in value_str and not value_str.startswith('-'):
            parts = value_str.split('-')
            try:
                # 尝试解析为范围，取第一个值
                return float(parts[0])
            except:
                pass
        
        # 直接解析数值
        try:
            return float(value_str)
        except:
            # 处理带单位的数值（如 "120mmHg"）
            match = re.match(r'^([\d.]+)', value_str)
            if match:
                try:
                    return float(match.group(1))
                except:
                    pass
        return None
    
    def _extract_date(self, text: str) -> Optional[str]:
        """从文本提取日期"""
        patterns = [
            (r'(\d{4})-(\d{1,2})-(\d{1,2})', lambda m: f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"),
            (r'(\d{4})/(\d{1,2})/(\d{1,2})', lambda m: f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"),
            (r'(\d{4})年(\d{1,2})月(\d{1,2})日', lambda m: f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"),
            (r'(\d{4})\.(\d{1,2})\.(\d{1,2})', lambda m: f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"),
        ]
        
        for pattern, formatter in patterns:
            match = re.search(pattern, text)
            if match:
                return formatter(match)
        return None
    
    def _extract_date_from_indicators(self, indicators: List[Dict]) -> Optional[str]:
        """从指标数据提取日期（如果有日期字段）"""
        # 这里可以扩展为从特定指标提取日期
        return None
    
    def _generate_table_markdown(self, table_structure: Dict) -> List[str]:
        """生成表格的 Markdown 格式"""
        lines = []
        cells = table_structure["cells"]
        headers = table_structure["headers"]
        cols = table_structure["cols"]
        
        # 表头行
        header_line = "| " + " | ".join(headers) + " |"
        lines.append(header_line)
        
        # 分隔线
        separator = "| " + " | ".join(["---" for _ in range(cols)]) + " |"
        lines.append(separator)
        
        # 数据行
        max_row = max(c["row"] for c in cells)
        for row_idx in range(1, max_row + 1):
            row_cells = [c for c in cells if c["row"] == row_idx]
            row_texts = []
            for col_idx in range(cols):
                matching = [c for c in row_cells if c["col"] == col_idx]
                row_texts.append(matching[0]["text"] if matching else "")
            data_line = "| " + " | ".join(row_texts) + " |"
            lines.append(data_line)
        
        return lines