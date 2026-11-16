# Mission: Staying out of the context "dumb zone"

## Why
Ship daet-connect.ph faster with Claude Code. Long sessions on this repo start well, then quality drops mid-feature; the goal is to notice that early and recover without losing work.

## Success looks like
- Can say, for any long session, whether to keep going, `/rewind`, `/compact`, `/clear`, or delegate to a subagent, and why
- Starts each feature with a short, written brief so a fresh session can pick it up
- Keeps AGENTS.md and CONTEXT.md short enough that instructions don't get lost

## Constraints
- Learns inside real sessions on this repo; lessons must be short

## Out of scope
- Building custom agents or MCP servers (for now)
- Model internals beyond what changes daily behaviour
