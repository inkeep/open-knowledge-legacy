import { loader } from 'fumadocs-core/source';
import { icons } from 'lucide-react';
import { createElement } from 'react';
import { docs } from '../../.source/server';

export const source = loader({
  baseUrl: '/',
  source: docs.toFumadocsSource(),
  icon(iconName) {
    if (!iconName) return;

    if (iconName.startsWith('Lu')) {
      const key = iconName.slice(2) as keyof typeof icons;
      const Icon = icons[key];
      if (Icon) return createElement(Icon);
    }

    throw new Error(`Unknown icon "${iconName}"`);
  },
});
