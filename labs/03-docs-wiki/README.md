# 03 Docs Wiki

Concept brief only. Not runnable yet.

Inspired by: **Notion**

## Why this example exists

This is where many frameworks break.
Documents look like content.
In practice they pressure:

- nested ownership
- partial sharing
- comments
- publish states
- internal vs public visibility
- structured content + database-style views

## What Trellis must make easy

- tenant-scoped spaces and documents
- document-level visibility rules beyond plain workspace membership
- field redaction and capability attachment on returned data
- public share links that do not collapse the main permission model
- comments, mentions, and history on the same backend layer

## Agent story

Agents should be able to:

- search docs the actor can actually access
- summarize or rewrite content
- create drafts
- suggest linked follow-up tasks
- publish only through protected operations

## What this example validates

- visibility as a first-class concern
- nested content permissions
- partial public access without a separate backend
- document-aware agent search and actions
