export const MAX_PENDING_FILES = 20;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
const allowedExtensions = new Set(['pdf', 'docx', 'png', 'jpg', 'jpeg']);

export function fileIdentity(file: File) {
  return `${file.name.toLowerCase()}:${file.size}:${file.lastModified}`;
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function validateAndMergeFiles(current: File[], incoming: File[]) {
  const accepted: File[] = [];
  const errors: string[] = [];
  const identities = new Set(current.map(fileIdentity));
  for (const file of incoming) {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!allowedExtensions.has(extension)) { errors.push(`“${file.name}”的格式不支持`); continue; }
    if (file.size > MAX_FILE_BYTES) { errors.push(`“${file.name}”超过 50 MB`); continue; }
    const identity = fileIdentity(file);
    if (identities.has(identity)) { errors.push(`“${file.name}”已经添加`); continue; }
    if (current.length + accepted.length >= MAX_PENDING_FILES) { errors.push(`一次最多添加 ${MAX_PENDING_FILES} 个文件`); break; }
    identities.add(identity); accepted.push(file);
  }
  return { files: [...current, ...accepted], errors };
}
