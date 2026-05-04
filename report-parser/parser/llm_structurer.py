"""OCR 文本的 LLM 结构化模块。"""
import json
import logging
import math
import os
import re
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger("medical-report-llm")

REPORT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "reportDate": {
            "type": "string",
            "description": "报告日期，格式为 YYYY-MM-DD；如果无法确认则返回空字符串。",
        },
        "indicators": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "rawLabel": {"type": "string"},
                    "value": {"type": "number"},
                    "unit": {"type": "string"},
                    "referenceRange": {"type": "string"},
                    "pageIndex": {"type": "integer", "minimum": 0},
                },
                "required": ["rawLabel", "value", "unit", "referenceRange", "pageIndex"],
            },
        },
    },
    "required": ["reportDate", "indicators"],
}

SYSTEM_PROMPT = """
你是中文医疗检验报告结构化助手。你的任务是把 OCR 识别出的体检/化验报告文本整理成结构化指标。

严格遵守以下规则：
1. 只提取检验指标、体征指标，不要输出姓名、性别、年龄、日期、时间、编号、条码、结论、建议、表头、页脚。
2. 如果同一指标同时出现中文名和英文缩写，rawLabel 优先输出“中文名(缩写)”，例如“白细胞(WBC)”。
3. 如果没有中文名，只保留原始英文缩写，例如“ALT”。
4. value 必须是纯数字；如果源文本有箭头、星号、H/L、<、> 等修饰，去掉修饰，仅保留数值本身。
5. unit 保留原报告中的单位；没有单位就返回空字符串。
6. referenceRange 保留原报告中的参考范围；没有参考范围就返回空字符串。
7. pageIndex 从 0 开始。
8. 不要把日期、时间、报告号、身份证号、手机号、医院名称等误识别成指标。
9. 不要猜测不存在的指标；不确定就不要输出。
10. 如果同一页出现完全重复的指标行，只保留一条。
11. 返回结果必须是 JSON，并符合给定 schema。
""".strip()

METADATA_KEYWORDS = (
    "report date",
    "sample date",
    "test date",
    "collection date",
    "检验日期",
    "报告日期",
    "采样日期",
    "送检日期",
    "日期",
    "报告时间",
    "打印时间",
    "姓名",
    "性别",
    "年龄",
    "条码",
    "编号",
)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _first_env(*names: str) -> Optional[str]:
    for name in names:
        value = os.getenv(name, "").strip()
        if value:
            return value
    return None


def _normalize_unit(value: str) -> str:
    return (
        value.strip()
        .lower()
        .replace("µ", "u")
        .replace("μ", "u")
        .replace("×", "x")
        .replace("＊", "*")
        .replace("／", "/")
        .replace(" ", "")
    )


def _normalize_label(value: str) -> str:
    return re.sub(r"[\s_：:()（）[\]【】{}<>《》,，、;；/\\|+\-.]+", "", value.strip().lower())


def _extract_json_text(content: Any) -> Optional[str]:
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        texts: List[str] = []
        for item in content:
            if isinstance(item, str):
                texts.append(item)
                continue
            if not isinstance(item, dict):
                continue
            if isinstance(item.get("text"), str):
                texts.append(item["text"])
                continue
            if item.get("type") == "text":
                text = item.get("text")
                if isinstance(text, dict) and isinstance(text.get("value"), str):
                    texts.append(text["value"])
        joined = "\n".join(part for part in texts if part)
        return joined or None

    return None


def _strip_code_fences(value: str) -> str:
    text = value.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _extract_first_json_object(value: str) -> Optional[str]:
    text = _strip_code_fences(value)
    start = text.find("{")
    if start < 0:
        return None

    depth = 0
    in_string = False
    escape = False
    for index, char in enumerate(text[start:], start=start):
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
            continue
        if char == "{":
            depth += 1
            continue
        if char == "}":
            depth -= 1
            if depth == 0:
                return text[start:index + 1]
    return None


def _normalize_report_date(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip()
    if not text:
        return ""

    patterns = [
        r"(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})",
        r"(\d{4})\s*(\d{1,2})\s*(\d{1,2})",
    ]
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            year, month, day = match.groups()
            return f"{year}-{int(month):02d}-{int(day):02d}"
    return ""


def get_llm_structuring_status() -> Dict[str, Any]:
    api_key = _first_env("OCR_LLM_API_KEY", "OPENAI_API_KEY", "LLM_API_KEY")
    base_url = _first_env("OCR_LLM_BASE_URL", "OPENAI_BASE_URL", "LLM_BASE_URL") or "https://api.openai.com/v1"
    model = _first_env("OCR_LLM_MODEL", "OPENAI_MODEL", "LLM_MODEL") or "gpt-4o-mini"
    requested_enabled = _env_bool("OCR_LLM_ENABLED", bool(api_key))
    enabled = requested_enabled and bool(api_key)
    return {
        "enabled": enabled,
        "requested_enabled": requested_enabled,
        "api_key_configured": bool(api_key),
        "base_url": base_url.rstrip("/"),
        "model": model,
        "timeout_sec": max(5, int(os.getenv("OCR_LLM_TIMEOUT_SEC", "45"))),
        "max_output_tokens": max(400, int(os.getenv("OCR_LLM_MAX_OUTPUT_TOKENS", "1600"))),
    }


class LLMStructurer:
    def __init__(self) -> None:
        self.runtime_config = get_llm_structuring_status()
        self.enabled = bool(self.runtime_config["enabled"])
        self.base_url = str(self.runtime_config["base_url"]).rstrip("/")
        self.model = str(self.runtime_config["model"])
        self.timeout_sec = int(self.runtime_config["timeout_sec"])
        self.max_output_tokens = int(self.runtime_config["max_output_tokens"])
        self.api_key = _first_env("OCR_LLM_API_KEY", "OPENAI_API_KEY", "LLM_API_KEY") or ""

    def structure_report(
        self,
        *,
        page_count: int,
        report_date_candidate: Optional[str],
        page_contexts: List[Dict[str, Any]],
        heuristic_indicators: List[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        if not self.enabled:
            return None

        request_payload = self._build_request_payload(
            page_count=page_count,
            report_date_candidate=report_date_candidate,
            page_contexts=page_contexts,
            heuristic_indicators=heuristic_indicators,
        )

        parsed = None
        request_modes = ("schema", "json_object", "plain")
        for request_mode in request_modes:
            try:
                parsed = self._request_structured_json(request_payload, request_mode=request_mode)
                break
            except Exception as exc:
                logger.warning("ocr_llm_structuring_%s_failed error=%s", request_mode, exc)

        if parsed is None:
            return None

        normalized = self._normalize_result(parsed, page_count=page_count)
        if not normalized["indicators"]:
            return None
        return normalized

    def _build_request_payload(
        self,
        *,
        page_count: int,
        report_date_candidate: Optional[str],
        page_contexts: List[Dict[str, Any]],
        heuristic_indicators: List[Dict[str, Any]],
    ) -> str:
        compact_pages: List[Dict[str, Any]] = []
        for page in page_contexts:
            compact_pages.append({
                "pageIndex": page.get("pageIndex", 0),
                "ocrText": self._trim_text(str(page.get("allText", "")), 7000),
                "tableMarkdown": self._trim_text(str(page.get("markdown", "")), 3500),
            })

        compact_indicators = [
            {
                "rawLabel": str(item.get("rawLabel", "")),
                "value": item.get("value"),
                "unit": str(item.get("unit", "")),
                "referenceRange": str(item.get("referenceRange", "")),
                "pageIndex": int(item.get("pageIndex", 0)),
            }
            for item in heuristic_indicators[:120]
        ]

        payload = {
            "pageCount": page_count,
            "reportDateCandidate": report_date_candidate or "",
            "heuristicIndicators": compact_indicators,
            "pages": compact_pages,
        }
        return json.dumps(payload, ensure_ascii=False)

    def _request_structured_json(self, request_payload: str, *, request_mode: str) -> Dict[str, Any]:
        url = f"{self.base_url}/chat/completions"
        if request_mode == "schema":
            user_message = "以下是 OCR 识别结果，请输出符合 schema 的 JSON。\n" + request_payload
        elif request_mode == "json_object":
            user_message = "以下是 OCR 识别结果，请只返回一个 JSON 对象，不要输出额外说明。\n" + request_payload
        else:
            user_message = (
                "以下是 OCR 识别结果，请只返回 JSON，不要输出解释、Markdown、代码块标题或任何额外文字。\n"
                + request_payload
            )

        body: Dict[str, Any] = {
            "model": self.model,
            "temperature": 0,
            "max_tokens": self.max_output_tokens,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
        }
        if request_mode == "schema":
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "medical_report_structured",
                    "strict": True,
                    "schema": REPORT_SCHEMA,
                },
            }
        elif request_mode == "json_object":
            body["response_format"] = {"type": "json_object"}

        response = httpx.post(
            url,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=self.timeout_sec,
        )
        response.raise_for_status()
        payload = response.json()

        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            raise RuntimeError("LLM 未返回 choices")

        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        if not isinstance(message, dict):
            raise RuntimeError("LLM 返回内容格式错误")

        if isinstance(message.get("refusal"), str) and message["refusal"].strip():
            raise RuntimeError(f"LLM 拒绝处理: {message['refusal'].strip()}")

        content = _extract_json_text(message.get("content"))
        if not content:
            raise RuntimeError("LLM 未返回可解析内容")

        content = _strip_code_fences(content)
        if request_mode == "plain":
            content = _extract_first_json_object(content) or content

        try:
            return json.loads(content)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"LLM JSON 解析失败: {exc}") from exc

    def _normalize_result(self, payload: Dict[str, Any], *, page_count: int) -> Dict[str, Any]:
        raw_indicators = payload.get("indicators")
        if not isinstance(raw_indicators, list):
            raw_indicators = []

        indicators: List[Dict[str, Any]] = []
        dedupe = set()

        for item in raw_indicators:
            if not isinstance(item, dict):
                continue

            label = str(item.get("rawLabel", "")).strip()
            if not label:
                continue

            normalized_label = label.lower()
            if any(keyword in normalized_label for keyword in METADATA_KEYWORDS):
                continue

            try:
                value = float(item.get("value"))
            except (TypeError, ValueError):
                continue

            if not math.isfinite(value):
                continue

            unit = str(item.get("unit", "")).strip()
            reference_range = str(item.get("referenceRange", "")).strip()

            try:
                page_index = int(item.get("pageIndex", 0))
            except (TypeError, ValueError):
                page_index = 0

            if page_index < 0:
                page_index = 0
            if page_count > 0:
                page_index = min(page_index, page_count - 1)

            dedupe_key = (
                page_index,
                _normalize_label(label),
                round(value, 6),
                _normalize_unit(unit),
                reference_range.strip().lower(),
            )
            if dedupe_key in dedupe:
                continue
            dedupe.add(dedupe_key)

            indicators.append({
                "rawLabel": label,
                "value": value,
                "unit": unit,
                "referenceRange": reference_range,
                "pageIndex": page_index,
            })

        return {
            "reportDate": _normalize_report_date(payload.get("reportDate")),
            "indicators": indicators,
        }

    @staticmethod
    def _trim_text(value: str, limit: int) -> str:
        text = value.strip()
        if len(text) <= limit:
            return text
        return f"{text[:limit]}..."
