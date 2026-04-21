"""PaddleOCR-VL 引擎封装 - 支持真实调用和 mock 模式"""
import io
from typing import Optional
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
            # 使用 pdf2image 或 poppler 转换
            # 简化版：直接尝试 OCR
            result = self._ocr.ocr(file_content, cls=True)
        else:
            # 图片直接 OCR
            import numpy as np
            image = Image.open(io.BytesIO(file_content))
            img_array = np.array(image)
            result = self._ocr.ocr(img_array, cls=True)
        
        return self._format_result(result, filename)
    
    def _mock_parse(self, file_content: bytes, filename: str) -> dict:
        """Mock 解析 - 返回模拟数据用于开发测试"""
        return {
            "success": True,
            "pageCount": 1,
            "reportDate": "2024-01-15",
            "tables": [
                {
                    "pageIndex": 0,
                    "cells": [
                        {"row": 0, "col": 0, "text": "检验项目", "bbox": [10, 20, 100, 40]},
                        {"row": 0, "col": 1, "text": "结果", "bbox": [110, 20, 150, 40]},
                        {"row": 0, "col": 2, "text": "单位", "bbox": [160, 20, 200, 40]},
                        {"row": 0, "col": 3, "text": "参考范围", "bbox": [210, 20, 280, 40]},
                        {"row": 1, "col": 0, "text": "收缩压", "bbox": [10, 50, 100, 70]},
                        {"row": 1, "col": 1, "text": "120", "bbox": [110, 50, 150, 70]},
                        {"row": 1, "col": 2, "text": "mmHg", "bbox": [160, 50, 200, 70]},
                        {"row": 1, "col": 3, "text": "90-140", "bbox": [210, 50, 280, 70]},
                        {"row": 2, "col": 0, "text": "舒张压", "bbox": [10, 80, 100, 100]},
                        {"row": 2, "col": 1, "text": "80", "bbox": [110, 80, 150, 100]},
                        {"row": 2, "col": 2, "text": "mmHg", "bbox": [160, 80, 200, 100]},
                        {"row": 2, "col": 3, "text": "60-90", "bbox": [210, 80, 280, 100]},
                        {"row": 3, "col": 0, "text": "血糖", "bbox": [10, 110, 100, 130]},
                        {"row": 3, "col": 1, "text": "5.2", "bbox": [110, 110, 150, 130]},
                        {"row": 3, "col": 2, "text": "mmol/L", "bbox": [160, 110, 200, 130]},
                        {"row": 3, "col": 3, "text": "3.9-6.1", "bbox": [210, 110, 280, 130]},
                    ]
                }
            ],
            "indicators": [
                {"rawLabel": "收缩压", "value": 120, "unit": "mmHg", "referenceRange": "90-140", "pageIndex": 0},
                {"rawLabel": "舒张压", "value": 80, "unit": "mmHg", "referenceRange": "60-90", "pageIndex": 0},
                {"rawLabel": "血糖", "value": 5.2, "unit": "mmol/L", "referenceRange": "3.9-6.1", "pageIndex": 0},
            ],
            "markdown": "| 检验项目 | 结果 | 单位 | 参考范围 |\n|---------|------|------|---------|\n| 收缩压 | 120 | mmHg | 90-140 |\n| 舒张压 | 80 | mmHg | 60-90 |\n| 血糖 | 5.2 | mmol/L | 3.9-6.1 |"
        }
    
    def _format_result(self, ocr_result, filename: str) -> dict:
        """格式化 PaddleOCR 输出为统一结构"""
        # 将 PaddleOCR 的 OCR 结果转换为结构化格式
        # 实际实现时需要根据 PaddleOCR 的输出格式进行转换
        tables = []
        indicators = []
        
        if ocr_result and ocr_result[0]:
            for line in ocr_result[0]:
                text = line[1][0]
                bbox = line[0]
                # 解析文本提取指标
                # 这里简化处理
                pass
        
        return {
            "success": True,
            "pageCount": 1,
            "reportDate": None,
            "tables": tables,
            "indicators": indicators,
            "markdown": ""
        }