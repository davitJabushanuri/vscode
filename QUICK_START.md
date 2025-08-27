# Quick Start: Integrating AI Chat with VS Code

This is a quick reference for developers who want to integrate AI chat functionality with VS Code.

## TL;DR - What You Need to Know

### ❌ GitHub Copilot is NOT bundled with VS Code
- Copilot is a separate, paid extension that must be installed separately
- VS Code only includes the GitHub extension for basic Git/GitHub features

### ✅ VS Code HAS comprehensive chat infrastructure
- Complete chat participant API
- Language model provider APIs
- Rich streaming response support
- File integration capabilities

## 5-Minute Setup

### 1. Create a Chat Participant
```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const participant = vscode.chat.createChatParticipant('myai', async (request, context, stream, token) => {
        // Call your AI server
        const response = await fetch('https://your-ai-server.com/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: request.prompt })
        });
        
        const data = await response.json();
        stream.markdown(data.response);
        
        return { metadata: { command: request.command } };
    });

    participant.iconPath = new vscode.ThemeIcon('robot');
    context.subscriptions.push(participant);
}
```

### 2. Configure package.json
```json
{
    "contributes": {
        "chatParticipants": [
            {
                "id": "myai",
                "name": "MyAI",
                "description": "My custom AI assistant"
            }
        ]
    }
}
```

### 3. Use in Chat
- Open VS Code chat panel
- Type `@myai Hello, how can you help me?`
- Your AI responds through your server

## Continue Extension Integration

The Continue extension is NOT part of VS Code core. To work with Continue:

1. **Install Continue** from the marketplace
2. **Use VS Code's native chat APIs** (recommended) - they're more powerful
3. **Check Continue's docs** for their specific integration APIs if needed

## Examples Available

- [`examples/ai-chat-sample/`](examples/ai-chat-sample/) - Basic examples
- [`examples/external-ai-chat/`](examples/external-ai-chat/) - Production-ready external AI integration
- [`AI_CHAT_INTEGRATION.md`](AI_CHAT_INTEGRATION.md) - Full documentation

## Common AI Service Endpoints

- **OpenAI**: `https://api.openai.com/v1/chat/completions`
- **Local Ollama**: `http://localhost:11434/v1/chat/completions`
- **Azure OpenAI**: `https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions`

## Next Steps

1. Clone this repository
2. Check out the examples in [`examples/`](examples/)
3. Modify the external AI example to connect to your server
4. Build and test your extension
5. Publish to the marketplace

That's it! You now have AI chat integrated with VS Code using your own server.