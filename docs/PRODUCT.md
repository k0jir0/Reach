# Product Hypothesis

Reach turns long-context models into a practical product for software teams:

1. Snapshot a repository without blindly stuffing generated files, dependencies, secrets, or binaries into context.
2. Build an auditable prompt pack with a repo map, file inventory, source excerpts, token estimates, and a user question.
3. Send that prompt pack to a long-context backend such as `agy`, Gemini, or a hosted Llama endpoint.
4. Save every prompt, answer, source snapshot, and budget decision as evidence.

## Initial Users

- Solo developers asking "what is this repo and what should I fix first?"
- Course/lab projects where students need guided code review across many files.
- Small teams needing fast onboarding, migration plans, and security scans without setting up full enterprise search.

## MVP Features

- Local scanner with denylisted folders and binary detection.
- Token budget controls for 128K, 1M, and 10M context targets.
- Prompt-pack generation for whole-repo questions.
- Persisted run history with JSON and Markdown artifacts.
- Deterministic local analyst for offline end-to-end validation.
- `agy --print` adapter.
- OpenAI-compatible chat adapter for hosted Llama endpoints.
- Static dashboard for browsing snapshots and runs.

## MVP Completion Criteria

Reach v0.1 is complete when it can:

1. Snapshot a repository.
2. Build a prompt pack from that snapshot.
3. Produce at least one answer artifact through a provider.
4. Save the run as auditable JSON and Markdown.
5. Show snapshots and runs in the dashboard.
6. Pass the local test suite.

## Why Long Context Helps

Traditional RAG is excellent for targeted lookup, but whole-repo tasks often require global shape: entry points, conventions, dependency drift, historical artifacts, and repeated patterns. Long context makes it feasible to ask broad planning questions in one pass. Reach adds the missing discipline: what went into the context, what was excluded, and why.

## Risks

- Context windows are advertised differently by model, provider, tier, and interface.
- Large context does not guarantee correct reasoning; evidence and verification still matter.
- Sending private repositories to hosted models may violate confidentiality policies.
- Enterprise deployments need redaction, access control, audit logs, and model routing policies.
