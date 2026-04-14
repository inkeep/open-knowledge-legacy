# MCP Elicitation spec (2025-06-18)

Source: https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation

Elicitation is a server-initiated request for structured user input, flowing as
`elicitation/create` from server to client. The schema is restricted to flat
objects of primitives (string / number / boolean / enum) with supported string
formats `email | uri | date | date-time`. The response is one of
`accept | decline | cancel`.

Three constraints relevant to auto-opening a URL:

1. There is no `action: "open_url"` primitive. The only shape is a JSON-schema
   form rendered as a dialog.
2. `format: "uri"` is an *input* hint (user is being asked to type a URL), not
   an instruction for the client to navigate.
3. The spec explicitly forbids using elicitation for sensitive data and requires
   the client to make it obvious *which server* is asking.

Implication for our question: elicitation is the wrong primitive for "open this
URL." The right use would be asking the user up-front, "Open the editor at
http://localhost:5173? [Yes] [No] [Don't ask again]" — a consent gate, not a
navigation channel.

## Other client capabilities in the same spec

- `sampling` — server requests an LLM completion via the client. No URL side
  effects.
- `roots` — client advertises filesystem roots to the server.
- `elicitation` — as above.

None is an "open URL on the user's machine" primitive. The core MCP spec
(2025-06-18) has no such primitive.
