FROM python:3.10-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -c "from pathlib import Path; import paddleocr; utility = Path(paddleocr.__file__).resolve().parent / 'tools' / 'infer' / 'utility.py'; src = utility.read_text(encoding='utf-8'); old = 'config.switch_ir_optim(True)'; new = 'config.switch_ir_optim(False)'; \
assert old in src, 'paddleocr utility.py patch target not found'; \
utility.write_text(src.replace(old, new), encoding='utf-8')"

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
