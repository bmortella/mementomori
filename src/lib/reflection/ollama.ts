import { buildReflectionPrompt, type ReflectionEntry, type ReflectionProvider } from "./provider";

export class OllamaProvider implements ReflectionProvider {
  constructor(private host: string, private model: string) {}

  async generate(year: number, entries: ReflectionEntry[]): Promise<string> {
    const res = await fetch(`${this.host.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [{ role: "user", content: buildReflectionPrompt(year, entries) }],
      }),
    });
    if (!res.ok) throw new Error(`Ollama error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { message?: { content?: string } };
    if (!data.message?.content) throw new Error("Ollama returned no text.");
    return data.message.content;
  }
}
