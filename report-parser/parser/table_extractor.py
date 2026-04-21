"""表格结构化提取"""
from typing import List, Dict, Any


def extract_table_structure(cells: List[Dict]) -> Dict[str, Any]:
    """从 PaddleOCR 输出中提取表格结构"""
    if not cells:
        return {"headers": [], "rows": [], "cells": []}
    
    # 识别表头（通常是第一行）
    max_row = max(c.get("row", 0) for c in cells)
    headers = [c["text"] for c in cells if c.get("row") == 0]
    
    # 提取数据行
    rows = []
    for row_idx in range(1, max_row + 1):
        row_cells = [c for c in cells if c.get("row") == row_idx]
        row = {c.get("col", 0): c["text"] for c in row_cells}
        rows.append(row)
    
    return {"headers": headers, "rows": rows, "cells": cells}