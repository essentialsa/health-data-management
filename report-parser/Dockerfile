FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 可选：安装 PaddleOCR（取消注释以启用）
# RUN pip install --no-cache-dir paddlepaddle paddleocr

COPY . .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]