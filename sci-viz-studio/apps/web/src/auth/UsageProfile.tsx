import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api/client';

type Quota = {
  sources: { used: number; limit: number; remaining: number };
  storage: { usedBytes: number; limitBytes: number; remainingBytes: number };
  ai: { used: number; limit: number; remaining: number; resetsAt: string };
};

type MeResponse = { success: true; data: { userId: string; quota: Quota } };

const percent = (used: number, limit: number) => Math.min(100, limit > 0 ? (used / limit) * 100 : 100);
const tone = (used: number, limit: number) => percent(used, limit) >= 100 ? 'danger' : percent(used, limit) >= 80 ? 'warning' : 'normal';
const mb = (bytes: number) => bytes / (1024 * 1024);
const formatStorage = (bytes: number) => mb(bytes) < 10 ? `${mb(bytes).toFixed(1)} MB` : `${Math.round(mb(bytes))} MB`;

function QuotaRow({ label, used, limit, value }: { label: string; used: number; limit: number; value: string }) {
  const level = tone(used, limit);
  return <div className={`usage-row is-${level}`}>
    <div className="usage-row-copy"><span>{label}</span><strong>{value}</strong></div>
    <div className="usage-meter" aria-label={`${label}，已使用 ${Math.round(percent(used, limit))}%`}><i style={{ width: `${percent(used, limit)}%` }} /></div>
  </div>;
}

export function UsageProfile() {
  const [open, setOpen] = useState(false);
  const [quota, setQuota] = useState<Quota>();
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const response = await apiFetch('/me');
      if (!response.ok) throw new Error('额度暂时无法读取');
      const payload = await response.json() as MeResponse;
      setQuota(payload.data.quota); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '额度暂时无法读取'); }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 30_000);
    const refresh = () => void load();
    window.addEventListener('studio:usage-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('studio:usage-changed', refresh); window.removeEventListener('focus', refresh); };
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);

  const exhausted = quota && (quota.sources.remaining === 0 || quota.storage.remainingBytes === 0 || quota.ai.remaining === 0);
  const low = quota && !exhausted && [percent(quota.sources.used, quota.sources.limit), percent(quota.storage.usedBytes, quota.storage.limitBytes), percent(quota.ai.used, quota.ai.limit)].some((value) => value >= 80);

  return <div className="usage-profile" ref={root}>
    <button className={`usage-profile-trigger${exhausted ? ' is-danger' : low ? ' is-warning' : ''}`} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <span className="usage-profile-mark" aria-hidden="true">余</span>
      <span>{quota ? `AI ${quota.ai.remaining}` : '额度'}</span>
    </button>
    {open && <section className="usage-popover" role="dialog" aria-label="我的额度">
      <div className="usage-popover-head"><div><span>我的额度</span><strong>个人账号</strong></div><small>实时用量</small></div>
      {error && !quota ? <div className="usage-error">{error}<button type="button" onClick={() => void load()}>重试</button></div> : quota && <>
        <div className="usage-ledger">
          <QuotaRow label="资料" used={quota.sources.used} limit={quota.sources.limit} value={`${quota.sources.used} / ${quota.sources.limit}`} />
          <QuotaRow label="存储" used={quota.storage.usedBytes} limit={quota.storage.limitBytes} value={`${formatStorage(quota.storage.usedBytes)} / ${formatStorage(quota.storage.limitBytes)}`} />
          <QuotaRow label="AI 任务·今日" used={quota.ai.used} limit={quota.ai.limit} value={`${quota.ai.used} / ${quota.ai.limit}`} />
        </div>
        <div className={`usage-message${exhausted ? ' is-danger' : low ? ' is-warning' : ''}`}>
          {exhausted ? '有一项额度已用完，不是系统故障。AI 额度将在次日恢复。' : low ? '有一项额度已超过 80%，建议留意剩余用量。' : `还可添加 ${quota.sources.remaining} 份资料，今日还可运行 ${quota.ai.remaining} 次 AI。`}
        </div>
      </>}
    </section>}
  </div>;
}
