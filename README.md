# Reach

Reach is a long-context repository intelligence prototype. It turns a software project into a structured snapshot, builds a model-ready prompt pack, and can hand that pack to either:

- `agy --print` for Antigravity CLI sessions.
- An OpenAI-compatible network endpoint for hosted Llama, NIM, vLLM, Ollama-compatible gateways, or other long-context model servers.

The useful product shape is not "dump everything into a huge window every time." It is context budgeting: preserve the repo map, dependency signals, entry points, and high-value files first, then fill the remaining budget with source.

## Relationship To Apollo

Reach is the first runnable implementation of the Apollo Context Management thesis in `McGillSoftware\ApolloContextManagement`.

Apollo is the research, strategy, and architecture layer for enterprise context management. Reach is the product wedge that applies those ideas to software repositories. Keep them separate while Reach is still moving quickly; merge Reach under Apollo later only if Apollo becomes a monorepo with multiple apps and shared packages.

## Quick Start

```powershell
cd C:\Users\ryanv\Desktop\MCGILL\McGillSoftware\Reach
node .\src\cli.mjs scan --repo ..\Class1\mobile\expo\profile-card-app --out .reach\profile-card.snapshot.json --budget 1000000
node .\src\cli.mjs prompt --snapshot .reach\profile-card.snapshot.json --question "What should we improve next?" --out .reach\profile-card.prompt.md
node .\src\cli.mjs ask-local --snapshot .reach\profile-card.snapshot.json --question "What should we improve next?"
node .\src\cli.mjs serve
```

Then open `http://localhost:7331`.

## MVP Flow

Reach now supports the full local MVP loop:

```text
scan repository -> build snapshot -> build prompt pack -> ask provider -> save run -> inspect dashboard
```

Runs are saved as JSON and Markdown under `.reach\runs`. The `local` provider is deterministic and does not pretend to be a frontier model; it exists so the product can be tested end-to-end before `agy` or a hosted Llama endpoint is available.

```powershell
npm run smoke
npm test
```

## Optional: Ask Antigravity CLI

`agy` is installed on this machine, and Reach can call its non-interactive mode:

```powershell
node .\src\cli.mjs ask-agy --snapshot .reach\profile-card.snapshot.json --question "Review this app and suggest a product roadmap."
```

This requires Antigravity auth, network access, and permission for `agy` to write its own config/log files.

## Optional: Ask A Network Llama Endpoint

Reach expects an OpenAI-compatible chat completions endpoint:

```powershell
$env:REACH_LLM_BASE_URL="https://your-provider.example/v1"
$env:REACH_LLM_API_KEY="..."
$env:REACH_LLM_MODEL="llama-4-scout"
node .\src\cli.mjs ask-llama --snapshot .reach\profile-card.snapshot.json --question "Find the top architectural risks."
```

For truly large contexts, use a provider/server that advertises the required context length. Local laptop inference is not realistic for the largest Llama 4 variants; a networked service is the practical path.

## Model Notes

- Google Antigravity docs describe `agy` as the terminal-first CLI and document `--print` for non-interactive runs.
- Google Antigravity lists Gemini 3.5 Flash among available reasoning models, and its blog says Gemini 3.5 Flash is the default Gemini Flash model in Antigravity.
- Meta says Llama 4 Scout has a 10M context window. NVIDIA describes Llama 4 Maverick as accepting 1M context length, while Scout has 10M.

So the correction is: 10M is the Scout story; Maverick is still large-context, but do not assume Maverick is the 10M option unless your provider explicitly says so.
