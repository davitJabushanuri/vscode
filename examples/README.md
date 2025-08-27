# VS Code AI Chat Integration Examples

This directory contains example extensions demonstrating how to integrate AI chat functionality with VS Code.

## Examples

### 1. [ai-chat-sample](./ai-chat-sample/)
A basic example showing three types of chat participants:
- **SimpleAI**: Basic chat responses with keyword detection
- **StreamingAI**: Demonstrates real-time response streaming
- **FileAI**: Shows how to analyze files referenced in chat

### 2. [external-ai-chat](./external-ai-chat/)
A production-ready example that connects to external AI services:
- Configurable endpoints (OpenAI, local servers, custom APIs)
- Streaming responses from real AI services
- Multiple chat commands (summarize, translate, etc.)
- File context integration
- Robust error handling

## Getting Started

1. Choose an example that fits your needs
2. Follow the README in each example directory
3. Modify the code to connect to your AI service
4. Build and test the extension

## Key Concepts Demonstrated

- **Chat Participant Registration**: Using VS Code's chat participant API
- **Response Streaming**: Real-time content delivery
- **File Integration**: Accessing workspace files in chat context
- **Configuration Management**: Storing and retrieving extension settings
- **Error Handling**: Graceful failure handling and user feedback
- **Command Support**: Implementing custom chat commands

## See Also

- [AI_CHAT_INTEGRATION.md](../AI_CHAT_INTEGRATION.md) - Comprehensive documentation
- [VS Code Chat API](https://code.visualstudio.com/api/extension-guides/chat) - Official documentation