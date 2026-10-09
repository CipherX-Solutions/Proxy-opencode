import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Enable CORS for external tools, browser extensions, and cURL
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

app.use(express.json({ limit: '10mb' }));

// Set persistent path for local key generation
const KEYS_FILE = process.env.KEYS_FILE 
  ? path.resolve(process.env.KEYS_FILE) 
  : path.join(__dirname, 'api-keys.json');

function getOrGenerateKeys() {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const content = fs.readFileSync(KEYS_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (e) {
    console.error('Could not load keys file:', e.message);
  }
  
  const defaultKeys = { "default": `sk-${Math.random().toString(36).substring(2)}${Date.now().toString(36)}` };
  try {
    fs.writeFileSync(KEYS_FILE, JSON.stringify(defaultKeys, null, 2), 'utf8');
  } catch (e) {
    console.error('Could not save initial keys file:', e.message);
  }
  return defaultKeys;
}

getOrGenerateKeys();

// Health Check Endpoints
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    domain: 'AI.cpxs.ca',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// OpenAI Models Endpoint
app.get('/v1/models', (req, res) => {
  res.status(200).json({
    object: 'list',
    data: [
      { id: 'deepseek-v4-flash-free', object: 'model', created: 1700000000, owned_by: 'opencode-proxy' },
      { id: 'minimax-m2.5-free', object: 'model', created: 1700000000, owned_by: 'opencode-proxy' },
      { id: 'qwen3.6-plus-free', object: 'model', created: 1700000000, owned_by: 'opencode-proxy' }
    ]
  });
});

// OpenAI Chat Completions Handler
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const { model, messages, stream, temperature, top_p } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        error: { message: 'Invalid payload: "messages" array is required.' }
      });
    }

    const upstreamUrl = 'https://opencode.ai/zen/v1/chat/completions';
    
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer public',
        'User-Agent': 'opencode/1.15.0 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.13',
        'x-opencode-client': 'cli',
        'x-opencode-project': 'global',
        'x-opencode-request': `msg_${Math.random().toString(36).substring(2, 10)}`,
        'x-opencode-session': `ses_${Math.random().toString(36).substring(2, 10)}`
      },
      body: JSON.stringify({
        model: model || 'deepseek-v4-flash-free',
        messages,
        stream: !!stream,
        ...(temperature !== undefined && { temperature }),
        ...(top_p !== undefined && { top_p })
      })
    });

    if (stream && upstreamResponse.body) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      const reader = upstreamResponse.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      return res.end();
    }

    const data = await upstreamResponse.json();
    return res.status(upstreamResponse.status).json(data);

  } catch (error) {
    console.error('Proxy Error:', error);
    return res.status(500).json({
      error: { message: 'Internal proxy execution error.', details: error.message }
    });
  }
});

// Anthropic Compatible Messages Handler
app.post('/v1/messages', async (req, res) => {
  try {
    const { model, messages } = req.body;

    const formattedMessages = (messages || []).map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    }));

    const upstreamUrl = 'https://opencode.ai/zen/v1/chat/completions';
    const upstreamResponse = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer public',
        'User-Agent': 'opencode/1.15.0 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.13',
        'x-opencode-client': 'cli',
        'x-opencode-project': 'global',
        'x-opencode-request': `msg_${Math.random().toString(36).substring(2, 10)}`,
        'x-opencode-session': `ses_${Math.random().toString(36).substring(2, 10)}`
      },
      body: JSON.stringify({
        model: model || 'deepseek-v4-flash-free',
        messages: formattedMessages,
        stream: false
      })
    });

    const data = await upstreamResponse.json();
    const assistantContent = data.choices?.[0]?.message?.content || '';

    return res.status(200).json({
      id: `msg_${Date.now()}`,
      type: 'message',
      role: 'assistant',
      model: model || 'deepseek-v4-flash-free',
      content: [{ type: 'text', text: assistantContent }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 20 }
    });
  } catch (error) {
    console.error('Anthropic proxy error:', error);
    return res.status(500).json({ error: { type: 'api_error', message: error.message } });
  }
});

// Dynamic Passenger Port Binding
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`OpenCode proxy active for AI.cpxs.ca on port: ${PORT}`);
});
