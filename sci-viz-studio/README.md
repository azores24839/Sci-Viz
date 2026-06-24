# 科研影像 AI Studio

科研摄影多智能体工作台。当前阶段提供版本化固定流程、React Flow 节点画布、四个 Agent 插槽和长兴海洋实验室 Mock 数据；默认不会调用真实模型。

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

- `research-analyst.png`
- `science-reviewer.png`
- `visual-planner.png`
- `photography-director.png`

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

`.env` 已被 Git 忽略。不要把密钥放进 `apps/web/`、提示词文件或任何以 `VITE_` 开头的变量。当前 MVP 的 `DeepSeekGateway` 默认关闭真实请求，待提示词和输出 Schema 完成后再启用。

## 架构边界

- `workflow-core`：稳定节点 ID、模板拓扑和推进规则，不依赖 UI。
- `workflow-canvas`：唯一允许导入 `@xyflow/react` 的功能目录。
- `ai-workflows`：模型无关 Gateway、角色提示词和任务定义。
- `fixtures`：可重复的演示数据。
- `apps/server`：API、密钥和未来的持久任务执行。

画布选择、拖动和缩放不会直接改变业务状态；模板升级必须使用新版本或显式迁移。
