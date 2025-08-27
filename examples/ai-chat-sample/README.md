# AI Chat Sample Extension

This sample extension demonstrates how to create AI chat participants in VS Code that can connect to external AI servers.

## Features

This extension includes three sample chat participants:

1. **SimpleAI** (`@simple-ai`) - A basic AI assistant that responds to simple queries
2. **StreamingAI** (`@streaming-ai`) - Demonstrates real-time streaming responses
3. **FileAI** (`@file-ai`) - Shows how to analyze files referenced in chat

## Usage

1. Install the extension
2. Open the VS Code chat panel
3. Use any of the participants:
   - `@simple-ai Hello` - Basic conversation
   - `@streaming-ai Tell me about TypeScript` - Streaming response
   - `@file-ai #path/to/file.ts` - File analysis

## Building from Source

```bash
npm install
npm run compile
```

## Key Features Demonstrated

- **Chat Participant Registration**: Using `vscode.chat.createChatParticipant()`
- **Response Streaming**: Real-time content delivery with progress indicators
- **File Integration**: Accessing and analyzing workspace files
- **Followup Providers**: Suggesting next actions to users
- **Error Handling**: Graceful error handling and user feedback

## Connecting to Your AI Server

To adapt this for your own AI service, modify the functions in `src/extension.ts`:

- Replace `simulateAIResponse()` with calls to your AI API
- Update `simulateStreamingResponse()` to handle your streaming protocol
- Add authentication headers and configuration as needed

## Related Documentation

See `AI_CHAT_INTEGRATION.md` in the repository root for comprehensive documentation on integrating AI chat with VS Code.