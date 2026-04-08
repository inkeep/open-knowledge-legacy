import { loader } from 'fumadocs-core/source';
import * as luIcons from 'lucide-react';
import { createElement, type FC } from 'react';
import { docs } from '../../.source/server';

export const source = loader({
  baseUrl: '/',
  source: docs.toFumadocsSource(),
  icon(iconName) {
    if (!iconName) return;

    if (iconName.startsWith('Lu')) {
      const icon = (luIcons as unknown as Record<string, FC>)[iconName.slice(2)];
      if (icon) return createElement(icon);
    }

    throw new Error(`Unknown icon "${iconName}"`);
  },
});
