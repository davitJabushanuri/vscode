# AI Chat Integration with VS Code

This document explains how to integrate AI chat functionality with VS Code, clarifies the relationship between GitHub Copilot and VS Code, and provides examples for connecting external AI services.

## GitHub Copilot vs VS Code - What's Actually Bundled?

### What VS Code includes:
- **GitHub extension**: Basic GitHub authentication and repository features (bundled in `extensions/github/`)
- **Chat infrastructure**: Complete chat participant API and UI framework (`src/vs/workbench/contrib/chat/`)
- **Language Model APIs**: APIs for registering and consuming language models (`src/vscode-dts/vscode.proposed.chatProvider.d.ts`)
- **Chat Participant APIs**: APIs for creating custom chat participants (`src/vscode-dts/vscode.d.ts`)

### What VS Code does NOT include:
- **GitHub Copilot extension**: This is a separate, paid extension that must be installed separately
- **AI models**: No built-in AI language models or inference capabilities
- **Continue extension**: This is a third-party extension, not bundled with VS Code

## VS Code Chat Architecture

VS Code provides a comprehensive chat infrastructure that allows extensions to:

1. **Register Chat Participants**: Custom AI assistants that respond to `@participant` mentions
2. **Integrate Language Models**: Connect to external AI services via the Language Model API
3. **Stream Responses**: Real-time streaming of AI responses with rich formatting
4. **Handle Tools**: Support for function calling and tool integration

## Creating a Custom AI Chat Participant

Here's how to create a chat participant that connects to your AI server:

### 1. Basic Chat Participant

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // Create a chat participant
    const participant = vscode.chat.createChatParticipant('myai', async (request, context, stream, token) => {
        // Send request to your AI server
        const response = await callMyAIServer(request.prompt);
        
        // Stream the response back
        stream.markdown(response);
        
        return { metadata: { command: request.command } };
    });

    // Configure the participant
    participant.iconPath = new vscode.ThemeIcon('robot');
    
    context.subscriptions.push(participant);
}

async function callMyAIServer(prompt: string): Promise<string> {
    // Replace with your actual AI server endpoint
    const response = await fetch('https://your-ai-server.com/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt })
    });
    
    const data = await response.json();
    return data.response;
}
```

### 2. Advanced Chat Participant with Streaming

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const participant = vscode.chat.createChatParticipant('streamingai', async (request, context, stream, token) => {
        try {
            // Show progress indicator
            stream.progress('Thinking...');
            
            // Connect to your streaming AI endpoint
            await streamFromAIServer(request.prompt, stream, token);
            
        } catch (error) {
            stream.markdown(`Sorry, I encountered an error: ${error.message}`);
        }
        
        return { metadata: { command: request.command } };
    });

    participant.iconPath = vscode.Uri.file(path.join(context.extensionPath, 'icon.png'));
    
    context.subscriptions.push(participant);
}

async function streamFromAIServer(prompt: string, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) {
    const response = await fetch('https://your-ai-server.com/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt })
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response stream');

    try {
        while (!token.isCancellationRequested) {
            const { done, value } = await reader.read();
            if (done) break;
            
            // Parse your server's streaming format
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = JSON.parse(line.slice(6));
                    if (data.content) {
                        stream.markdown(data.content);
                    }
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}
```

### 3. Chat Participant with Tool Support

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const participant = vscode.chat.createChatParticipant('toolai', async (request, context, stream, token) => {
        // Check if this is a tool result
        if (request.toolInvocationToken) {
            return handleToolResult(request, stream);
        }
        
        // Regular chat request
        const response = await callAIWithTools(request.prompt, stream);
        return response;
    });

    participant.iconPath = new vscode.ThemeIcon('tools');
    
    context.subscriptions.push(participant);
}

async function callAIWithTools(prompt: string, stream: vscode.ChatResponseStream) {
    // Send prompt to AI that supports function calling
    const response = await fetch('https://your-ai-server.com/chat-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: prompt,
            tools: [
                {
                    name: 'get_file_content',
                    description: 'Read the content of a file',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string', description: 'File path to read' }
                        }
                    }
                }
            ]
        })
    });

    const data = await response.json();
    
    if (data.tool_calls) {
        // Handle tool calls
        for (const tool_call of data.tool_calls) {
            if (tool_call.function.name === 'get_file_content') {
                const args = JSON.parse(tool_call.function.arguments);
                try {
                    const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(args.path));
                    stream.markdown(`File content:\n\`\`\`\n${fileContent.toString()}\n\`\`\``);
                } catch (error) {
                    stream.markdown(`Error reading file: ${error.message}`);
                }
            }
        }
    } else {
        stream.markdown(data.response);
    }
    
    return { metadata: { command: undefined } };
}

async function handleToolResult(request: vscode.ChatRequest, stream: vscode.ChatResponseStream) {
    // Handle tool execution results
    stream.markdown('Tool execution completed');
    return { metadata: { command: request.command } };
}
```

## Extension Manifest Configuration

Your `package.json` should include the chat participant contribution:

```json
{
    "name": "your-ai-extension",
    "displayName": "Your AI Assistant",
    "version": "1.0.0",
    "engines": {
        "vscode": "^1.90.0"
    },
    "categories": ["AI", "Chat"],
    "activationEvents": ["onLanguage:*"],
    "main": "./out/extension.js",
    "contributes": {
        "chatParticipants": [
            {
                "id": "myai",
                "name": "MyAI",
                "description": "AI assistant powered by your custom server",
                "isSticky": true
            }
        ]
    }
}
```

## Integrating with Continue Extension

If you want to specifically integrate with the Continue extension (which is not bundled with VS Code), you would:

1. **Install Continue extension** from the marketplace
2. **Use Continue's APIs** if they provide extension APIs
3. **Register as a Continue provider** if they support external providers

However, since Continue is not part of VS Code core, you're better off using the native VS Code chat participant APIs shown above.

## Language Model Provider Integration

For more advanced scenarios, you can also register a language model provider:

```typescript
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // Register a language model provider
    const provider: vscode.LanguageModelChatProvider = {
        async prepareLanguageModelChatInformation(options, token) {
            return [{
                id: 'my-ai-model',
                name: 'My AI Model',
                family: 'custom',
                version: '1.0',
                maxInputTokens: 4096,
                maxOutputTokens: 1024
            }];
        },
        
        async provideLanguageModelChatResponse(model, messages, options, progress, token) {
            // Stream response from your AI server
            for await (const chunk of streamFromServer(messages)) {
                progress.report(new vscode.LanguageModelTextPart(chunk));
            }
        },
        
        async provideTokenCount(model, text, token) {
            // Return token count for the given text
            return Math.ceil(text.length / 4); // Rough estimate
        }
    };
    
    const registration = vscode.lm.registerLanguageModelChatProvider('your-vendor', provider);
    context.subscriptions.push(registration);
}
```

## Summary

1. **GitHub Copilot is NOT bundled** with VS Code - it's a separate paid extension
2. **VS Code provides comprehensive chat APIs** that you can use to build your own AI integrations
3. **Use `vscode.chat.createChatParticipant()`** to create custom AI assistants
4. **Connect to your AI server** using standard HTTP requests or WebSocket streams
5. **Support rich interactions** with tools, file access, and real-time streaming

This approach gives you full control over your AI integration while leveraging VS Code's powerful chat infrastructure.