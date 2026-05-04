import httpx

from parser.llm_structurer import LLMStructurer, get_llm_structuring_status


def clear_llm_env(monkeypatch):
    for name in (
        "OCR_LLM_ENABLED",
        "OCR_LLM_API_KEY",
        "OCR_LLM_BASE_URL",
        "OCR_LLM_MODEL",
        "OPENAI_API_KEY",
        "OPENAI_BASE_URL",
        "OPENAI_MODEL",
        "LLM_API_KEY",
        "LLM_BASE_URL",
        "LLM_MODEL",
    ):
        monkeypatch.delenv(name, raising=False)


def test_llm_structuring_disabled_without_api_key(monkeypatch):
    clear_llm_env(monkeypatch)
    status = get_llm_structuring_status()

    assert status["api_key_configured"] is False
    assert status["enabled"] is False

    structurer = LLMStructurer()
    assert structurer.enabled is False


def test_llm_structurer_normalizes_response_and_filters_metadata(monkeypatch):
    clear_llm_env(monkeypatch)
    monkeypatch.setenv("OCR_LLM_ENABLED", "true")
    monkeypatch.setenv("OCR_LLM_API_KEY", "test-key")
    monkeypatch.setenv("OCR_LLM_BASE_URL", "https://api.openai.com/v1")
    monkeypatch.setenv("OCR_LLM_MODEL", "gpt-4o-mini")

    captured = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        captured["timeout"] = timeout
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": """{
                                "reportDate": "2026/05/04",
                                "indicators": [
                                    {"rawLabel": "白细胞(WBC)", "value": 6.5, "unit": "g/L", "referenceRange": "3.5-9.5", "pageIndex": 0},
                                    {"rawLabel": "报告日期", "value": 20260504, "unit": "", "referenceRange": "", "pageIndex": 0},
                                    {"rawLabel": "白细胞(WBC)", "value": 6.5, "unit": "g/L", "referenceRange": "3.5-9.5", "pageIndex": 0}
                                ]
                            }"""
                        }
                    }
                ]
            },
        )

    monkeypatch.setattr(httpx, "post", fake_post)

    structurer = LLMStructurer()
    result = structurer.structure_report(
        page_count=1,
        report_date_candidate="",
        page_contexts=[{"pageIndex": 0, "allText": "白细胞(WBC) 6.5 g/L 报告日期 2026/05/04", "markdown": ""}],
        heuristic_indicators=[],
    )

    assert captured["url"] == "https://api.openai.com/v1/chat/completions"
    assert captured["json"]["response_format"]["type"] == "json_schema"
    assert captured["json"]["max_tokens"] == 1600
    assert result == {
        "reportDate": "2026-05-04",
        "indicators": [
            {
                "rawLabel": "白细胞(WBC)",
                "value": 6.5,
                "unit": "g/L",
                "referenceRange": "3.5-9.5",
                "pageIndex": 0,
            }
        ],
    }


def test_llm_structurer_falls_back_to_plain_json_extraction(monkeypatch):
    clear_llm_env(monkeypatch)
    monkeypatch.setenv("OCR_LLM_ENABLED", "true")
    monkeypatch.setenv("OCR_LLM_API_KEY", "test-key")

    calls = []

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append(json)
        if len(calls) < 3:
            return httpx.Response(400, json={"error": {"message": "unsupported response_format"}})
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": """```json
                            {
                              "reportDate": "2026-05-04",
                              "indicators": [
                                {"rawLabel": "血糖(GLU)", "value": 6.4, "unit": "mmol/L", "referenceRange": "3.9-6.1", "pageIndex": 0}
                              ]
                            }
                            ```"""
                        }
                    }
                ]
            },
        )

    monkeypatch.setattr(httpx, "post", fake_post)

    structurer = LLMStructurer()
    result = structurer.structure_report(
        page_count=1,
        report_date_candidate="",
        page_contexts=[{"pageIndex": 0, "allText": "血糖(GLU) 6.4 mmol/L", "markdown": ""}],
        heuristic_indicators=[],
    )

    assert len(calls) == 3
    assert calls[0]["response_format"]["type"] == "json_schema"
    assert calls[1]["response_format"]["type"] == "json_object"
    assert "response_format" not in calls[2]
    assert result == {
        "reportDate": "2026-05-04",
        "indicators": [
            {
                "rawLabel": "血糖(GLU)",
                "value": 6.4,
                "unit": "mmol/L",
                "referenceRange": "3.9-6.1",
                "pageIndex": 0,
            }
        ],
    }
