# My NanoClaw reference

These notes explain this checkout so you can follow the code without an AI coding assistant. Open the files in a Markdown preview that supports Mermaid to see the diagrams. The fenced Mermaid source is also readable as text.

1. [System architecture](architecture.md): what runs where, what each component owns, and which files to read.
2. [End-to-end flow](end-to-end.md): trace a Discord message from arrival to reply, including gateway approvals and failure checkpoints.
3. [Start and stop instructions](boot.md): operate this Mac's installation.

These diagrams describe the local Discord + OneCLI + Codex setup inspected on 10 October 2026. Other channels and providers can be installed through skills. Configuration and code can change; the linked source files are the final reference.

Your Codex editor/chat subscription is separate from the NanoClaw host. NanoClaw runs through macOS launchd and OrbStack. Its agent still needs a working configured model provider and valid credentials in OneCLI. These notes let you inspect and operate the system independently; they do not provide model access after credentials or a subscription expire.
