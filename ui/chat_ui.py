"""
ui/chat_ui.py — Argus AI web interface
Phase 5: Persistent memory + personalisation

New in Phase 5
  - Memory accordion: view / add / edit / delete persistent memories
  - "Use memory" toggle: inject relevant memories into every prompt
  - Chat commands: /remember, /forget, /memory  (handled before LLM, instant)

Phase 4 features retained
  - File upload + document indexing (RAG)
  - "Use documents" toggle

Phase 2/3 features retained
  - Streaming chat, session history, session persistence
  - Model picker, temperature, system prompt editor, export

Launch:
    python -m ui.chat_ui
    python -m ui.chat_ui --port 7861
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import gradio as gr

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.analyst      import run_deal_analysis
from app.config       import settings
from app.docs         import build_rag_context, get_store
from app.memory       import Session, SessionManager, session_manager
from app.memory_store import CATEGORIES, handle_command, memory_store
from app.model        import Message, get_client
from ui.market_feed   import build_feed_tab

# ── CSS ───────────────────────────────────────────────────────────────────────
CSS = """
body, .gradio-container { font-family: 'Inter', system-ui, sans-serif !important; }
#sidebar { border-right: 1px solid #e5e7eb; padding-right: 8px; }
#chatbox { border-radius: 12px; }
.message.user { background: #1F3864 !important; color: #fff !important;
                border-radius: 16px 16px 4px 16px !important; }
.message.bot  { background: #f3f4f6 !important; color: #111827 !important;
                border-radius: 16px 16px 16px 4px !important; }
#new-btn, #send-btn { background: #1F3864 !important; color: #fff !important; }
#analyze-btn { border: 1.5px solid #1F3864 !important; color: #1F3864 !important;
               font-weight: 600 !important; }
#analyze-btn:hover { background: #1F3864 !important; color: #fff !important; }
#status { font-size: 12px; color: #6b7280; padding: 4px 0; }
.doc-list textarea, .mem-list textarea { font-size: 12px !important; font-family: monospace !important; }
"""

# ── Helpers ───────────────────────────────────────────────────────────────────

def _list_ollama_models() -> list[str]:
    try:
        import ollama
        client = ollama.Client(host=settings.ollama_host)
        return [m["model"] for m in client.list().get("models", [])]
    except Exception:
        return [settings.ollama_model]


def _format_sessions(sm: SessionManager) -> list[str]:
    sessions = sm.list_sessions()
    if not sessions:
        return ["(no saved chats)"]
    return [f"{s['name']}  [{s['id']}]  ({s['messages']} msgs)" for s in sessions]


def _parse_id(label: str) -> str | None:
    import re
    m = re.search(r"\[([^\]]+)\]", label)
    return m.group(1) if m else None


def _doc_list_text(session_id: str | None) -> str:
    if not session_id:
        return "No documents loaded."
    store  = get_store(session_id)
    counts = store.file_chunk_counts()
    if not counts:
        return "No documents loaded."
    lines = [f"• {fn}  ({n} chunks)" for fn, n in counts.items()]
    lines.append(f"\nTotal: {store.chunk_count} chunks")
    return "\n".join(lines)


# ── Chat function (streaming + optional RAG + optional memory) ────────────────

def chat_fn(
    user_message:  str,
    history:       list[dict],
    session_state: dict,
    model_name:    str,
    temperature:   float,
    system_prompt: str,
    use_docs:      bool,
    use_memory:    bool,
):
    """
    Core streaming generator.  Runs for every user message.

    Context window order (all are system messages):
        1. base system_prompt
        2. memory block     (if use_memory and memories exist)
        3. RAG block        (if use_docs and relevant chunks found)
        4. conversation history
        5. current user message

    Commands (/remember, /forget, /memory) are intercepted here and
    resolved instantly — the LLM is never called for them.
    """
    if not user_message.strip():
        yield history, session_state, ""
        return

    # ── Intercept chat commands ───────────────────────────────────────────────
    cmd_response, was_command = handle_command(user_message)
    if was_command:
        history = history + [
            {"role": "user",      "content": user_message},
            {"role": "assistant", "content": cmd_response},
        ]
        # Persist to session history
        sm  = session_manager
        sid = session_state.get("id")
        if sid:
            session = sm.load(sid) or Session(session_id=sid, system_prompt=system_prompt)
        else:
            session = Session(system_prompt=system_prompt)
            session_state = {"id": session.id}
        session.add("user", user_message)
        session.add("assistant", cmd_response)
        sm.save(session)
        yield history, session_state, "Command executed"
        return

    # ── Normal chat flow ──────────────────────────────────────────────────────
    settings.ollama_model    = model_name
    settings.llm_temperature = temperature

    sm  = session_manager
    sid = session_state.get("id")
    if sid:
        session = sm.load(sid) or Session(session_id=sid, system_prompt=system_prompt)
    else:
        session = Session(system_prompt=system_prompt)
        session_state = {"id": session.id}
        sid           = session.id

    if not session.messages and history:
        for h in history:
            session.messages.append(Message(role=h["role"], content=h["content"]))

    session.add("user", user_message)

    # ── Build context ─────────────────────────────────────────────────────────
    # session.get_context() returns [system_prompt_msg, ...history..., last_user_msg]
    base_context = session.get_context()
    system_msg   = base_context[0]        # Message.system(system_prompt)
    history_msgs = base_context[1:-1]     # prior conversation
    last_user    = base_context[-1]       # current user message

    injected: list[Message] = [system_msg]

    # 1. Memory block
    mem_block = ""
    if use_memory:
        mem_block = memory_store.build_context_block(user_message)
        if mem_block:
            injected.append(Message.system(mem_block))

    # 2. RAG block
    rag_block, chunks_used = "", 0
    if use_docs:
        rag_block, chunks_used = build_rag_context(user_message, sid)
        if rag_block:
            injected.append(Message.system(rag_block))

    # 3. Conversation history + current message
    injected.extend(history_msgs)
    injected.append(last_user)

    # ── Stream ────────────────────────────────────────────────────────────────
    client     = get_client()
    full_reply = []
    start      = time.time()

    history = history + [
        {"role": "user",      "content": user_message},
        {"role": "assistant", "content": ""},
    ]

    try:
        for chunk in client.chat(injected, stream=True, temperature=temperature):
            full_reply.append(chunk)
            history[-1]["content"] = "".join(full_reply)
            yield history, session_state, ""
    except Exception as e:
        history[-1]["content"] = f"*Error: {e}*"
        yield history, session_state, f"Error: {e}"
        return

    # ── Persist & status ──────────────────────────────────────────────────────
    reply_text = "".join(full_reply)
    session.add("assistant", reply_text)
    sm.save(session)

    elapsed       = time.time() - start
    tokens_approx = len(reply_text) // 4
    notes         = []
    if mem_block:
        notes.append(f"🧠 memory")
    if chunks_used:
        notes.append(f"📄 {chunks_used} chunks")
    note_str = "  |  " + "  ".join(notes) if notes else ""
    status = f"~{tokens_approx} tokens  |  {elapsed:.1f}s  |  {model_name}{note_str}"
    yield history, session_state, status


# ── Session actions ───────────────────────────────────────────────────────────

def new_chat(system_prompt: str, model_name: str):
    session      = session_manager.create(system_prompt=system_prompt)
    session_state = {"id": session.id}
    return [], session_state, _format_sessions(session_manager), "", _doc_list_text(session.id)


def load_session(label: str, session_state: dict):
    if not label or label.startswith("(no"):
        return [], session_state, _doc_list_text(session_state.get("id"))
    sid = _parse_id(label)
    if not sid:
        return [], session_state, _doc_list_text(None)
    session = session_manager.load(sid)
    if not session:
        return [], session_state, _doc_list_text(None)
    history = [{"role": m["role"], "content": m["content"]} for m in session.messages]
    return history, {"id": sid}, _doc_list_text(sid)


def delete_session(label: str, session_state: dict):
    if not label or label.startswith("(no"):
        return session_state, _format_sessions(session_manager)
    sid = _parse_id(label)
    if sid:
        session_manager.delete(sid)
        if session_state.get("id") == sid:
            session_state = {}
    return session_state, _format_sessions(session_manager)


def export_session(session_state: dict) -> tuple[str, object]:
    sid = session_state.get("id")
    if not sid:
        return "No active session to export.", gr.Textbox(visible=True)
    md = session_manager.export_markdown(sid)
    return md or "Session not found.", gr.Textbox(visible=True)


def refresh_sessions():
    return _format_sessions(session_manager)


# ── Document actions ──────────────────────────────────────────────────────────

def process_files(files, session_state: dict):
    if not files:
        sid = session_state.get("id")
        return session_state, "No files selected.", _doc_list_text(sid)
    sid = session_state.get("id")
    if not sid:
        session      = session_manager.create()
        session_state = {"id": session.id}
        sid           = session.id
    store, results, errors = get_store(sid), [], []
    for f in (files if isinstance(files, list) else [files]):
        path = Path(f) if isinstance(f, str) else Path(f.name)
        try:
            info = store.add_file(path)
            if info["skipped"]:
                results.append(f"⟳  {info['file']} (already indexed)")
            else:
                results.append(f"✓  {info['file']}  ({info['pages']} pages, {info['chunks']} chunks)")
        except Exception as e:
            errors.append(f"✗  {path.name}: {e}")
    status = "\n".join(results + errors) or "Done."
    return session_state, status, _doc_list_text(sid)


def remove_document(doc_name: str, session_state: dict):
    sid = session_state.get("id")
    if not sid or not doc_name.strip():
        return _doc_list_text(sid), "Enter a filename to remove."
    clean = doc_name.strip().lstrip("•").split("(")[0].strip()
    get_store(sid).remove_file(clean)
    return _doc_list_text(sid), f"Removed '{clean}'"


def clear_documents(session_state: dict):
    sid = session_state.get("id")
    if sid:
        get_store(sid).clear()
    return _doc_list_text(sid), "All documents cleared."


# ── Deal analysis ─────────────────────────────────────────────────────────────

def analyze_company_fn(
    history:       list[dict],
    session_state: dict,
    model_name:    str,
    temperature:   float,
):
    """
    Streaming generator for the 'Analyze Company' button.

    Bypasses the normal chat pipeline — builds its own prompt from indexed
    documents and streams a structured deal memo into the chatbot.
    """
    sm  = session_manager
    sid = session_state.get("id")

    # ── Guard: no session yet → create one ───────────────────────────────────
    if not sid:
        session       = sm.create()
        session_state = {"id": session.id}
        sid           = session.id

    store = get_store(sid)

    # ── Guard: no documents indexed ───────────────────────────────────────────
    if store.chunk_count == 0:
        msg = (
            "⚠️ **No documents indexed.**\n\n"
            "Upload a PDF, TXT, or CSV in the **Documents (RAG)** panel "
            "and click **Index Files** before running a deal analysis."
        )
        history = history + [
            {"role": "user",      "content": "📊 *Analyze Company*"},
            {"role": "assistant", "content": msg},
        ]
        yield history, session_state, "No documents loaded"
        return

    # ── Build trigger message shown in chat ───────────────────────────────────
    file_list  = "  ·  ".join(store.list_files())
    trigger    = (
        f"📊 **Deal Analysis**\n"
        f"*Documents: {file_list}  ({store.chunk_count} indexed chunks)*"
    )
    full_reply = []
    history    = history + [
        {"role": "user",      "content": trigger},
        {"role": "assistant", "content": ""},
    ]

    start = time.time()
    try:
        for chunk in run_deal_analysis(sid, model_name, temperature=0.25):
            full_reply.append(chunk)
            history[-1]["content"] = "".join(full_reply)
            yield history, session_state, ""
    except Exception as e:
        history[-1]["content"] = f"*Analysis error: {e}*"
        yield history, session_state, f"Error: {e}"
        return

    # ── Persist to session ────────────────────────────────────────────────────
    reply_text = "".join(full_reply)
    session    = sm.load(sid) or sm.create()
    session.add("user",      trigger)
    session.add("assistant", reply_text)
    sm.save(session)

    elapsed = time.time() - start
    status  = (
        f"Analysis complete  |  {elapsed:.1f}s  |  {model_name}  |  "
        f"📄 {store.chunk_count} chunks  ·  {len(store.list_files())} file(s)"
    )
    yield history, session_state, status


# ── Memory actions ────────────────────────────────────────────────────────────

def _mem_display() -> str:
    return memory_store.format_for_display()


def _mem_choices() -> list[str]:
    choices = memory_store.format_choices()
    return choices if choices else ["(no memories)"]


def add_memory(category: str, content: str):
    if not content.strip():
        return _mem_display(), _mem_choices(), "Content cannot be empty."
    mid = memory_store.add(content.strip(), category=category, source="ui")
    return _mem_display(), _mem_choices(), f"✓ Saved to {category} (id {mid})"


def load_memory_for_edit(choice: str) -> tuple[str, str, str]:
    """When user selects a memory in the edit dropdown, populate the edit fields."""
    if not choice or choice.startswith("(no"):
        return "", "fact", ""
    import re
    m = re.match(r"\[(\d+)\]", choice)
    if not m:
        return "", "fact", ""
    mem = memory_store.get(int(m.group(1)))
    if not mem:
        return "", "fact", ""
    return str(mem["id"]), mem["category"], mem["content"]


def update_memory(mem_id_str: str, category: str, content: str):
    if not mem_id_str.strip().isdigit():
        return _mem_display(), _mem_choices(), "Select a memory to edit first."
    ok = memory_store.update(int(mem_id_str), content=content, category=category)
    if ok:
        return _mem_display(), _mem_choices(), f"✓ Updated memory {mem_id_str}"
    return _mem_display(), _mem_choices(), f"Memory {mem_id_str} not found."


def delete_memory(choice: str):
    if not choice or choice.startswith("(no"):
        return _mem_display(), _mem_choices(), "Nothing selected."
    import re
    m = re.match(r"\[(\d+)\]", choice)
    if not m:
        return _mem_display(), _mem_choices(), "Could not parse id."
    mid = int(m.group(1))
    if memory_store.delete(mid):
        return _mem_display(), _mem_choices(), f"✓ Deleted memory {mid}"
    return _mem_display(), _mem_choices(), f"Memory {mid} not found."


def clear_all_memories():
    n = memory_store.clear_all()
    return _mem_display(), _mem_choices(), f"✓ Cleared {n} memories"


# ── Build UI ──────────────────────────────────────────────────────────────────

def build_ui() -> gr.Blocks:
    models        = _list_ollama_models() or [settings.ollama_model]
    default_model = settings.ollama_model if settings.ollama_model in models else models[0]

    with gr.Blocks(
        css=CSS,
        title=f"{settings.assistant_name} — AI Assistant",
        theme=gr.themes.Soft(
            primary_hue="blue",
            neutral_hue="slate",
            font=gr.themes.GoogleFont("Inter"),
        ),
    ) as demo:

        session_state = gr.State({})

        with gr.Tabs():

            # ════════════════════════════════════════════════════════════════
            with gr.Tab("💬 Chat"):
            # ════════════════════════════════════════════════════════════════

                # ── Header ────────────────────────────────────────────────────────
                with gr.Row():
                    gr.Markdown(
                        f"## {settings.assistant_name}\n"
                        "<span style='font-size:11px;background:#eef1f7;"
                        "border-radius:8px;padding:2px 10px;color:#1F3864;"
                        "font-weight:600;'>Local LLM · Document RAG · "
                        "Persistent Memory · Deal Analyzer · Market Feed</span>"
                    )

                # ── Main 3-column layout ──────────────────────────────────────────
                with gr.Row(equal_height=True):

                    # ── LEFT: session history ──────────────────────────────────
                    with gr.Column(scale=1, min_width=220, elem_id="sidebar"):
                        gr.Markdown("### Chats")
                        new_btn = gr.Button("+ New Chat", elem_id="new-btn", size="sm")
                        session_list = gr.Radio(
                            label="History",
                            choices=_format_sessions(session_manager),
                            value=None,
                            interactive=True,
                        )
                        with gr.Row():
                            refresh_btn = gr.Button("Refresh", size="sm", variant="secondary")
                            delete_btn  = gr.Button("Delete",  size="sm", variant="stop")
                        gr.Markdown("---")
                        gr.Markdown("### Export")
                        export_btn = gr.Button("Export as Markdown", size="sm")
                        export_box = gr.Textbox(label="Markdown Export", lines=6,
                                                interactive=False, visible=False)

                    # ── CENTER: chat ──────────────────────────────────────────
                    with gr.Column(scale=4):
                        chatbot = gr.Chatbot(
                            label="", elem_id="chatbox", height=520, type="messages",
                            show_copy_button=True, render_markdown=True,
                            bubble_full_width=False,
                        )
                        status_bar = gr.Markdown("", elem_id="status")
                        with gr.Row():
                            msg_box = gr.Textbox(
                                placeholder=(
                                    "Message Argus AI…   "
                                    "/remember <fact>  ·  /forget <id>  ·  /memory"
                                ),
                                show_label=False, lines=2, scale=5, autofocus=True,
                            )
                            with gr.Column(scale=1, min_width=140):
                                send_btn    = gr.Button("Send", elem_id="send-btn",
                                                        variant="primary")
                                analyze_btn = gr.Button("📊 Analyze Company",
                                                        elem_id="analyze-btn",
                                                        variant="secondary", size="sm")

                    # ── RIGHT: settings panel ─────────────────────────────────
                    with gr.Column(scale=1, min_width=250):

                        # ── Model & Settings ──────────────────────────────────
                        with gr.Accordion("Model & Settings", open=True):
                            model_dd = gr.Dropdown(
                                label="Model", choices=models, value=default_model,
                                interactive=True, allow_custom_value=True,
                            )
                            refresh_models_btn = gr.Button("Refresh Models", size="sm")
                            temp_slider = gr.Slider(
                                label="Temperature", minimum=0.0, maximum=2.0,
                                step=0.05, value=settings.llm_temperature,
                            )

                        # ── System Prompt ─────────────────────────────────────
                        with gr.Accordion("System Prompt", open=False):
                            system_box = gr.Textbox(
                                value=settings.system_prompt, lines=5, label="",
                                placeholder="You are a helpful assistant…",
                            )
                            apply_system_btn = gr.Button("Apply (starts new chat)", size="sm")

                        # ── Memory ────────────────────────────────────────────
                        with gr.Accordion("Memory", open=True):
                            use_memory_toggle = gr.Checkbox(
                                label="Use memory in responses",
                                value=True,
                                info="Injects relevant saved facts into every prompt.",
                            )

                            with gr.Tabs():
                                with gr.Tab("View"):
                                    mem_display = gr.Textbox(
                                        label="Stored memories",
                                        value=_mem_display(),
                                        lines=8, interactive=False,
                                        elem_classes=["mem-list"],
                                    )
                                    refresh_mem_btn = gr.Button("Refresh", size="sm")

                                with gr.Tab("Add"):
                                    mem_cat_dd = gr.Dropdown(
                                        label="Category",
                                        choices=list(CATEGORIES),
                                        value="fact",
                                    )
                                    mem_content_box = gr.Textbox(
                                        label="Content",
                                        lines=3,
                                        placeholder="What should Argus remember?",
                                    )
                                    add_mem_btn    = gr.Button("Save Memory",
                                                               variant="primary", size="sm")
                                    add_mem_status = gr.Textbox(label="", lines=1,
                                                                interactive=False)

                                with gr.Tab("Edit / Delete"):
                                    mem_select_dd = gr.Dropdown(
                                        label="Select memory",
                                        choices=_mem_choices(),
                                        interactive=True,
                                    )
                                    mem_edit_id  = gr.Textbox(visible=False)
                                    mem_edit_cat = gr.Dropdown(
                                        label="Category",
                                        choices=list(CATEGORIES), value="fact",
                                    )
                                    mem_edit_box = gr.Textbox(label="Content", lines=3)
                                    with gr.Row():
                                        update_mem_btn = gr.Button("Update",
                                                                    variant="primary", size="sm")
                                        delete_mem_btn = gr.Button("Delete",
                                                                    variant="stop",    size="sm")
                                    edit_status = gr.Textbox(label="", lines=1,
                                                             interactive=False)

                                with gr.Tab("Clear All"):
                                    gr.Markdown(
                                        "⚠️ This permanently deletes **all** saved memories."
                                    )
                                    clear_mem_btn    = gr.Button("Delete All Memories",
                                                                  variant="stop")
                                    clear_mem_status = gr.Textbox(label="", lines=1,
                                                                   interactive=False)

                        # ── Documents (RAG) ───────────────────────────────────
                        with gr.Accordion("Documents (RAG)", open=False):
                            use_docs_toggle = gr.Checkbox(
                                label="Use uploaded documents in responses",
                                value=False,
                            )
                            file_upload = gr.File(
                                label="Upload files", file_count="multiple",
                                file_types=[".pdf", ".txt", ".csv", ".md"],
                                type="filepath",
                            )
                            index_btn   = gr.Button("Index Files", size="sm",
                                                    variant="primary")
                            proc_status = gr.Textbox(
                                label="Processing log", lines=3, interactive=False,
                                placeholder="Upload files then click Index…",
                                elem_classes=["doc-list"],
                            )
                            gr.Markdown("**Loaded documents:**")
                            doc_list_box = gr.Textbox(
                                label="", value="No documents loaded.",
                                lines=4, interactive=False, elem_classes=["doc-list"],
                            )
                            with gr.Row():
                                remove_name_box = gr.Textbox(
                                    placeholder="Filename to remove",
                                    show_label=False, scale=3,
                                )
                                remove_btn = gr.Button("Remove", size="sm", scale=1)
                            clear_docs_btn = gr.Button("Clear All Documents",
                                                       size="sm", variant="stop")

                        gr.Markdown(
                            "<small>**Chat commands:**<br>"
                            "`/remember [cat:] text` · `/forget id` · `/memory`</small>"
                        )

            # ════════════════════════════════════════════════════════════════
            with gr.Tab("📰 Market Feed"):
            # ════════════════════════════════════════════════════════════════
                build_feed_tab(models, default_model)

        # ── Event wiring ──────────────────────────────────────────────────────

        send_inputs  = [msg_box, chatbot, session_state, model_dd,
                        temp_slider, system_box, use_docs_toggle, use_memory_toggle]
        send_outputs = [chatbot, session_state, status_bar]

        send_btn.click(fn=chat_fn, inputs=send_inputs, outputs=send_outputs
                       ).then(lambda: "", outputs=msg_box)
        msg_box.submit(fn=chat_fn, inputs=send_inputs, outputs=send_outputs
                       ).then(lambda: "", outputs=msg_box)

        # Sessions
        new_btn.click(fn=new_chat, inputs=[system_box, model_dd],
                      outputs=[chatbot, session_state, session_list, status_bar, doc_list_box])
        session_list.change(fn=load_session, inputs=[session_list, session_state],
                            outputs=[chatbot, session_state, doc_list_box])
        delete_btn.click(fn=delete_session, inputs=[session_list, session_state],
                         outputs=[session_state, session_list])
        refresh_btn.click(fn=refresh_sessions, outputs=session_list)
        export_btn.click(fn=export_session, inputs=session_state,
                         outputs=[export_box, export_box])
        apply_system_btn.click(fn=new_chat, inputs=[system_box, model_dd],
                               outputs=[chatbot, session_state, session_list, status_bar, doc_list_box])

        # Model refresh
        def _refresh_models():
            m = _list_ollama_models() or [settings.ollama_model]
            return gr.Dropdown(choices=m, value=m[0])
        refresh_models_btn.click(fn=_refresh_models, outputs=model_dd)

        # Memory — View
        refresh_mem_btn.click(fn=_mem_display, outputs=mem_display)

        # Memory — Add
        add_mem_btn.click(
            fn=add_memory,
            inputs=[mem_cat_dd, mem_content_box],
            outputs=[mem_display, mem_select_dd, add_mem_status],
        ).then(lambda: "", outputs=mem_content_box)

        # Memory — Edit/Delete: load on select
        mem_select_dd.change(
            fn=load_memory_for_edit,
            inputs=mem_select_dd,
            outputs=[mem_edit_id, mem_edit_cat, mem_edit_box],
        )

        # Memory — Update
        update_mem_btn.click(
            fn=update_memory,
            inputs=[mem_edit_id, mem_edit_cat, mem_edit_box],
            outputs=[mem_display, mem_select_dd, edit_status],
        )

        # Memory — Delete
        delete_mem_btn.click(
            fn=delete_memory,
            inputs=mem_select_dd,
            outputs=[mem_display, mem_select_dd, edit_status],
        )

        # Memory — Clear All
        clear_mem_btn.click(
            fn=clear_all_memories,
            outputs=[mem_display, mem_select_dd, clear_mem_status],
        )

        # Analyze Company
        analyze_btn.click(
            fn=analyze_company_fn,
            inputs=[chatbot, session_state, model_dd, temp_slider],
            outputs=[chatbot, session_state, status_bar],
        )

        # Documents
        index_btn.click(
            fn=process_files, inputs=[file_upload, session_state],
            outputs=[session_state, proc_status, doc_list_box],
        )
        remove_btn.click(
            fn=remove_document, inputs=[remove_name_box, session_state],
            outputs=[doc_list_box, proc_status],
        ).then(lambda: "", outputs=remove_name_box)
        clear_docs_btn.click(
            fn=clear_documents, inputs=session_state,
            outputs=[doc_list_box, proc_status],
        )

    return demo


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port",  type=int, default=7860)
    parser.add_argument("--host",  type=str, default="127.0.0.1")
    parser.add_argument("--share", action="store_true")
    args = parser.parse_args()

    demo = build_ui()
    print(f"\n  {settings.assistant_name} starting...")
    print(f"  Open: http://{args.host}:{args.port}\n")
    demo.launch(
        server_name=args.host,
        server_port=args.port,
        share=False,
        inbrowser=True,
    )
