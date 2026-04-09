/**
 * Runtime React component lookup — maps component name to React implementation.
 * Browser-only. Never imported by packages/server.
 */

import { CodeGroup, Frame, Video } from '@inkeep/docskit/mdx';
import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Banner } from 'fumadocs-ui/components/banner';
import { Callout } from 'fumadocs-ui/components/callout';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { File, Files, Folder } from 'fumadocs-ui/components/files';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import { InlineTOC } from 'fumadocs-ui/components/inline-toc';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import type { ComponentType } from 'react';
import { Audio } from '@/components/ui/audio';
import { Mermaid } from '@/components/ui/mermaid';

// biome-ignore lint/suspicious/noExplicitAny: React components have heterogeneous prop types
export const componentMap: Record<string, ComponentType<any>> = {
  Callout,
  Tabs,
  Tab,
  Card,
  Cards,
  Steps,
  Step,
  Accordion,
  Accordions,
  ImageZoom,
  Files,
  File,
  Folder,
  TypeTable,
  Banner,
  InlineTOC,
  Video,
  Frame,
  CodeGroup,
  Mermaid,
  Audio,
};
