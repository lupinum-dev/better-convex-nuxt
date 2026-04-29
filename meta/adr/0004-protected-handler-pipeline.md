# 0004: Keep The Protected Handler Pipeline

Status: Accepted
Date: 2026-04-29

## Context

Trellis needs one authorization path across browser UI, server routes, trusted forwarding, webhooks, and MCP tools. Transport-specific backends drift too easily.

## Decision

The protected backend decision path is:

1. principal
2. actor
3. guard
4. load
5. authorize
6. handler

Observation is emitted around guard, authorization, destructive-operation, MCP, and trust-boundary decisions. It is not a final phase that runs after every handler.

The exact API ergonomics may improve, but the model stays.

## Consequences

Transport identity and app authorization remain separate.

Record-specific authorization belongs after load, not in UI gates or broad route guards.

Observability can inspect decisions without becoming part of business identity or implying a post-handler hook for every call.
