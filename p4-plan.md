# Flash API-Managed Meeting Canvas

## Summary

Build P4 as a **Next.js 16.2.6** light-mode React Flow app. The product name is **Flash**. Flash passively records meeting memory, only answers when manually invoked, and renders the meeting as an API-managed graph.

P2 must also ingest the **entire canvas** so Superlinked can retrieve over visual meeting memory, not just transcript/docs.

## Integration Changes

- **P1 -> P2:** passive utterances still go to `POST /ingest`.
- **P4 -> P2:** prep docs/links still go to `POST /sources`.
- **P4 -> P2 canvas sync:** extend `POST /sources` with `type: "canvas"` items containing the full serialized graph plus text chunks.
- **P3 -> P4:** P4 polls `/events`, converts responses into nodes/edges.
- **Manual Flash only:** normal transcript/chat/doc ingestion never triggers answers; manual prompt/wake/API command calls P3 `/agent`.

## Canvas Memory Contract

P4 sends the full canvas to P2 using existing `/sources`:

```json
{
  "meetingId": "m_123",
  "items": [
    {
      "type": "canvas",
      "title": "Flash canvas snapshot v12",
      "content": "Text rendering of every node, edge, decision, action, chat item, document, image caption, answer, diagram, and source.",
      "metadata": {
        "canvasVersion": 12,
        "nodes": [],
        "edges": []
      }
    }
  ]
}
```

P2 stores the raw graph JSON, chunks the `content`, indexes it with Superlinked, and returns canvas chunks from `/retrieve` with `source: "canvas"`.

## Node Types

```ts
type CanvasNodeType =
  | "speaker" | "utterance" | "chat_context" | "document" | "image"
  | "link" | "topic" | "question" | "flash_answer" | "diagram"
  | "decision" | "action_item" | "summary" | "source" | "memory_chunk";
```

## Edge Types

```ts
type CanvasEdgeType =
  | "said"
  | "shared"
  | "mentions"
  | "answers"
  | "generated"
  | "cites"
  | "summarizes"
  | "decided_from"
  | "assigned_to"
  | "follows"
  | "derived_from";
```

## P4 API Surface

- `GET /api/canvas/[meetingId]`
- `POST /api/canvas/[meetingId]/nodes`
- `PATCH /api/canvas/[meetingId]/nodes/[nodeId]`
- `DELETE /api/canvas/[meetingId]/nodes/[nodeId]`
- `POST /api/canvas/[meetingId]/edges`
- `DELETE /api/canvas/[meetingId]/edges/[edgeId]`
- `POST /api/canvas/[meetingId]/events`
- `POST /api/canvas/[meetingId]/commands`
- `POST /api/canvas/[meetingId]/query`
- `POST /api/canvas/[meetingId]/summarize`
- `POST /api/canvas/[meetingId]/sync-memory`

`sync-memory` serializes the whole graph and posts the canvas item to P2 `/sources`.

## Build Prompt

```text
Build P4 "Flash Face" as a Next.js App Router app using exactly next@16.2.6, TypeScript, and @xyflow/react. Do not use Vite. Do not display the old product name anywhere; user-facing name is Flash.

Read first:
- CLAUDE.md
- ARCHITECTURE.md
- HACKATHON_MANUAL.md
- plans/p1-ears-and-mouth.md
- plans/p2-retrieval.md
- plans/p3-brain.md
- plans/p4-face.md
- plans/p5-demo-and-story.md
- archangel-ai/
- archangel-ai-diagram-editor/

Use the Archangel folders only as React Flow references: custom nodes, session log, command processor, import/export ideas.

Build /m/[meetingId]:
- Full-screen light-mode dotted React Flow canvas.
- Card-like workflow nodes inspired by the provided screenshot.
- Color-highlight each node type.
- Add Background, Controls, MiniMap, fit view, export JSON, and selected-node JSON panel.
- Poll GET /api/canvas/[meetingId] every 1000ms.
- Add a demo button that creates a realistic meeting graph.

Flash behavior:
- Passive utterances, chat messages, documents, links, and images only create memory/context nodes.
- They must not trigger Flash answers.
- Flash answers only happen from manual_prompt events, UI prompt, wake request forwarded by P1, or /commands.
- Manual prompt creates a question node, calls P3 /agent, then creates flash_answer and optional diagram nodes.

Event ingestion:
- utterance -> speaker + utterance + said edge
- chat -> chat_context + shared/mentions edges
- document/link/image -> context node + source edges
- agent_response answer -> flash_answer + cites edges
- agent_response diagram -> flash_answer + diagram + generated/cites edges
- finalize result -> summary, decision, action_item nodes
- summary trigger -> summary node linked with summarizes edges

P2 must ingest the entire canvas:
- Implement POST /api/canvas/[meetingId]/sync-memory in P4.
- Serialize the current React Flow graph into raw graph JSON, plain text content for RAG, and metadata with canvasVersion.
- Send it to P2 via POST {CONTEXT_SERVICE_URL}/sources with item type "canvas".
- Update P2 /sources to accept type "canvas".
- Store raw canvas JSON in P2 source metadata.
- Chunk/index the text content with Superlinked.
- Return matching chunks from /retrieve with source "canvas".

Summarize:
POST /api/canvas/[meetingId]/summarize should gather:
1. current graph nodes/edges,
2. P2 /transcript if configured,
3. P2 /retrieve chunks for "meeting summary decisions action items" if configured,
then call P3 /finalize if available or a local mock fallback, and create/update a summary node with citations.

Query:
POST /api/canvas/[meetingId]/query should call P2 /retrieve, return chunks, and optionally create memory_chunk/source nodes linked to the question node.

Commands:
POST /commands must support add_node, update_node, delete_node, move_node, add_edge, delete_edge, query, summarize.
add_node payload must include nodeType from CanvasNodeType.

Acceptance:
- npm run dev starts the Next app.
- /m/demo shows the light canvas.
- Normal transcript/chat ingestion creates graph memory only.
- Manual prompt creates question + flash_answer nodes.
- Diagram response creates diagram nodes.
- Summarize creates or updates a summary node.
- /sync-memory sends the full canvas to P2 as source type "canvas".
- P2 /retrieve can return canvas chunks with source "canvas".
- All add/delete/move/query/summarize actions work through APIs.
- No secrets are committed.
```

## Test Plan

- `npm run build`
- API smoke tests for node add/update/delete, edge add/delete, event ingest, query, summarize, and sync-memory.
- Browser test on `/m/demo`: demo graph appears, nodes are colored, manual prompt path creates Flash response, passive utterances do not.
- Integration mock test: fake P2 `/transcript`, `/retrieve`, `/sources`; fake P3 `/events`, `/agent`, `/finalize`.
- Confirm P2 accepts `type: "canvas"` and returns canvas chunks from `/retrieve`.

## Assumptions

- If `next@16.2.6` cannot be installed, stop and report instead of using another version.
- WebSockets are skipped; 1s polling is enough for the hackathon.
- P4's in-memory graph is demo state; P2 is the real durable memory/RAG store for transcript, prep docs, and canvas snapshots.
