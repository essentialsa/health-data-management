"""API 测试"""
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


def test_parse_report_mock():
    # 使用 mock 文件测试
    import io
    response = client.post(
        "/api/parse",
        files={"file": ("test.pdf", io.BytesIO(b"fake pdf content"), "application/pdf")}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["indicators"]) > 0
    labels = {item["rawLabel"] for item in data["indicators"]}
    assert "白细胞(WBC)" in labels


def test_parse_report_file_too_large():
    import io
    large_content = b"x" * (51 * 1024 * 1024)  # 51MB
    response = client.post(
        "/api/parse",
        files={"file": ("large.pdf", io.BytesIO(large_content), "application/pdf")}
    )
    assert response.status_code == 400
