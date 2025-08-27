# External AI Chat Integration Example

This example demonstrates how to connect VS Code's chat interface to external AI services like OpenAI, local AI servers, or custom AI endpoints.

## Features

- **Configurable AI Service**: Connect to any OpenAI-compatible API
- **Streaming Responses**: Real-time response streaming for better UX
- **Multiple Commands**: Support for different chat commands (summarize, translate, etc.)
- **File Context**: Automatically include referenced files in chat context
- **Error Handling**: Robust error handling and user feedback

## Setup

1. **Install Dependencies**:
   ```bash
   npm install
   npm run compile
   ```

2. **Configure AI Service**:
   - Run the command `External AI: Configure External AI`
   - Enter your AI service endpoint (e.g., `https://api.openai.com/v1/chat/completions`)
   - Enter your API key if required

3. **Usage**:
   - Open VS Code chat panel
   - Use `@external-ai` followed by your message
   - Try commands like:
     - `@external-ai /summarize` - Summarize content
     - `@external-ai /translate` - Translate text
     - `@external-ai` - General chat

## Supported AI Services

### OpenAI API
```
Endpoint: https://api.openai.com/v1/chat/completions
API Key: Your OpenAI API key
Model: gpt-3.5-turbo, gpt-4, etc.
```

### Local AI Server (e.g., Ollama)
```
Endpoint: http://localhost:11434/v1/chat/completions
API Key: (leave blank)
Model: llama2, codellama, etc.
```

### Azure OpenAI
```
Endpoint: https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2024-02-15-preview
API Key: Your Azure API key
Model: Your deployment name
```

### Custom AI Server
Implement an OpenAI-compatible endpoint in your server that accepts:
```json
{
  "model": "your-model",
  "messages": [
    {"role": "system", "content": "System prompt"},
    {"role": "user", "content": "User message"}
  ],
  "stream": true
}
```

## Configuration

Settings are stored in VS Code settings and can be configured via:

1. **Command Palette**: `External AI: Configure External AI`
2. **Settings UI**: Search for "External AI"
3. **settings.json**:
   ```json
   {
     "externalAI.endpoint": "https://api.openai.com/v1/chat/completions",
     "externalAI.apiKey": "your-api-key",
     "externalAI.model": "gpt-3.5-turbo"
   }
   ```

## Security Notes

- API keys are stored in VS Code settings (which may be synced)
- Consider using environment variables for sensitive keys
- For production use, implement proper secret management

## Extending the Example

You can extend this example to:

- Add authentication workflows
- Support different AI providers
- Implement custom prompt engineering
- Add specialized commands for code analysis
- Integrate with workspace-specific configurations