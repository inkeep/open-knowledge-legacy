import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const PERSONAL_TEMPLATES: Readonly<Record<string, string>> = {
  'daily-journal': `---
title: '{{date}}'
description: Daily journal entry. Universal template, works in any vault.
date: '{{date}}'
author: '{{user}}'
mood:
weather:
top3: []
gratitude: []
links: []
tags: [daily, journal]
---

## Morning intentions

(What's the one thing today is for? Top 3 below in frontmatter.)

## Throughout the day

(Capture as you go. Use [[wiki-links]] for anything worth its own page.)

## Evening reflection

- What shipped:
- What stalled:
- Gratitude (also in frontmatter for sweeps):
`,
  'meeting-notes': `---
title: 'Meeting: <topic>'
description: One file per meeting. Update title with the actual topic after instantiation.
date: '{{date}}'
author: '{{user}}'
attendees: []
agenda: []
decisions: []
action_items: []
tags: [meeting]
---

## Agenda

(Pre-meeting bullet list of topics to cover.)

## Discussion

(Notes during the meeting. Capture as you go.)

## Decisions

(Concrete decisions made. Also in frontmatter for sweeps.)

## Action items

(Concrete TODOs with owners. Also in frontmatter for sweeps.)
`,
  'weekly-review': `---
title: 'Week of {{date}}'
description: Friday sweep. What shipped, what stalled, what's next.
week_of: '{{date}}'
author: '{{user}}'
shipped: []
stalled: []
next_week: []
tags: [weekly-review]
---

## What shipped

(Concrete deliverables that landed this week. Be specific.)

## What stalled

(What didn't move? Why? What's the unblock?)

## Lessons

(One or two takeaways worth remembering.)

## Next week

(Top priorities. Frontmatter mirror for sweeps.)
`,
  'reading-log-entry': `---
title: <Source title>
description: Per-book/article/podcast reading log entry.
author:
status: queued
rating:
started:
finished:
source_type: book
tags: [reading]
---

## One-paragraph summary

(What is this source about? Spoiler-friendly.)

## Highlights

(Direct quotes worth pulling out, with location/page if applicable.)

## My notes

(What I learned. Where I disagreed. What it changed.)

## Connections

(Other reading this links to. Use \`[[wiki-links]]\` to other entries.)
`,
  'gym-log': `---
title: '{{date}}: <workout type>'
description: Per-workout log entry.
date: '{{date}}'
author: '{{user}}'
workout_type:
duration_min:
lifts: []
notes:
tags: [gym, workout]
---

## Lifts

(One bullet per lift: name, weight × reps × sets. Mirror in frontmatter for sweeps.)

## Notes

(How it felt. What hurt. What to push next time.)
`,
  recipe: `---
title: <Recipe name>
description: One-line description of the dish.
cuisine:
prep_min:
cook_min:
servings:
ingredients: []
steps: []
source:
tags: [recipe]
---

## Ingredients

(Bulleted list; mirror in frontmatter for sweeps.)

## Steps

(Numbered list; mirror in frontmatter for sweeps.)

## Notes

(Substitutions, what worked, what didn't.)
`,
  'travel-trip': `---
title: <Destination> trip
description: One-line summary of the trip.
destination:
dates:
bookings: []
packing: []
itinerary: []
tags: [travel]
---

## Itinerary

(Day-by-day plan. Mirror in frontmatter for sweeps.)

## Bookings

(Flights, hotels, reservations, with confirmation numbers.)

## Packing

(What's coming with. Mirror in frontmatter so it's checkable on the day.)

## Notes

(What to remember, what to do, what to avoid.)
`,
};

export const PERSONAL_TEMPLATE_NAMES: readonly string[] = Object.keys(PERSONAL_TEMPLATES);

function userTemplatesDir(): string {
  const home =
    process.env.NODE_ENV === 'test' && process.env.OK_USER_HOME
      ? process.env.OK_USER_HOME
      : homedir();
  return join(home, '.ok', 'templates');
}

export interface PersonalTemplatePlan {
  willWrite: string[];
  willSkip: string[];
}

export function planPersonalTemplates(): PersonalTemplatePlan {
  const dir = userTemplatesDir();
  const willWrite: string[] = [];
  const willSkip: string[] = [];
  for (const name of PERSONAL_TEMPLATE_NAMES) {
    const path = join(dir, `${name}.md`);
    if (existsSync(path)) {
      willSkip.push(path);
    } else {
      willWrite.push(path);
    }
  }
  return { willWrite, willSkip };
}

export interface PersonalTemplateWriteResult {
  written: string[];
  skipped: string[];
  errors: Array<{ path: string; error: string }>;
}

export function writePersonalTemplates(): PersonalTemplateWriteResult {
  const dir = userTemplatesDir();
  const written: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ path: string; error: string }> = [];

  try {
    mkdirSync(dir, { recursive: true });
  } catch (err) {
    errors.push({
      path: dir,
      error: err instanceof Error ? err.message : String(err),
    });
    return { written, skipped, errors };
  }

  for (const name of PERSONAL_TEMPLATE_NAMES) {
    const path = join(dir, `${name}.md`);
    if (existsSync(path)) {
      skipped.push(path);
      continue;
    }
    const body = PERSONAL_TEMPLATES[name];
    if (body === undefined) {
      errors.push({ path, error: `Missing body for template "${name}"` });
      continue;
    }
    try {
      writeFileSync(path, body, 'utf-8');
      written.push(path);
    } catch (err) {
      errors.push({
        path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { written, skipped, errors };
}
