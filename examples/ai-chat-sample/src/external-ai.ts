import * as vscode from 'vscode';

interface AIServerConfig {
    endpoint: string;
    apiKey?: string;
    model?: string;
}

export function activate(context: vscode.ExtensionContext) {
    // Create an AI participant that connects to external servers
    const externalAI = vscode.chat.createChatParticipant('external-ai', async (request, context, stream, token) => {
        try {
            const config = getAIServerConfig();
            
            if (!config.endpoint) {
                stream.markdown('⚠️ Please configure your AI server endpoint in settings.');
                return { metadata: { command: request.command } };
            }

            stream.progress('Connecting to AI server...');
            
            // Handle different types of requests
            if (request.command === 'summarize') {
                await handleSummarizeCommand(request, stream, config, token);
            } else if (request.command === 'translate') {
                await handleTranslateCommand(request, stream, config, token);
            } else {
                await handleGenericChat(request, stream, config, token);
            }
            
            return { metadata: { command: request.command } };
        } catch (error) {
            stream.markdown(`❌ Error: ${error.message}`);
            return { metadata: { command: request.command } };
        }
    });

    // Configure the participant
    externalAI.iconPath = new vscode.ThemeIcon('cloud');
    
    // Add followup suggestions
    externalAI.followupProvider = {
        provideFollowups(result, context, token) {
            return [
                {
                    prompt: 'Can you explain this in more detail?',
                    label: '📝 More details',
                    command: 'explain'
                },
                {
                    prompt: 'Summarize the key points',
                    label: '📋 Summarize',
                    command: 'summarize'
                },
                {
                    prompt: 'Translate this to Spanish',
                    label: '🌐 Translate',
                    command: 'translate'
                }
            ];
        }
    };

    context.subscriptions.push(externalAI);

    // Register configuration commands
    const configCommand = vscode.commands.registerCommand('external-ai.configure', async () => {
        const endpoint = await vscode.window.showInputBox({
            prompt: 'Enter your AI server endpoint URL',
            placeHolder: 'https://api.your-ai-service.com/v1/chat'
        });
        
        if (endpoint) {
            await vscode.workspace.getConfiguration('externalAI').update('endpoint', endpoint, vscode.ConfigurationTarget.Global);
            
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your API key (optional)',
                password: true,
                placeHolder: 'Your API key'
            });
            
            if (apiKey) {
                await vscode.workspace.getConfiguration('externalAI').update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
            }
            
            vscode.window.showInformationMessage('AI server configuration saved!');
        }
    });

    context.subscriptions.push(configCommand);
}

function getAIServerConfig(): AIServerConfig {
    const config = vscode.workspace.getConfiguration('externalAI');
    return {
        endpoint: config.get('endpoint', ''),
        apiKey: config.get('apiKey', ''),
        model: config.get('model', 'gpt-3.5-turbo')
    };
}

async function handleGenericChat(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    config: AIServerConfig,
    token: vscode.CancellationToken
) {
    // Prepare the messages for the AI service
    const messages = [
        {
            role: 'system',
            content: 'You are a helpful AI assistant integrated into VS Code. Provide concise, helpful responses.'
        },
        {
            role: 'user',
            content: request.prompt
        }
    ];

    // Add context from referenced files
    if (request.references && request.references.length > 0) {
        for (const ref of request.references) {
            if (ref.value instanceof vscode.Uri) {
                try {
                    const content = await vscode.workspace.fs.readFile(ref.value);
                    const text = new TextDecoder().decode(content);
                    messages.push({
                        role: 'user',
                        content: `Referenced file ${ref.value.fsPath}:\n\`\`\`\n${text}\n\`\`\``
                    });
                } catch (error) {
                    // File couldn't be read, skip it
                }
            }
        }
    }

    await streamAIResponse(messages, stream, config, token);
}

async function handleSummarizeCommand(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    config: AIServerConfig,
    token: vscode.CancellationToken
) {
    const messages = [
        {
            role: 'system',
            content: 'You are a summarization expert. Provide clear, concise summaries that capture the key points.'
        },
        {
            role: 'user',
            content: `Please summarize the following: ${request.prompt}`
        }
    ];

    await streamAIResponse(messages, stream, config, token);
}

async function handleTranslateCommand(
    request: vscode.ChatRequest,
    stream: vscode.ChatResponseStream,
    config: AIServerConfig,
    token: vscode.CancellationToken
) {
    const messages = [
        {
            role: 'system',
            content: 'You are a translation expert. Provide accurate translations while preserving meaning and context.'
        },
        {
            role: 'user',
            content: request.prompt
        }
    ];

    await streamAIResponse(messages, stream, config, token);
}

async function streamAIResponse(
    messages: Array<{role: string, content: string}>,
    stream: vscode.ChatResponseStream,
    config: AIServerConfig,
    token: vscode.CancellationToken
) {
    try {
        // Prepare request headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        
        if (config.apiKey) {
            headers['Authorization'] = `Bearer ${config.apiKey}`;
        }

        // Make request to AI service
        const response = await fetch(config.endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: config.model,
                messages: messages,
                stream: true,
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            throw new Error(`AI service returned ${response.status}: ${response.statusText}`);
        }

        // Handle streaming response
        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response stream available');
        }

        try {
            while (!token.isCancellationRequested) {
                const { done, value } = await reader.read();
                if (done) break;

                // Parse Server-Sent Events format
                const chunk = new TextDecoder().decode(value);
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            return;
                        }

                        try {
                            const parsed = JSON.parse(data);
                            const content = parsed.choices?.[0]?.delta?.content;
                            if (content) {
                                stream.markdown(content);
                            }
                        } catch (parseError) {
                            // Skip malformed JSON
                            console.warn('Failed to parse streaming response:', parseError);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    } catch (error) {
        stream.markdown(`Failed to get response from AI service: ${error.message}`);
    }
}

// Alternative implementation for non-streaming APIs
async function getNonStreamingResponse(
    messages: Array<{role: string, content: string}>,
    config: AIServerConfig
): Promise<string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    
    if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(config.endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            model: config.model,
            messages: messages,
            max_tokens: 1000
        })
    });

    if (!response.ok) {
        throw new Error(`AI service returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No response received';
}

export function deactivate() {
    // Cleanup if needed
}