---
label: wayfinder:task
status: closed
blocked-by: []
---
## Question
Can a Design canvas board load a shared shell file instead of repeating the shell markup? Test with one throwaway board; record yes/no and how.

## Resolution
Answer: **yes, with a limit.** Not rendered or tried on the live canvas; this comes from the Design format's own rules (`artifact-type/reference/format.md`, "Child DCs").
- `<dc-import name="Sidebar" active="operators" hint-size="240px,100%"></dc-import>` mounts the sibling file `Sidebar.dc.html` and passes other attributes as props (read as `this.props.active`, declared in `data-props`).
- The format documents no slot or children mechanism, so a shared component cannot wrap a board's own content. A single shell around the content is not possible; chrome must be split.
- Decision: two shared components, `Sidebar.dc.html` (prop: `active`) and `TopBar.dc.html` (props: `section`, `page`). Each board lays them out beside its own content.
- Each imported file is also an artboard of its own: each needs a `canvas.json` entry with its `$preview` size, and a `<head>` that lets it render alone.
- Risk to check when the first board is built: that collapse state in `Sidebar` works inside an import. If it fails, fall back to copying markup from `Main.dc.html`.
