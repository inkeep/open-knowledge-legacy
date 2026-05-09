import { TemplatesManagerSection } from './TemplatesManagerSection';

export function UserTemplatesSection() {
  return (
    <TemplatesManagerSection
      config={{
        scope: 'user',
        target: 'user',
        title: 'User templates',
        description: (
          <>
            Stored at <code className="font-mono">~/.ok/templates/</code>. Available in every OK
            project you open with this user account.
          </>
        ),
        emptyMessage:
          'No user templates yet. Create one to make it available in every OK project you open with this user account.',
        deleteWarning:
          'This permanently removes the template from ~/.ok/templates/. It will no longer appear in any of your OK projects.',
        itemNoun: 'user template',
        badge: { label: 'user', variant: 'primary' },
        settingsId: 'settings-user-templates-title',
        testIdPrefix: 'user-templates',
      }}
    />
  );
}
