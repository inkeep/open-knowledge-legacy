import { TemplatesManagerSection } from './TemplatesManagerSection';

export function ProjectTemplatesSection() {
  return (
    <TemplatesManagerSection
      config={{
        scope: 'local',
        target: 'project',
        title: 'Project templates',
        description: (
          <>
            Stored at <code className="font-mono">.ok/templates/</code> in this project. Available
            in every folder (folder-scoped templates can override by filename).
          </>
        ),
        emptyMessage:
          "No project templates yet. Create one to make it available everywhere in this project. Folder-scoped templates live on each folder's overview page.",
        deleteWarning:
          "This permanently removes the template from this project's .ok/templates/ directory. Agents and folders that reference it by name will fail until it's recreated.",
        itemNoun: 'project template',
        badge: { label: 'project', variant: 'gray' },
        settingsId: 'settings-project-templates-title',
        testIdPrefix: 'project-templates',
      }}
    />
  );
}
