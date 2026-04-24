import { redirect } from 'next/navigation';

export default function DocsIndex(_props: PageProps<'/docs'>) {
  redirect('/docs/overview');
}
