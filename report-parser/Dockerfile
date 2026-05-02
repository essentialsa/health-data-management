FROM python:3.10-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 预下载 PaddleOCR 中文模型，减少 Render 首次请求超时风险
ENV PADDLE_OCR_BASE_DIR=/app/.paddleocr
RUN python -c "from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=True, lang='ch', show_log=False)"

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
