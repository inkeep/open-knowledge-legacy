import { redirect } from 'next/navigation';

export default function DocsIndex(_props: PageProps<'/docs'>) {
  redirect('/docs/get-started/overview');
}
