import { For, Show, createSignal } from "solid-js"
import type { AssistantMessage, Part as PartType, ToolPart, UserMessage } from "@opencode-ai/sdk/v2"
import { Collapsible } from "./collapsible"

export interface PromptData {
  system: string[]
  tools: Array<{ name: string; description?: string; parameters?: unknown } | string>
  params: Record<string, unknown>
}

export interface PromptInspectorProps {
  message: AssistantMessage | undefined
  allMessages: Array<AssistantMessage | UserMessage>
  parts: Record<string, PartType[]>
}

function tokens(text: string) {
  const n = Math.round(text.length / 4)
  if (n >= 1000) return `~${(n / 1000).toFixed(1)}k tokens`
  return `~${n} tokens`
}

function Section(props: { title: string; count?: string; children: any; defaultOpen?: boolean }) {
  return (
    <Collapsible defaultOpen={props.defaultOpen} variant="ghost">
      <Collapsible.Trigger>
        <div data-component="prompt-section-trigger">
          <span data-slot="prompt-section-title" class="text-13-regular">
            {props.title}
            <Show when={props.count}>
              {(c) => <span class="text-text-weak"> ({c()})</span>}
            </Show>
          </span>
          <Collapsible.Arrow />
        </div>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div data-slot="prompt-section-body">{props.children}</div>
      </Collapsible.Content>
    </Collapsible>
  )
}

function ToolItem(props: { tool: { name: string; description?: string; parameters?: unknown } | string }) {
  const name = () => (typeof props.tool === "string" ? props.tool : props.tool.name)
  const desc = () => (typeof props.tool === "string" ? undefined : props.tool.description)
  const schema = () => {
    if (typeof props.tool === "string") return undefined
    if (!props.tool.parameters) return undefined
    return JSON.stringify(props.tool.parameters, null, 2)
  }

  return (
    <Collapsible variant="ghost">
      <Collapsible.Trigger>
        <div data-component="prompt-tool-trigger">
          <span class="text-12-medium">{name()}</span>
          <Collapsible.Arrow />
        </div>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div data-slot="prompt-tool-detail">
          <Show when={desc()}>
            <div data-slot="prompt-tool-desc">
              <span class="text-11-regular text-text-weak">{desc()}</span>
            </div>
          </Show>
          <Show when={schema()}>
            <pre data-slot="prompt-code-block">
              <code>{schema()}</code>
            </pre>
          </Show>
        </div>
      </Collapsible.Content>
    </Collapsible>
  )
}

export function PromptInspector(props: PromptInspectorProps) {
  const prompt = () => (props.message as any)?.prompt as PromptData | undefined

  const system = () => {
    const p = prompt()
    if (!p?.system?.length) return "(not captured)"
    return p.system.join("\n\n--- next system prompt ---\n\n")
  }

  const tools = () => {
    const p = prompt()
    return p?.tools ?? []
  }

  const toolsText = () => {
    return tools()
      .map((t) => (typeof t === "string" ? t : JSON.stringify(t)))
      .join("")
  }

  const params = () => {
    const p = prompt()
    if (!p?.params) return "(not captured)"
    return Object.entries(p.params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join("\n")
  }

  const formatMessage = (m: AssistantMessage | UserMessage) => {
    const lines: string[] = []
    if (m.role === "user") {
      const user = m as UserMessage
      lines.push(`--- [User] (agent: ${user.agent}, model: ${user.model.modelID}) ---`)
      if (user.system) lines.push(`[Custom System Prompt]: ${user.system}`)
      const parts = props.parts[m.id] ?? []
      for (const p of parts) {
        if (p.type === "text" && p.text?.trim()) lines.push(p.text.trim())
        if (p.type === "file") lines.push(`[File: ${(p as any).filename ?? "attachment"}]`)
        if (p.type === "tool") {
          const t = p as ToolPart
          lines.push(`[Tool Call: ${t.tool}] input: ${JSON.stringify(t.state?.input ?? {})}`)
        }
      }
    }
    if (m.role === "assistant") {
      const asst = m as AssistantMessage
      lines.push(`--- [Assistant] (model: ${asst.modelID}, agent: ${asst.agent}) ---`)
      const parts = props.parts[m.id] ?? []
      for (const p of parts) {
        if (p.type === "text" && p.text?.trim()) lines.push(p.text.trim())
        if (p.type === "reasoning" && (p as any).text?.trim()) lines.push(`[Reasoning]: ${(p as any).text.trim()}`)
        if (p.type === "tool") {
          const t = p as ToolPart
          const output = t.state && "output" in t.state ? (t.state as any).output : undefined
          lines.push(`[Tool Call: ${t.tool}] input: ${JSON.stringify(t.state?.input ?? {})}`)
          if (output)
            lines.push(
              (() => {
                const raw = typeof output === "string" ? output : JSON.stringify(output)
                if (raw.length <= 300) return `[Tool Result]: ${raw}`
                return `[Tool Result]: ${raw.slice(0, 300)} [...${raw.length - 300} characters truncated.]`
              })(),
            )
        }
      }
    }
    return lines.join("\n")
  }

  const relevant = () => {
    const msg = props.message
    if (!msg) return []
    const result: Array<AssistantMessage | UserMessage> = []
    for (const m of props.allMessages) {
      result.push(m)
      if (m.role === "assistant" && m.id === msg.id) break
    }
    return result
  }

  const lastTurn = () => {
    const all = relevant()
    if (!all.length) return ""
    // find the last user message index
    let idx = all.length - 1
    while (idx >= 0 && all[idx].role !== "user") idx--
    if (idx < 0) idx = 0
    return all
      .slice(idx)
      .map(formatMessage)
      .join("\n\n")
  }

  const earlier = () => {
    const all = relevant()
    if (!all.length) return ""
    let idx = all.length - 1
    while (idx >= 0 && all[idx].role !== "user") idx--
    if (idx <= 0) return ""
    return all
      .slice(0, idx)
      .map(formatMessage)
      .join("\n\n")
  }

  return (
    <Show
      when={props.message}
      fallback={
        <div data-component="prompt-inspector-empty">
          <span class="text-13-regular text-text-weak">No message selected for inspection</span>
        </div>
      }
    >
      <div data-component="prompt-inspector">
        <div data-slot="prompt-inspector-header">
          <span class="text-13-regular text-text-weak">
            Inspecting: {props.message!.agent} / {props.message!.modelID}
          </span>
        </div>
        <div data-slot="prompt-inspector-sections">
          <Section title="System Prompt" count={tokens(system())}>
            <pre data-slot="prompt-code-block">
              <code>{system()}</code>
            </pre>
          </Section>
          <Section title={`Tools (${tools().length})`} count={tokens(toolsText())}>
            <Show
              when={tools().length > 0}
              fallback={<span class="text-12-regular text-text-weak">(none)</span>}
            >
              <div data-slot="prompt-tools-list">
                <For each={tools()}>{(t) => <ToolItem tool={t} />}</For>
              </div>
            </Show>
          </Section>
          <Section title="Model Parameters" count={tokens(params())}>
            <pre data-slot="prompt-code-block">
              <code>{params()}</code>
            </pre>
          </Section>
          <Section title="Conversation History" count={tokens(earlier() + lastTurn())} defaultOpen>
            <Show when={earlier()}>
              {(() => {
                const [open, setOpen] = createSignal(false)
                return (
                  <Collapsible variant="ghost" onOpenChange={setOpen}>
                    <Collapsible.Trigger>
                      <div data-component="prompt-tool-trigger">
                        <span class="text-12-medium text-text-weak">
                          {open() ? "Hide earlier messages" : "Show earlier messages"}
                        </span>
                        <Collapsible.Arrow />
                      </div>
                    </Collapsible.Trigger>
                    <Collapsible.Content>
                      <pre data-slot="prompt-code-block">
                        <code>{earlier()}</code>
                      </pre>
                    </Collapsible.Content>
                  </Collapsible>
                )
              })()}
            </Show>
            <pre data-slot="prompt-code-block">
              <code>{lastTurn()}</code>
            </pre>
          </Section>
        </div>
      </div>
    </Show>
  )
}
