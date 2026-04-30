# Connection examples

The same client connection snippet works in both Node and the browser.

## Node

```ts
import { createClient } from './client.ts';
const c = createClient({ url: process.env.URL });
await c.connect();
```
