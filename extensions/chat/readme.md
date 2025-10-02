# Kodik

**An AI-powered coding assistant for VS Code**

Kodik is a VS Code extension that brings advanced AI capabilities directly into your development environment. Built on proven agentic AI technology, Kodik helps you write, debug, and improve code through an intuitive chat interface.

## Features

### 🤖 Intelligent Code Assistant

Kodik understands your codebase and can help with complex software development tasks. It analyzes your project structure, reads relevant files, and provides contextual assistance that goes beyond simple code completion.

### How It Works

1. **Describe your task** - Tell Kodik what you want to accomplish, add images to convert mockups, or use screenshots to fix bugs
2. **Smart analysis** - Kodik analyzes your project structure, reads relevant files, and understands your codebase context
3. **Autonomous actions** - With your approval, Kodik can:
   - Create and edit files while monitoring for errors
   - Execute terminal commands and react to output
   - Launch browsers for testing web applications
   - Fix runtime errors and visual bugs automatically
4. **Review and approve** - You maintain control by reviewing and approving each action Kodik takes

> [!TIP]
> Use `CMD/CTRL + Shift + P` and type "Kodik: Open In New Tab" to open Kodik as a tab in your editor, allowing you to work side-by-side with your file explorer.

---

### 🔌 Flexible AI Model Support

Kodik works with multiple AI providers:

- **Cloud providers**: OpenRouter, Anthropic, OpenAI, Google Gemini, AWS Bedrock, Azure, GCP Vertex, Cerebras, Groq
- **Local models**: LM Studio, Ollama
- **Custom APIs**: Any OpenAI-compatible API

The extension tracks token usage and API costs in real-time, helping you monitor spending throughout your development session.

---

### 💻 Terminal Integration

Kodik can execute commands directly in your terminal and monitor output in real-time. This enables:

- Package installation and dependency management
- Running build scripts and tests
- Deploying applications
- Database management
- Dev server monitoring

For long-running processes, use "Proceed While Running" to let Kodik continue working while commands execute in the background.

---

### ✏️ File Management

Kodik creates and edits files with intelligent diff previews:

- Review all changes before accepting
- Edit or revert changes directly in the diff view
- Automatic detection and fixing of linter/compiler errors
- All modifications tracked in VS Code's Timeline for easy rollback

---

### 🌐 Browser Automation

Kodik can interact with web browsers for testing and debugging:

- Launch and control browsers
- Click, type, and navigate web pages
- Capture screenshots and console logs
- Test locally running applications
- Fix visual bugs and runtime issues automatically

Perfect for end-to-end testing and interactive debugging without manual intervention.

---

### 🔧 Extensible via MCP

Kodik supports the [Model Context Protocol](https://github.com/modelcontextprotocol) for unlimited extensibility:

- Use community-made MCP servers
- Create custom tools for your workflow
- Integrate with external services (Jira, AWS, PagerDuty, etc.)
- Tools become part of Kodik's permanent capabilities

Just ask Kodik to "add a tool" and it will create and install custom MCP servers automatically.

---

### 📎 Context Management

Enhance Kodik's understanding with context mentions:

- **`@url`** - Fetch and include content from URLs (documentation, articles, etc.)
- **`@problems`** - Include workspace errors and warnings for fixing
- **`@file`** - Add specific file contents to the conversation
- **`@folder`** - Include entire folder contents at once

---

### 🔄 Checkpoints

Kodik automatically saves workspace snapshots as it works:

- **Compare** - View diffs between checkpoints and current state
- **Restore** - Roll back to any previous checkpoint
- **Test versions** - Safely experiment with different approaches
- **No lost work** - Always recover from any point in your task

Perfect for exploring different solutions without fear of breaking your code.

---

## Getting Started

1. Install the Kodik extension from the VS Code Marketplace
2. Configure your preferred AI provider and API key in settings
3. Open Kodik from the sidebar or use `CMD/CTRL + Shift + P` → "Kodik: Open In New Tab"
4. Start coding with AI assistance!

## Contributing

Contributions are welcome! Please see our [Contributing Guide](https://github.com/mike2505/KodikAI/blob/main/CONTRIBUTING.md) for details on how to get started.

## License

[Apache 2.0 © 2025 Kodik](https://github.com/mike2505/KodikAI/blob/main/LICENSE)
