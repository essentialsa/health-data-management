# 体检报告解析服务

基于 FastAPI + PaddleOCR-VL-1.5 的本地体检报告解析服务。

## 快速开始

### 方式一：Mock 模式（开发测试，无需安装 PaddleOCR）
```bash
cd report-parser
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

### 方式二：真实模式（需要 PaddleOCR）
```bash
pip install paddlepaddle paddleocr
USE_MOCK=false uvicorn main:app --host 127.0.0.1 --port 8000
```

### 方式三：Docker
```bash
docker build -t report-parser .
docker run -d -p 8000:8000 --name report-parser report-parser
```

## API

### 健康检查
```
GET /api/health
```

### 解析报告
```
POST /api/parse
Content-Type: multipart/form-data

file: <PDF or image file>
```

## 性能
- CPU 推理：约 2-5 秒/页
- GPU 推理：约 <1 秒/页
- Mock 模式：即时返回