import type { ResearchMode, ResearchTask, SourceDocument } from '@studio/contracts';
import { apiFetch, notifyUsageChanged } from '../../api/client';

export async function readApiPayload<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  throw new Error(payload?.error?.message ?? '请求未完成，请稍后重试。');
}

export async function loadProjectSources(projectId: string) {
  const payload = await readApiPayload<{ success: true; data: SourceDocument[] }>(await apiFetch(`/projects/${projectId}/sources`));
  return payload.data;
}

export async function loadResearchTasks(projectId: string) {
  const payload = await readApiPayload<{ success: true; data: ResearchTask[] }>(await apiFetch(`/projects/${projectId}/research-tasks`));
  return payload.data;
}

export async function createProjectTextSource(projectId: string, text: string, title?: string) {
  await readApiPayload(await apiFetch('/sources/text', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, title, text }),
  }));
  notifyUsageChanged();
}

export async function createProjectWebSource(projectId: string, url: string) {
  await readApiPayload(await apiFetch('/sources/web', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, url }),
  }));
  notifyUsageChanged();
}

export async function startProjectResearch(projectId: string, mode: ResearchMode, query: string) {
  await readApiPayload(await apiFetch('/research-tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, mode, query }),
  }));
  notifyUsageChanged();
}

export async function uploadProjectFile(projectId: string, file: File) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const mimeType = file.type || (extension === 'pdf'
      ? 'application/pdf'
      : extension === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : extension === 'png' ? 'image/png' : 'image/jpeg');
    const init = await readApiPayload<{ success: true; data: { source: SourceDocument; storageMode: 'local' | 'oss'; uploadUrl?: string } }>(await apiFetch('/source-uploads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, fileName: file.name, mimeType, sizeBytes: file.size }),
    }));
    if (init.data.storageMode === 'oss' && init.data.uploadUrl) {
      const uploaded = await fetch(init.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: file });
      if (!uploaded.ok) throw new Error(`“${file.name}”上传失败，请重试。`);
      await readApiPayload(await apiFetch('/source-uploads/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sourceId: init.data.source.id }),
      }));
    } else {
      const form = new FormData();
      form.append('projectId', projectId);
      form.append('sourceId', init.data.source.id);
      form.append('file', file.type ? file : new File([file], file.name, { type: mimeType }));
      await readApiPayload(await apiFetch('/source-uploads/local', { method: 'POST', body: form }));
    }
  notifyUsageChanged();
}

export async function uploadProjectFiles(projectId: string, files: File[]) {
  for (const file of files) await uploadProjectFile(projectId, file);
}
