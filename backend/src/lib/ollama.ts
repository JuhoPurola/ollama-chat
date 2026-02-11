export async function chatStream(
  ollamaUrl: string,
  model: string,
  messages: Array<{ role: string; content: string }>
): Promise<Response> {
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  return response;
}

export async function listModels(ollamaUrl: string): Promise<any> {
  const response = await fetch(`${ollamaUrl}/api/tags`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function pullModel(ollamaUrl: string, name: string): Promise<any> {
  const response = await fetch(`${ollamaUrl}/api/pull`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      stream: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama API error: ${response.status} - ${body}`);
  }

  // Read the streaming response to completion
  const reader = response.body?.getReader();
  if (!reader) return { status: 'success' };

  const decoder = new TextDecoder();
  let lastStatus = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n').filter(l => l.trim());
    for (const line of lines) {
      try {
        const data = JSON.parse(line);
        if (data.error) throw new Error(data.error);
        if (data.status) lastStatus = data.status;
      } catch (e) {
        if (e instanceof Error && e.message !== line) throw e;
      }
    }
  }

  return { status: lastStatus || 'success' };
}

export async function deleteModel(ollamaUrl: string, name: string): Promise<void> {
  const response = await fetch(`${ollamaUrl}/api/delete`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }
}
