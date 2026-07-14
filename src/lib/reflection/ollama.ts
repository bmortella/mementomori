import { buildReflectionPrompt, type ReflectionEntry, type ReflectionProvider } from "./provider";

export class OllamaProvider implements ReflectionProvider {
  constructor(private host: string, private model: string) {}

  async generate(year: number, entries: ReflectionEntry[], anchorPrompt?: string): Promise<string> {
    const res = await fetch(`${this.host.replace(/\/$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [{ role: "user", content: buildReflectionPrompt(year, entries, anchorPrompt) }],
      }),
      signal: AbortSignal.timeout(120_000), // bound the request; a stalled API must fail, not hang
    });
    if (!res.ok) throw new Error(`Ollama error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("Ollama returned no text.");
    return text;
  }
}
