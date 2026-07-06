import type { FastifyInstance } from 'fastify';
import {
  InterpretProjectIntakeRequestSchema,
  ProjectIntakeInterpretationSchema,
  type ProjectGoal,
  type ProjectIntakeInterpretation,
} from '@studio/contracts';
import { DeepSeekGateway, readDeepSeekConfig } from '@studio/ai-workflows';

const URL_PATTERN = /https?:\/\/[^\s<>()\[\]{}"']+/gi;

function uniqueUrls(input: string) {
  return [...new Set((input.match(URL_PATTERN) ?? []).map((url) => url.replace(/[.,;!?，。；！？]+$/, '')))];
}

function queryWithUrls(query: string, urls: string[]) {
  const urlContext = urls.map((url) => {
    try { const parsed = new URL(url); return `${parsed.hostname}${parsed.pathname}`; }
    catch { return url; }
  }).join('；');
  const suffix = urlContext ? `用户提供的公开网页：${urlContext}`.slice(0, 420) : '';
  if (!suffix) return query.slice(0, 1000);
  return `${query.slice(0, Math.max(2, 999 - suffix.length))}；${suffix}`;
}

function inferredGoals(input: string): { primaryGoal?: ProjectGoal; secondaryGoal?: ProjectGoal; evidence: string } {
  const matches: Array<{ goal: ProjectGoal; pattern: RegExp }> = [
    { goal: 'INDUSTRY_COLLABORATION', pattern: /产业|合作方|客户|转化|融资|商业化/ },
    { goal: 'PUBLIC_COMMUNICATION', pattern: /公众|科普|媒体|传播|大众|社会/ },
    { goal: 'ACADEMIC_COMMUNICATION', pattern: /学术|论文|期刊|会议|同行|评审/ },
    { goal: 'RECRUITING_BRAND', pattern: /招生|招聘|团队品牌|人才|实验室形象/ },
  ];
  const found = matches.filter((item) => item.pattern.test(input)).map((item) => item.goal);
  return { ...(found[0] ? { primaryGoal: found[0] } : {}), ...(found[1] ? { secondaryGoal: found[1] } : {}), evidence: found.length ? input.slice(0, 300) : '' };
}

export function fallbackProjectIntake(input: string, fileNames: string[]): ProjectIntakeInterpretation {
  const urls = uniqueUrls(input);
  const prose = input.replace(URL_PATTERN, ' ').replace(/\s+/g, ' ').trim();
  const fileTitle = fileNames[0]?.replace(/\.[^.]+$/, '') ?? '';
  let title = (prose.split(/[。！？!?\n]/)[0] || fileTitle || (urls[0] ? new URL(urls[0]).hostname : '新科研影像项目')).trim();
  title = title.replace(/^(?:请|帮我|我们正在|我们在|我想)​?/, '').slice(0, 40) || '新科研影像项目';
  const goals = inferredGoals(input);
  const subject = prose || fileTitle || urls.map((url) => new URL(url).hostname).join(' ');
  return ProjectIntakeInterpretationSchema.parse({
    title,
    brief: input,
    userNeeds: /(?:希望|需要|怎么|如何|帮我)/.test(input) ? [prose.slice(0, 500)] : [],
    researchDirection: '', possibleAudience: '',
    ...goals,
    goalEvidence: goals.evidence,
    constraints: [], urls,
    searchQuery: queryWithUrls(`${subject.slice(0, 520)}；科研影像拍摄策略；研究对象、设备结构、实验过程、应用场景、尺度参照、安全与保密限制、同类案例`, urls),
    uncertainties: [], usedAi: false,
  });
}

function parseModelJson(raw: string) {
  const normalized = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(normalized) as unknown;
}

export async function registerProjectIntakeRoutes(app: FastifyInstance, env: NodeJS.ProcessEnv, consumeUsage: (userId: string) => Promise<void>) {
  app.post('/api/v1/project-intake/interpret', async (request, reply) => {
    const parsed = InterpretProjectIntakeRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ success: false, error: { code: 'INVALID_PROJECT_INTAKE', message: '请输入项目信息。' } });
    const fallback = fallbackProjectIntake(parsed.data.input, parsed.data.fileNames);
    if ((env.AI_PROVIDER ?? 'mock') !== 'deepseek') return { success: true, data: fallback };
    try {
      await consumeUsage(request.authUserId);
      const gateway = new DeepSeekGateway(readDeepSeekConfig(env));
      const raw = await gateway.generateText({
        systemPrompt: [
          '你是 Sci AI Studio 的项目启动分析器。从用户原文中提取信息，不得编造。',
          '只输出 JSON，字段：title, brief, userNeeds, researchDirection, possibleAudience, primaryGoal, secondaryGoal, goalEvidence, constraints, urls, searchQuery, uncertainties。',
          'primaryGoal/secondaryGoal 只能是 ACADEMIC_COMMUNICATION, PUBLIC_COMMUNICATION, RECRUITING_BRAND, INDUSTRY_COLLABORATION，没有明确依据时省略。',
          '标题 8–24 个汉字为宜，使用中性科研表达。searchQuery 要综合研究对象、用户需求以及科研影像所需的设备结构、实验过程、应用场景、尺度、安全保密和同类案例。',
        ].join('\n'),
        userPrompt: `用户输入：\n${parsed.data.input}\n\n附件名：${parsed.data.fileNames.join('、') || '无'}`,
        context: { projectId: 'project-intake', promptVersion: 'project-intake-v1' },
      });
      const model = parseModelJson(raw) as Record<string, unknown>;
      const urls = uniqueUrls(parsed.data.input);
      const modelQuery = typeof model.searchQuery === 'string' ? model.searchQuery : fallback.searchQuery;
      const data = ProjectIntakeInterpretationSchema.parse({ ...fallback, ...model, urls, searchQuery: queryWithUrls(modelQuery, urls), brief: parsed.data.input, usedAi: true });
      return { success: true, data };
    } catch (error) {
      request.log.warn({ error }, 'Project intake AI interpretation failed; using safe fallback');
      return { success: true, data: fallback };
    }
  });
}
