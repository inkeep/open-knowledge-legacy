# Connection examples

The same client connection snippet works in both Node and the browser. We intentionally repeat the snippet so each runtime section is copy-paste self-contained without scrolling.

## Node

```ts
import { createClient } from './client.ts';
const c = createClient({ url: process.env.URL });
await c.connect();
```

## Browser

```ts
import { createClient } from './client.ts';
const c = createClient({ url: process.env.URL });
await c.connect();
```

## Edge runtime

```ts
import { createClient } from './client.ts';
const c = createClient({ url: process.env.URL });
await c.connect();
```

## Notes

The client config is identical across runtimes; only transport selection differs internally.
