#!/usr/bin/env python3
"""
Runs one browser-use Agent against a plain-English goal, then reads back
page state so the Node benchmark can apply the SAME pass/fail checker used
for the other tools. This is the "goal-driven" adapter: unlike BrowseLens
and agent-browser (given the exact steps to perform), browser-use's own
LLM decides how to accomplish the goal.

Usage: browser_use_task.py <fixture_url> <goal> <task_id>

Prints exactly one line of JSON to stdout:
  {"ok": true, "result": "..."}                on success
  {"ok": false, "error": "...", "skipped": true} if no LLM credentials
  {"ok": false, "error": "..."}                 on any other failure

Exit code: 0 = ok, 2 = skipped (no credentials), 1 = any other failure.
"""
import asyncio
import json
import os
import sys


def pick_llm():
    """Pick whichever supported LLM provider has credentials in the environment."""
    if os.environ.get('ANTHROPIC_API_KEY'):
        from browser_use import ChatAnthropic
        return ChatAnthropic(model='claude-3-5-haiku-latest')
    if os.environ.get('OPENAI_API_KEY'):
        from browser_use import ChatOpenAI
        return ChatOpenAI(model='gpt-4o-mini')
    if os.environ.get('GOOGLE_API_KEY') or os.environ.get('GEMINI_API_KEY'):
        from browser_use import ChatGoogle
        return ChatGoogle(model='gemini-2.0-flash')
    return None


async def run(fixture_url: str, goal: str, task_id: str) -> dict:
    from browser_use import Agent, BrowserSession

    session = BrowserSession(headless=True, enable_default_extensions=False)
    try:
        await session.start()
        page = await session.must_get_current_page()
        await page.goto(fixture_url)

        llm = pick_llm()
        agent = Agent(task=goal, llm=llm, browser_session=session, use_vision=False)
        await agent.run(max_steps=10)

        if task_id == 'open-url':
            result = await page.get_title()
        else:
            result = await page.evaluate('document.body.innerText')

        return {'ok': True, 'result': result}
    finally:
        await session.stop()


def main() -> int:
    fixture_url, goal, task_id = sys.argv[1], sys.argv[2], sys.argv[3]

    if pick_llm() is None:
        print(json.dumps({
            'ok': False,
            'skipped': True,
            'error': 'no LLM credentials configured (set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY/GEMINI_API_KEY)'
        }))
        return 2

    try:
        outcome = asyncio.run(run(fixture_url, goal, task_id))
        print(json.dumps(outcome))
        return 0
    except Exception as exc:  # report any failure back to Node as data, not a crash
        print(json.dumps({'ok': False, 'error': str(exc)}))
        return 1


if __name__ == '__main__':
    sys.exit(main())
