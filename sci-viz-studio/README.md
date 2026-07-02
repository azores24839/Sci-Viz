# Sci AI Studio

科研静图拍摄策划工作台。当前阶段提供版本化固定流程、React Flow 节点画布、四个 Agent 插槽、长兴海洋实验室演示数据和案例参考图；后端可通过 DeepSeek 生成阶段草案。

资料输入现支持 PDF、DOCX、PNG/JPG、粘贴文字和公开网页。文档与网页在服务端提取正文，图片及扫描 PDF 使用 Qwen OCR，并保留原文、OCR、图片描述和 AI 摘要。每个浏览器测试会话使用独立项目资料池。

## 启动

```bash
nvm use
npm install
npm run dev
```

- Web：`http://127.0.0.1:5178`
- API：`http://127.0.0.1:3011/api/v1/health`

## Agent 头像

放入 `apps/web/public/agents/`：

- `research-analyst.png`：资料分析师
- `science-reviewer.png`：科研审校员
- `visual-planner.png`：科研策展人
- `photography-director.png`：摄影策划师

建议正方形 PNG/WebP、至少 512×512、单张不超过 1 MB。缺失时自动显示角色首字。

## Agent 提示词

四个角色文件位于 `packages/ai-workflows/src/prompts/`。每次修改提示词时同步更新 `version`。提示词只定义角色与任务，不保存 API Key。

## DeepSeek

复制 Server 环境变量模板：

```bash
cp apps/server/.env.example apps/server/.env
```

然后只在 `apps/server/.env` 中填写：

```dotenv
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

`.env` 已被 Git 忽略。不要把密钥放进 `apps/web/`、提示词文件或任何以 `VITE_` 开头的变量。

## Qwen OCR 与摘要

本地可在 `apps/server/.env` 配置：

```dotenv
DASHSCOPE_API_KEY=你的百炼密钥
DASHSCOPE_API_URL=https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions
QWEN_VISION_MODEL=qwen3.6-plus
```

可以使用与 Case Hub 相同的 `DASHSCOPE_API_KEY` 值，但不要把 Case Hub 的 `.env` 提交或复制到前端。未配置时，PDF/DOCX/网页/文字仍可完成基础解析，状态显示为“摘要待重试”；图片和扫描 PDF 需要 Qwen 才能完成 OCR。

当前 Case Hub 实际配置是 `OPENROUTER_API_KEY` + Qwen Vision；Studio 同样支持这组环境变量作为回退。若同时配置 DashScope 和 OpenRouter，Studio 优先使用 DashScope。

2026-07-02 冒烟测试中，现有 OpenRouter key 能到达 Qwen 接口，但返回 429（额度或速率受限）。正式邀请测试用户前，需要补充可用额度或配置可用的 DashScope key。

## 阿里云测试部署

生产基线是 ECS + 私有 OSS + PostgreSQL。复制 `deploy/.env.example` 为 `deploy/.env`，填入域名、数据库密码、DashScope 与 OSS 配置后运行：

```bash
docker compose --env-file deploy/.env up -d --build
```

浏览器通过签名 URL 直传 OSS，50 MB 文件不经过 API 服务器。API 与解析队列运行在 ECS；PostgreSQL 保存资料和任务状态。公开测试前仍应在域名入口增加登录或邀请码，当前随机测试项目 ID 只用于隔离浏览器会话，不是正式账号权限系统。

OSS Bucket 必须保持私有，并配置只允许测试域名执行 `PUT`、`GET`、`HEAD` 的 CORS 规则；不要开放公共读权限。ECS 与 OSS 应选择同一区域。当前 `docker-compose.yml` 适合 20 人左右的封闭测试，正式公开上线前还需加入账号认证、限流、病毒扫描、监控告警和自动备份演练。

## 架构边界

- `workflow-core`：稳定节点 ID、模板拓扑和推进规则，不依赖 UI。
- `workflow-canvas`：唯一允许导入 `@xyflow/react` 的功能目录。
- `ai-workflows`：模型无关 Gateway、角色提示词和任务定义。
- `fixtures`：可重复的演示数据。
- `apps/server`：API、密钥和未来的持久任务执行。

画布选择、拖动和缩放不会直接改变业务状态；模板升级必须使用新版本或显式迁移。
