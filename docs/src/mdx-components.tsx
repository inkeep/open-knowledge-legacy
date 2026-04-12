import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Card, Cards } from 'fumadocs-ui/components/card';
import { ImageZoom } from 'fumadocs-ui/components/image-zoom';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import { TypeTable } from 'fumadocs-ui/components/type-table';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Mermaid } from '@/components/mermaid';

export function getMDXComponents(): MDXComponents {
  return {
    ...defaultMdxComponents,
    Accordion,
    Accordions,
    Card,
    Cards,
    Image: ImageZoom,
    Mermaid,
    Step,
    Steps,
    Tab,
    Tabs,
    TypeTable,
  };
}
