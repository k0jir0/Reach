import { spawn } from 'node:child_process';

export function askAgy(prompt, options = {}) {
  const args = ['--print', prompt, '--print-timeout', options.timeout || '10m'];

  if (options.model) {
    args.push('--model', options.model);
  }

  if (options.workspace) {
    args.push('--add-dir', options.workspace);
  }

  return new Promise((resolve, reject) => {
    const child = spawn('agy', args, {
      cwd: options.cwd || process.cwd(),
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`agy exited with ${code}\n${stderr || stdout}`));
      }
    });
  });
}

export async function askOpenAICompatible(prompt, options = {}) {
  const baseUrl = (options.baseUrl || process.env.REACH_LLM_BASE_URL || 'http://localhost:8000/v1').replace(/\/$/, '');
  const model = options.model || process.env.REACH_LLM_MODEL || 'llama-4-scout';
  const apiKey = options.apiKey || process.env.REACH_LLM_API_KEY || '';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are Reach, a careful long-context repository analysis assistant.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM endpoint failed: ${response.status} ${response.statusText}\n${text}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
}
