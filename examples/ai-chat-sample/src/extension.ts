import * as vscode from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    // Create a simple AI chat participant
    const simpleParticipant = vscode.chat.createChatParticipant('simple-ai', async (request, context, stream, token) => {
        try {
            // Show progress indicator
            stream.progress('Processing your request...');
            
            // Simulate AI processing with a simple response
            const response = await simulateAIResponse(request.prompt);
            
            // Stream the response back
            stream.markdown(response);
            
            return { metadata: { command: request.command } };
        } catch (error) {
            stream.markdown(`Sorry, I encountered an error: ${error.message}`);
            return { metadata: { command: request.command } };
        }
    });

    // Configure the participant
    simpleParticipant.iconPath = new vscode.ThemeIcon('robot');
    
    // Add followup provider
    simpleParticipant.followupProvider = {
        provideFollowups(result, context, token) {
            return [
                {
                    prompt: 'Explain more about this topic',
                    label: '🔍 Learn more',
                    command: 'explain'
                },
                {
                    prompt: 'Show me an example',
                    label: '💡 Show example',
                    command: 'example'
                }
            ];
        }
    };

    // Create a more advanced streaming participant
    const streamingParticipant = vscode.chat.createChatParticipant('streaming-ai', async (request, context, stream, token) => {
        try {
            stream.progress('Connecting to AI service...');
            
            // Simulate streaming response
            await simulateStreamingResponse(request.prompt, stream, token);
            
            return { metadata: { command: request.command } };
        } catch (error) {
            stream.markdown(`Sorry, I encountered an error: ${error.message}`);
            return { metadata: { command: request.command } };
        }
    });

    streamingParticipant.iconPath = new vscode.ThemeIcon('circuit-board');

    // Create a participant that can work with files
    const fileParticipant = vscode.chat.createChatParticipant('file-ai', async (request, context, stream, token) => {
        try {
            stream.progress('Analyzing files...');
            
            // Check if there are file references in the request
            if (request.references && request.references.length > 0) {
                for (const ref of request.references) {
                    if (ref.value instanceof vscode.Uri) {
                        try {
                            const content = await vscode.workspace.fs.readFile(ref.value);
                            const text = new TextDecoder().decode(content);
                            
                            stream.markdown(`Analyzing file: \`${ref.value.fsPath}\`\n\n`);
                            stream.markdown(`File has ${text.split('\n').length} lines and ${text.length} characters.\n\n`);
                            
                            // Simple analysis
                            if (text.includes('function')) {
                                stream.markdown('🔍 This appears to be a code file with functions.\n');
                            }
                            if (text.includes('TODO') || text.includes('FIXME')) {
                                stream.markdown('⚠️ Found TODO/FIXME comments in the file.\n');
                            }
                        } catch (error) {
                            stream.markdown(`Could not read file: ${error.message}\n`);
                        }
                    }
                }
            } else {
                stream.markdown('No files were referenced. Try mentioning a file with #file:path/to/file.js');
            }
            
            return { metadata: { command: request.command } };
        } catch (error) {
            stream.markdown(`Sorry, I encountered an error: ${error.message}`);
            return { metadata: { command: request.command } };
        }
    });

    fileParticipant.iconPath = new vscode.ThemeIcon('file-code');

    // Register all participants
    context.subscriptions.push(simpleParticipant, streamingParticipant, fileParticipant);

    // Register a command to demonstrate chat integration
    const openChatCommand = vscode.commands.registerCommand('ai-chat-sample.openChat', () => {
        vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
    });

    context.subscriptions.push(openChatCommand);
}

async function simulateAIResponse(prompt: string): Promise<string> {
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simple keyword-based responses
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('hello') || lowerPrompt.includes('hi')) {
        return 'Hello! I\'m your AI assistant. How can I help you today? 👋';
    } else if (lowerPrompt.includes('code') || lowerPrompt.includes('programming')) {
        return `I can help you with coding! Here are some things I can assist with:

- Code review and suggestions
- Debugging help
- Documentation generation
- Code optimization
- Best practices

What specific coding task are you working on?`;
    } else if (lowerPrompt.includes('explain')) {
        return `I'd be happy to explain things! I can help clarify:

- Programming concepts
- Code functionality
- Best practices
- Architecture patterns
- Technical documentation

What would you like me to explain?`;
    } else {
        return `I received your message: "${prompt}"

I'm a sample AI assistant built with VS Code's chat participant API. I can:

- Answer questions about code
- Help with programming tasks
- Analyze files and code
- Provide explanations and examples

Try asking me about programming concepts or mention a file to analyze!`;
    }
}

async function simulateStreamingResponse(prompt: string, stream: vscode.ChatResponseStream, token: vscode.CancellationToken) {
    const response = `I'm streaming a response to: "${prompt}"

This demonstrates how to stream content back to the user in real-time. Each chunk is sent separately to create a typing effect.

Here's some sample code that might be relevant:

\`\`\`typescript
function greetUser(name: string): string {
    return \`Hello, \${name}! Welcome to VS Code.\`;
}

// Usage example
const greeting = greetUser("Developer");
console.log(greeting);
\`\`\`

This streaming approach is great for:
- Long responses
- Real-time feedback
- Better user experience
- Cancellable operations`;

    // Split response into chunks and stream them
    const chunks = response.split(' ');
    let currentChunk = '';
    
    for (let i = 0; i < chunks.length; i++) {
        if (token.isCancellationRequested) {
            break;
        }
        
        currentChunk += chunks[i] + ' ';
        
        // Send chunk every few words
        if (i % 3 === 0 || i === chunks.length - 1) {
            stream.markdown(currentChunk);
            currentChunk = '';
            
            // Simulate processing delay
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }
}

export function deactivate() {
    // Clean up resources if needed
}