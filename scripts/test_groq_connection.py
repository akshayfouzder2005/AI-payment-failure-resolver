"""
One-off, manual connectivity check for Groq — confirms GROQ_API_KEY is
valid and the configured model responds, BEFORE wiring the real AI
decision engine to it. Deliberately not part of the pytest suite, same
reasoning as scripts/verify_razorpay_live.py: pytest never needs real
network access or real credentials (conftest.py forces AI_PROVIDER=mock
for the whole suite), and this script does the opposite on purpose — it
makes one real HTTP call to Groq's actual API.

Logs only safe metadata (model name, token counts, latency) — never the
API key, never full prompt/response content.

Run:

    cd backend
    # in .env: GROQ_API_KEY=gsk_...
    python scripts/test_groq_connection.py

Never commit real credentials — they belong in backend/.env only (which
is already gitignored), never in this file or in chat.
"""
import sys
import time
from pathlib import Path

# scripts/test_groq_connection.py lives one level below backend/ — add
# backend/ itself to sys.path so `from app...` resolves regardless of
# where this is invoked from.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import groq

from app.config import get_settings


def main() -> int:
    settings = get_settings()

    if not settings.groq_api_key:
        print("FAILURE: GROQ_API_KEY is not set in backend/.env.")
        return 1

    client = groq.Groq(
        api_key=settings.groq_api_key,
        timeout=settings.ai_request_timeout_seconds,
        max_retries=settings.groq_max_retries,
    )

    print(f"Calling Groq ({settings.groq_model_name})...")
    start = time.monotonic()

    try:
        response = client.chat.completions.create(
            model=settings.groq_model_name,
            messages=[
                {"role": "user", "content": "Reply with exactly one word: OK"},
            ],
            # openai/gpt-oss-20b is a reasoning model — with no reasoning_*
            # params it spends part of the token budget on an internal
            # chain-of-thought concatenated straight into content (no
            # separator), which is what a low max_completion_tokens would
            # actually be measuring instead of the answer. Suppress that
            # here so this checks connectivity, not reasoning-token luck.
            reasoning_effort="low",
            reasoning_format="hidden",
            max_completion_tokens=50,
        )
    except groq.AuthenticationError as exc:
        print(f"FAILURE: authentication rejected — check GROQ_API_KEY. ({exc})")
        return 1
    except groq.APITimeoutError:
        print(f"FAILURE: request timed out after {settings.ai_request_timeout_seconds}s.")
        return 1
    except groq.RateLimitError as exc:
        print(f"FAILURE: rate limited. ({exc})")
        return 1
    except groq.APIError as exc:
        print(f"FAILURE: Groq API error. ({exc})")
        return 1
    except Exception as exc:  # network/anything else the SDK raises
        print(f"FAILURE: request failed. ({exc})")
        return 1

    elapsed_ms = (time.monotonic() - start) * 1000
    choice = response.choices[0]

    print()
    print("SUCCESS")
    print("model:          ", response.model)
    print("finish_reason:  ", choice.finish_reason)
    print("latency_ms:     ", round(elapsed_ms, 1))
    print("prompt_tokens:  ", response.usage.prompt_tokens if response.usage else None)
    print("completion_tokens:", response.usage.completion_tokens if response.usage else None)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
