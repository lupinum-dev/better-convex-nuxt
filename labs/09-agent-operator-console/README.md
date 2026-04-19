# 09 Agent Operator Console

Concept brief only. Not runnable yet.

Inspired by: **internal AI ops / automation consoles**

## Why this example exists

This concept pressures the human-plus-agent operating model directly.

It should not collapse into a toy MCP demo. If implemented, it should be a real operator app where:

- agents have tools
- humans review or approve sensitive actions
- operations are the shared seam
- the same domain model serves both UI and automation

## What Trellis must make easy

- capability-aware tool exposure
- human approval loops for destructive work
- sessions or temporary tool context only if they stay out of the core mental model
- auditability of preview, denial, and execution
- agent-visible summaries without leaking hidden data

## Agent story

The whole example is the agent story.

Typical flows:

- review environment health
- summarize incidents or operational debt
- propose changes
- request approval
- execute a protected operation

## What this example validates

- the Trellis agent pillar as a real product capability
- one backend model across UI and agents
- safe automation as a first-class application pattern
- whether the MCP surface is clean enough to teach and operate
