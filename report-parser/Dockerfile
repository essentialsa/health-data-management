FROM python:3.10-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV PADDLE_MODEL_ROOT=/opt/paddleocr/models
ENV PADDLE_DET_MODEL_DIR=/opt/paddleocr/models/ch_PP-OCRv2_det_infer
ENV PADDLE_REC_MODEL_DIR=/opt/paddleocr/models/ch_PP-OCRv2_rec_infer
ENV PADDLE_CLS_MODEL_DIR=/opt/paddleocr/models/ch_ppocr_mobile_v2.0_cls_infer

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libgl1 libglib2.0-0 libgomp1 libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -c "import sysconfig; from pathlib import Path; utility = Path(sysconfig.get_paths()['purelib']) / 'paddleocr' / 'tools' / 'infer' / 'utility.py'; src = utility.read_text(encoding='utf-8'); old = 'config.switch_ir_optim(True)'; new = 'config.switch_ir_optim(False)'; \
assert old in src, 'paddleocr utility.py patch target not found'; \
utility.write_text(src.replace(old, new), encoding='utf-8')"
RUN mkdir -p "${PADDLE_MODEL_ROOT}" \
    && curl -fsSL "https://paddleocr.bj.bcebos.com/PP-OCRv2/chinese/ch_PP-OCRv2_det_infer.tar" -o /tmp/ch_PP-OCRv2_det_infer.tar \
    && tar -xf /tmp/ch_PP-OCRv2_det_infer.tar -C "${PADDLE_MODEL_ROOT}" \
    && curl -fsSL "https://paddleocr.bj.bcebos.com/PP-OCRv2/chinese/ch_PP-OCRv2_rec_infer.tar" -o /tmp/ch_PP-OCRv2_rec_infer.tar \
    && tar -xf /tmp/ch_PP-OCRv2_rec_infer.tar -C "${PADDLE_MODEL_ROOT}" \
    && curl -fsSL "https://paddleocr.bj.bcebos.com/dygraph_v2.0/ch/ch_ppocr_mobile_v2.0_cls_infer.tar" -o /tmp/ch_ppocr_mobile_v2.0_cls_infer.tar \
    && tar -xf /tmp/ch_ppocr_mobile_v2.0_cls_infer.tar -C "${PADDLE_MODEL_ROOT}" \
    && rm -f /tmp/ch_PP-OCRv2_det_infer.tar /tmp/ch_PP-OCRv2_rec_infer.tar /tmp/ch_ppocr_mobile_v2.0_cls_infer.tar

COPY . .

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
