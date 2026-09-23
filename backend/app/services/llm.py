"""A shared structured-output boundary with one schema retry and safe errors."""
import os
from functools import lru_cache
from typing import TypeVar

from openai import APIError, OpenAI
from pydantic import BaseModel, ValidationError

Schema = TypeVar("Schema", bound=BaseModel)


class LLMError(Exception):
    """Safe, user-facing error; never expose provider responses or credentials."""


@lru_cache(maxsize=1)
def get_client() -> OpenAI:
    key = os.getenv("OPENAI_API_KEY", "").strip()
    if not key:
        raise LLMError("OpenAI is not configured. Set OPENAI_API_KEY and retry.")
    # Disable SDK retries so a provider failure has a predictable latency bound.
    return OpenAI(api_key=key, timeout=45, max_retries=0)


def structured_output(instructions: str, content: str, schema: type[Schema]) -> Schema:
    client = get_client()
    for attempt in range(2):
        try:
            response = client.responses.parse(
                model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
                input=[{"role": "system", "content": instructions}, {"role": "user", "content": content}],
                text_format=schema,
                max_output_tokens=4000,
                store=False,
            )
            if response.output_parsed is None:
                raise ValueError("Missing structured output or refusal")
            return schema.model_validate(response.output_parsed)
        except (ValidationError, ValueError):
            if attempt == 0:
                instructions += "\nThe last output was invalid. Return a complete object matching the requested schema."
                continue
            raise LLMError("OpenAI returned an invalid structured result twice. Please retry.") from None
        except APIError:
            raise LLMError("OpenAI could not complete the request. Check API access, quota, or connectivity and retry.") from None
    raise AssertionError("unreachable")
