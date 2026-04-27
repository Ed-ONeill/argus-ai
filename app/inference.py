"""
app/inference.py — Interactive CLI chat interface
Usage:
    python -m app.inference                    # interactive chat
    python -m app.inference --once "Tell me a joke"
    python -m app.inference --model llama3.2   # override model
    python -m app.inference --backend openai   # override backend
    python -m app.inference --no-stream        # disable streaming
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime
from pathlib import Path

from app.config import settings
from app.model import Message, get_client

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, settings.log_level, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger(__name__)

# ── Try to import Rich for pretty output (optional) ───────────────────────────
try:
    from rich.console import Console
    from rich.markdown import Markdown
    from rich.panel import Panel
    from rich.prompt import Prompt
    console = Console()
    HAS_RICH = True
except ImportError:
    HAS_RICH = False


def _print_header():
    if HAS_RICH:
        console.print(Panel(
            f"[bold cyan]{settings.assistant_name}[/bold cyan] — Personal LLM Assistant\n"
            f"[dim]Backend: {settings.llm_backend.value}  |  Model: {settings.active_model}[/dim]\n"
            f"[dim]Type [bold]exit[/bold] or [bold]quit[/bold] to leave. "
            f"Type [bold]/clear[/bold] to reset conversation.[/dim]",
            border_style="cyan",
        ))
    else:
        print(f"\n{'='*60}")
        print(f"  {settings.assistant_name} — Personal LLM Assistant")
        print(f"  Backend: {settings.llm_backend.value}  |  Model: {settings.active_model}")
        print(f"  Type 'exit' to quit, '/clear' to reset conversation.")
        print(f"{'='*60}\n")


def _save_conversation(history: list[Message]):
    if not settings.save_conversations:
        return
    path = settings.conversations_dir / f"{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)
    if HAS_RICH:
        console.print(f"[dim]Conversation saved → {path}[/dim]")
    else:
        print(f"[Saved: {path}]")


def _stream_response(client, messages: list[Message]) -> str:
    """Stream response to console, return full text."""
    full = []
    if HAS_RICH:
        console.print(f"\n[bold green]{settings.assistant_name}:[/bold green] ", end="")
    else:
        print(f"\n{settings.assistant_name}: ", end="", flush=True)

    for chunk in client.chat(messages, stream=True):
        print(chunk, end="", flush=True)
        full.append(chunk)

    print()  # newline after stream ends
    return "".join(full)


def _static_response(client, messages: list[Message]) -> str:
    """Get full response at once."""
    response = client.chat(messages, stream=False)
    if HAS_RICH:
        console.print(f"\n[bold green]{settings.assistant_name}:[/bold green]")
        console.print(Markdown(response))
    else:
        print(f"\n{settings.assistant_name}:\n{response}")
    return response


def run_chat(stream: bool = True, once: str | None = None):
    """Main chat loop."""
    client = get_client()

    # Check backend is reachable
    if not client.is_available():
        msg = (
            f"Cannot reach backend '{settings.llm_backend.value}'. "
            f"Make sure it is running at {settings.active_base_url or 'API endpoint'}."
        )
        if settings.llm_backend.value == "ollama":
            msg += "\n  → Start Ollama: run 'ollama serve' in a terminal"
            msg += f"\n  → Pull model:   run 'ollama pull {settings.ollama_model}'"
        if HAS_RICH:
            console.print(f"[bold red]Error:[/bold red] {msg}")
        else:
            print(f"ERROR: {msg}")
        sys.exit(1)

    history: list[Message] = [Message.system(settings.system_prompt)]

    if not once:
        _print_header()

    if once:
        # Single-shot mode
        history.append(Message.user(once))
        if stream:
            reply = _stream_response(client, history)
        else:
            reply = _static_response(client, history)
        history.append(Message.assistant(reply))
        _save_conversation(history)
        return

    # Interactive loop
    while True:
        try:
            if HAS_RICH:
                user_input = Prompt.ask(f"\n[bold yellow]You[/bold yellow]")
            else:
                user_input = input("\nYou: ")
        except (KeyboardInterrupt, EOFError):
            print("\nGoodbye!")
            _save_conversation(history)
            break

        user_input = user_input.strip()
        if not user_input:
            continue

        if user_input.lower() in ("exit", "quit", "q"):
            _save_conversation(history)
            if HAS_RICH:
                console.print("[dim]Goodbye![/dim]")
            else:
                print("Goodbye!")
            break

        if user_input == "/clear":
            history = [Message.system(settings.system_prompt)]
            if HAS_RICH:
                console.print("[dim]Conversation cleared.[/dim]")
            else:
                print("[Conversation cleared]")
            continue

        if user_input == "/history":
            for m in history[1:]:  # skip system prompt
                role = m["role"].upper()
                print(f"[{role}] {m['content'][:120]}{'...' if len(m['content'])>120 else ''}")
            continue

        if user_input == "/models":
            models = client.list_models()
            print("Available models:\n  " + "\n  ".join(models) if models else "  (none found)")
            continue

        history.append(Message.user(user_input))

        try:
            if stream:
                reply = _stream_response(client, history)
            else:
                reply = _static_response(client, history)
            history.append(Message.assistant(reply))
        except Exception as e:
            log.error(f"Inference error: {e}")
            if HAS_RICH:
                console.print(f"[bold red]Error:[/bold red] {e}")
            else:
                print(f"Error: {e}")


# ── CLI entry point ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=f"{settings.assistant_name} — Personal LLM CLI"
    )
    parser.add_argument("--once", "-o", type=str, default=None,
                        help="Send a single message and exit")
    parser.add_argument("--no-stream", action="store_true",
                        help="Disable streaming output")
    parser.add_argument("--model", "-m", type=str, default=None,
                        help="Override the model name (e.g. llama3.2, mistral)")
    parser.add_argument("--backend", "-b", type=str, default=None,
                        help="Override backend: ollama | openai | lmstudio")
    args = parser.parse_args()

    # Apply CLI overrides to settings
    if args.model:
        if settings.llm_backend.value == "ollama":
            settings.ollama_model = args.model
        elif settings.llm_backend.value == "openai":
            settings.openai_model = args.model
    if args.backend:
        from app.config import Backend
        settings.llm_backend = Backend(args.backend)

    run_chat(
        stream=not args.no_stream,
        once=args.once,
    )
