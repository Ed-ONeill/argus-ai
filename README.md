# Atlas — Personal LLM Assistant

A fully local, customizable AI assistant built in Python.
Supports Ollama (default), OpenAI, and any OpenAI-compatible local server.

---

## Project Structure

```
LLM_Assistant/
├── app/
│   ├── config.py        # Pydantic settings (reads .env)
│   ├── model.py         # Unified LLM client (Ollama / OpenAI)
│   └── inference.py     # CLI chat interface
├── retrieval/           # RAG pipeline (Phase 5)
├── tools/               # Function/tool calling (Phase 6)
├── evaluation/          # Benchmarking (Phase 9)
├── finetuning/          # Fine-tuning scripts (Phase 10)
├── ui/                  # Gradio web interface (Phase 8)
├── data/conversations/  # Saved chat histories
├── documents/           # Drop PDFs/docs here for RAG
├── embeddings/          # ChromaDB vector store
├── models/              # Local model files
├── scripts/             # Utility scripts
├── .env                 # Your credentials (gitignored)
├── .env.example         # Template
├── requirements.txt
└── requirements-gpu.txt
```

---

## Quick Start

### 1. Install Python dependencies

```powershell
cd C:\Users\Edward\Documents\LLM_Assistant
python -m pip install -r requirements.txt
```

### 2. Install Ollama

Download from: https://ollama.com/download/windows

After installing, pull a model:
```
ollama pull llama3.2
```

### 3. Configure

```powershell
copy .env.example .env
```

Edit `.env` — defaults work out of the box with Ollama.

### 4. Start chatting

```powershell
python -m app.inference
```

**Single-shot mode:**
```powershell
python -m app.inference --once "What is the capital of France?"
```

**Switch model on the fly:**
```powershell
python -m app.inference --model mistral
python -m app.inference --model llama3.1:70b
```

---

## CLI Commands (inside chat)

| Command      | Action                          |
|--------------|---------------------------------|
| `exit` / `q` | Save conversation and quit      |
| `/clear`     | Reset conversation history      |
| `/history`   | Show recent messages            |
| `/models`    | List available models           |

---

## Using OpenAI Instead of Ollama

Edit `.env`:
```
LLM_BACKEND=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

---

## Roadmap

| Phase | Description                        | Status    |
|-------|------------------------------------|-----------|
| 1     | Project architecture + config      | ✓ Done    |
| 2     | Base model + CLI inference         | ✓ Done    |
| 3     | Conversation memory + persistence  | Planned   |
| 4     | Document ingestion pipeline        | Planned   |
| 5     | RAG (retrieval-augmented gen)      | Planned   |
| 6     | Tool/function calling              | Planned   |
| 7     | FastAPI REST server                | Planned   |
| 8     | Gradio web UI                      | Planned   |
| 9     | Evaluation framework               | Planned   |
| 10    | Fine-tuning support                | Planned   |
| 11    | Multi-agent orchestration          | Planned   |
| 12    | Packaging + deployment             | Planned   |
