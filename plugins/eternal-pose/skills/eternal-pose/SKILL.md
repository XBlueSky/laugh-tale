---
name: eternal-pose
description: "把這份行程做成網站、建立手機旅行地圖、更新我的旅行網站、重新設計行程 type UI、檢查 map-first 與拖曳清單； build a map-first trip site, turn this itinerary or CSV into a travel website, or audit or restyle my generated trip site."
---

# Eternal Pose

Inspect the repository and the supplied trip material before changing anything. Infer whether the request is Create, Update, Restyle, or read-only Audit; ask only about ambiguities that would materially change the result.

Read the approved project specification before shaping a generated site. Preserve the map-first and mobile-first invariants: use a real map rather than a fake substitute, keep map and list selection synchronized, represent ordinary movement as route edges, and protect the draggable mobile sheet's accessibility and reduced-motion behavior.

Accept prose, CSV, Markdown, documents, links, and conversation without demanding a user-authored schema. Do not invent coordinates, provider IDs, reservations, opening hours, or precise transit facts. Keep user customizations intact during scoped updates.

Default to local and private work. Never create a remote, push, publish, or deploy without the user's explicit permission.
