import type { CallToolResult } from "@modelcontextprotocol/server";

export interface McpToolDiagnostic {
  readonly callId: string;
  readonly causeConstructorName: string | null;
  readonly causeName: string | null;
  readonly classification: "unknown";
  readonly functionName?: string;
  readonly hasStructuredData: boolean;
  readonly operation: "query" | "mutation" | "action";
  readonly outcome: "failed";
  readonly toolName: string;
}

export interface McpToolDiagnosticOptions {
  readonly functionName?: string;
  readonly onDiagnostic?: (diagnostic: McpToolDiagnostic) => void;
  readonly operation: McpToolDiagnostic["operation"];
  readonly toolName: string;
}

/**
 * Converts unexpected application or infrastructure throws into one static MCP tool failure.
 * Expected domain outcomes and deliberately projected actionable failures remain ordinary return values.
 */
export async function runMcpTool(
  operation: () => CallToolResult | Promise<CallToolResult>,
  diagnosticOptions?: McpToolDiagnosticOptions,
): Promise<CallToolResult> {
  try {
    return await operation();
  } catch (cause) {
    emitDiagnostic(diagnosticOptions, cause);
    return {
      content: [{ type: "text", text: "Tool execution failed" }],
      isError: true,
    };
  }
}

function emitDiagnostic(
  options: McpToolDiagnosticOptions | undefined,
  cause: unknown,
): void {
  if (!options?.onDiagnostic) return;
  const diagnostic = Object.freeze({
    callId: crypto.randomUUID(),
    causeConstructorName: safeConstructorName(cause),
    causeName: safeErrorName(cause),
    classification: "unknown" as const,
    ...(options.functionName === undefined
      ? {}
      : { functionName: options.functionName }),
    hasStructuredData: hasOwnDataField(cause),
    operation: options.operation,
    outcome: "failed" as const,
    toolName: options.toolName,
  });
  try {
    options.onDiagnostic(diagnostic);
  } catch {
    // Observability is deliberately non-authoritative.
  }
}

function safeConstructorName(value: unknown): string | null {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  )
    return null;
  try {
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (!prototype) return null;
    const descriptor = Object.getOwnPropertyDescriptor(
      prototype,
      "constructor",
    );
    if (
      !descriptor ||
      !("value" in descriptor) ||
      typeof descriptor.value !== "function"
    )
      return null;
    const nameDescriptor = Object.getOwnPropertyDescriptor(
      descriptor.value,
      "name",
    );
    return nameDescriptor &&
      "value" in nameDescriptor &&
      typeof nameDescriptor.value === "string"
      ? nameDescriptor.value.slice(0, 80)
      : null;
  } catch {
    return null;
  }
}

function safeErrorName(value: unknown): string | null {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  )
    return null;
  try {
    let current: object | null = value;
    for (let depth = 0; current && depth < 6; depth += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(current, "name");
      if (
        descriptor &&
        "value" in descriptor &&
        typeof descriptor.value === "string"
      ) {
        return descriptor.value.slice(0, 80);
      }
      current = Object.getPrototypeOf(current) as object | null;
    }
  } catch {
    return null;
  }
  return null;
}

function hasOwnDataField(value: unknown): boolean {
  if (
    (typeof value !== "object" && typeof value !== "function") ||
    value === null
  )
    return false;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, "data");
    return (
      descriptor !== undefined &&
      "value" in descriptor &&
      descriptor.value !== undefined
    );
  } catch {
    return false;
  }
}
