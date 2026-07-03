import { useState } from 'react';

interface FaqItem {
  q: string;
  a: string;
}

const gettingStarted: FaqItem[] = [
  {
    q: 'Sci AI Studio 是什么？',
    a: 'Sci AI Studio 是一个帮助科研团队策划影像方案的工具。上传你的论文、实验资料或项目描述，四个 AI 角色会依次帮你分析现状、对标案例、制定视觉策略、生成拍摄计划。',
  },
  {
    q: '我该怎么开始？',
    a: '注册登录后，点击「新建项目」创建一个项目。填写项目名称和基本信息，然后进入工作流。第一步是上传资料（PDF、Word、图片、文字或网页链接），AI 会解析并摘要。确认资料后，AI 会自动推进后续步骤。',
  },
  {
    q: '项目和工作流是什么关系？',
    a: '每个项目对应一个真实的科研课题。项目内有一条固定的工作流（画布上的步骤链），从左到右依次推进：上传资料 → 视觉诊断 → 目标选择 → 案例对标 → 策展策略 → 拍摄方案 → 参考图 → 最终方案。',
  },
  {
    q: '我的数据安全吗？',
    a: '你上传的文件、解析结果和项目内容只有你自己的账号可见。其他用户、管理员都无法查看你的资料原文。',
  },
];

const workflowFaq: FaqItem[] = [
  {
    q: '刷新页面后进度会丢失吗？',
    a: '不会。项目进度、AI 产物和资料状态都会自动保存到服务器。刷新页面或重新登录后，你会直接回到上次离开的位置。',
  },
  {
    q: 'AI 分析到一半卡住了怎么办？',
    a: 'AI 任务在后台执行，不会卡住浏览器。你可以在右侧面板看到当前步骤的状态。如果出现错误，系统会自动重试（最多 3 次），你也可以手动点击重试。',
  },
  {
    q: '我可以修改 AI 生成的内容吗？',
    a: '可以。点击任意节点的编辑按钮，输入修改意见后重新生成，AI 会根据你的意见调整结果。每一步生成的内容都可以反复修改。',
  },
  {
    q: '为什么有些步骤显示「等待确认」？',
    a: '部分步骤（如资料确认、目标选择）需要人工确认。确认后 AI 才会继续下一步。这是为了保证关键决策由你来定、AI 来辅助。',
  },
];

const errorFaq: FaqItem[] = [
  {
    q: '提示「今天的 AI 使用额度已用完」',
    a: '每位用户每天有 AI 调用次数上限。额度在每天 00:00 自动重置。如果你在使用中遇到额度不足，可以等到次日继续，或联系管理员申请临时提额。',
  },
  {
    q: 'PDF 或 Word 上传后一直显示解析中',
    a: '大型文档解析需要一些时间。如果超过 2 分钟仍未完成，可能文件格式不支持或文件已损坏。可以尝试将内容复制为文字后直接粘贴上传。',
  },
  {
    q: '图片上传后 OCR 识别失败',
    a: 'OCR 识别依赖图片质量。请确保图片清晰、文字方向正确、没有严重倾斜或遮挡。如果 OCR 仍失败，可以手动在资料描述中补充文字内容。',
  },
  {
    q: '网页链接抓取失败',
    a: '目前仅支持抓取公开网页。需要登录才能访问的页面、PDF 链接、内网地址和部分动态加载的页面可能无法抓取。可以复制网页文字后通过「粘贴文字」上传。',
  },
  {
    q: 'AI 处理超时（MODEL_TIMEOUT）',
    a: 'AI 模型处理超时，通常因为输入内容过多或当前服务繁忙。系统会自动重试。如果多次超时，可以尝试减少同时上传的资料数量，或拆分过长文本后重试。',
  },
  {
    q: 'AI 服务暂时不可用（MODEL_UNAVAILABLE）',
    a: '上游 AI 服务可能出现短暂故障。系统会自动重试，通常在 1-2 分钟内恢复。如果长时间未恢复，可以联系管理员。',
  },
  {
    q: 'AI 服务繁忙（MODEL_RATE_LIMITED）',
    a: 'AI 模型当前请求过多，系统会自动排队重试。请耐心等待，通常几秒到几十秒内会恢复。',
  },
  {
    q: '导出 PDF/Word 失败',
    a: 'PDF/Word 导出功能正在开发中，暂未开放。当前阶段你可以通过网页预览查看方案内容。',
  },
];

const feedbackFaq: FaqItem[] = [
  {
    q: '如何提交反馈或报 Bug？',
    a: '点击页面右下角的「?」按钮，选择反馈类型（遇到问题 / 功能建议 / 结果不准 / 其他），填写描述后提交。系统会自动附带当前页面、项目 ID 和节点信息，方便我们定位问题。',
  },
  {
    q: '反馈会包含我的资料内容吗？',
    a: '不会。反馈只自动附带页面地址、项目编号和当前步骤编号。不会自动发送你上传的文件内容或项目资料。',
  },
];

interface FaqSectionProps {
  title: string;
  items: FaqItem[];
  defaultOpen?: boolean;
}

function FaqSection({ title, items, defaultOpen }: FaqSectionProps) {
  const [expanded, setExpanded] = useState(defaultOpen ?? false);

  return (
    <section className="faq-section">
      <button
        type="button"
        className="faq-section-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <h3>{title}</h3>
        <span className={`faq-chevron${expanded ? ' is-open' : ''}`} aria-hidden="true" />
      </button>
      {expanded && (
        <div className="faq-section-body">
          {items.map((item, idx) => (
            <details key={idx} className="faq-item" open={idx === 0}>
              <summary className="faq-item-q">{item.q}</summary>
              <div className="faq-item-a">
                <p>{item.a}</p>
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

export function Help() {
  return (
    <div className="help-shell">
      <div className="help-header">
        <a href="/" className="help-back">&larr; 返回项目列表</a>
        <h1>帮助中心</h1>
      </div>
      <main className="help-body">
        <div className="help-intro">
          <h2>欢迎使用 Sci AI Studio</h2>
          <p>
            Sci AI Studio 是科研影像智能策划工具。上传你的研究资料，四个 AI 角色
            会依次帮你分析视觉现状、对标优秀案例、制定视觉策略并生成详细的拍摄方案。
          </p>
        </div>

        <FaqSection title="快速入门" items={gettingStarted} defaultOpen />
        <FaqSection title="工作流使用" items={workflowFaq} />
        <FaqSection title="常见错误" items={errorFaq} defaultOpen />
        <FaqSection title="反馈与支持" items={feedbackFaq} />
      </main>
    </div>
  );
}
