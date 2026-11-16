# Context Management Resources

## Knowledge

- [Effective context engineering for AI agents (Anthropic Engineering)](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
  Primary source. Defines context rot and the "attention budget"; compaction, structured notes, sub-agents, just-in-time retrieval. Use for: why long contexts degrade and the three remedies.
- [Best practices for Claude Code (Anthropic docs)](https://code.claude.com/docs/en/best-practices)
  Primary source. Steering controls (`Esc`, `/rewind`, `/clear`), `/compact` with a focus, and a "What you can stop doing" table that retires some older advice. Use for: which command to reach for, and what is now outdated.
- [Context Rot (Chroma Research)](https://research.trychroma.com/context-rot)
  Empirical study of 18 models: reliability falls as input grows, even on simple tasks, and similar-looking distractors hurt most. Cited via search summary only; the host was not reachable from this session, so read it directly. Use for: evidence that degradation is gradual, not a cliff.
- [Explore the context window (Anthropic docs)](https://code.claude.com/docs/en/context-window.md)
  What fills a Claude Code session and when it loads. Not yet read. Use for: lesson on what eats your context.

## Wisdom (Communities)

- None added yet. Ask the teacher if you want a community; skipped until then.

## Gaps
- No primary source found for the exact "dumb zone" percentage thresholds (community figures of 40-70% circulate and disagree). Treat as folklore until sourced.
