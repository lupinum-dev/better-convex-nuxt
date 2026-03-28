/**
 * MCP Handler with Code Mode enabled.
 *
 * Code Mode replaces individual tools with a single `code` tool that lets
 * LLMs write JavaScript to orchestrate multiple tool calls in one execution.
 * This reduces round-trips and token usage significantly.
 */
export default defineMcpHandler({
  experimental_codeMode: true,
})
