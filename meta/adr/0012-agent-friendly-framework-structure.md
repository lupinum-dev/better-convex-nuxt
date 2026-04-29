# 0012: Optimize The Framework For Human And Agent Workflows

Status: Accepted
Date: 2026-04-29

## Context

AI agents are increasingly useful in coding and operational workflows. Loose conventions are harder for agents to follow safely because they require too many inferred architectural decisions.

## Decision

Trellis treats agent-friendly structure as a first-class framework concern.

The framework should provide clear file ownership, explicit trust boundaries, typed contracts, generated shape, guardrails, and destructive-operation policies so humans and agents can work inside the same model.

## Consequences

This reinforces the feature-folder shape, root foundation docs, `SKILL.md`, examples, lint rules, and `doctor` checks.

Agent support should stay on the same backend model as human-facing app behavior. It should not become a separate side system.
