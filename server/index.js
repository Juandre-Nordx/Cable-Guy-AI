const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'client')));

const systemPrompt = `You are Cable Guy AI, a professional network technician.

You do NOT give generic answers.

Before giving any solution:
- Ask 3 to 5 questions to understand the problem

Focus on:
- House size
- Distance issues
- Walls/obstacles
- Current ISP setup
- Devices used

After questions are answered:
- Diagnose the problem
- Recommend a solution
- Suggest a kit type

Output format:

PROBLEM:
...

SOLUTION:
...

RECOMMENDED KIT:
(Home WiFi Kit / Bridge Kit / Business Kit)

NOTES:
...`;

const conversationHistory = [{ role: 'system', content: systemPrompt }];

app.post('/chat', async (req, res) => {
  const userMessage = req.body?.message;

  if (!userMessage || typeof userMessage !== 'string') {
    return res.status(400).json({ error: 'A valid message string is required.' });
  }

  conversationHistory.push({ role: 'user', content: userMessage.trim() });

  try {
    const ollamaResponse = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4',
        stream: false,
        messages: conversationHistory
      })
    });

    if (!ollamaResponse.ok) {
      const errorText = await ollamaResponse.text();
      throw new Error(`Ollama error ${ollamaResponse.status}: ${errorText}`);
    }

    const data = await ollamaResponse.json();
    const assistantMessage = data?.message?.content || 'I could not generate a response right now.';

    conversationHistory.push({ role: 'assistant', content: assistantMessage });

    if (conversationHistory.length > 31) {
      conversationHistory.splice(1, conversationHistory.length - 31);
    }

    return res.json({ reply: assistantMessage });
  } catch (error) {
    console.error('Chat error:', error.message);
    return res.status(500).json({
      error: 'Unable to reach AI service. Make sure Ollama is running on localhost:11434.'
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Cable Guy AI server running on port ${PORT}`);
});
