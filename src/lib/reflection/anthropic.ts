import { buildReflectionPrompt, type ReflectionEntry, type ReflectionProvider } from "./provider";

export class AnthropicProvider implements ReflectionProvider {
  constructor(private apiKey: string, private model: string) {}

  async generate(year: number, entries: ReflectionEntry[]): Promise<string> {
    if (!this.apiKey) throw new Error("Anthropic API key is not configured (settings or ANTHROPIC_API_KEY).");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        messages: [{ role: "user", content: buildReflectionPrompt(year, entries) }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = (await res.json()) as { content: Array<{ type: string; text?: string }> };
    const text = data.content.find((b) => b.type === "text")?.text;
    if (!text) throw new Error("Anthropic API returned no text.");
    return text;
  }
}
