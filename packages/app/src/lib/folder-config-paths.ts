export function frontmatterYamlPath(folderPath: string): string {
  return folderPath === '' ? '.ok/frontmatter.yml' : `${folderPath}/.ok/frontmatter.yml`;
}

export function templateFilePath(folderPath: string, name: string): string {
  return folderPath === '' ? `.ok/templates/${name}.md` : `${folderPath}/.ok/templates/${name}.md`;
}

export function templatesDirPath(folderPath: string): string {
  return folderPath === '' ? '.ok/templates/' : `${folderPath}/.ok/templates/`;
}
