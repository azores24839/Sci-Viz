# 子路径部署与 Sci AI Studio 镜像发布设计

## 目标

在同一域名下按路径部署两个应用：

- Sci AI Studio：`/studio`
- Sci Viz Case Hub：`/sciviz`

两个项目都支持可配置 BASE URL，本地开发默认仍在 `/` 运行。Sci AI Studio 增加 GitHub Actions，构建并发布单个应用镜像到 GitHub Container Registry。

## 子路径模型

采用构建期 BASE URL。Vite `base`、React Router `basename`、API 请求、静态资源和应用内导航共用规范化后的路径值。路径对外表示为无末尾斜杠的 `/studio` 或 `/sciviz`，传给 Vite 时规范化为带末尾斜杠的形式。

生产构建值：

| 项目 | 构建参数 | 默认生产值 |
| --- | --- | --- |
| Sci AI Studio | `VITE_BASE_URL` | `/studio/` |
| Sci Viz Case Hub | `VITE_BASE_URL` | `/sciviz/` |

API 在浏览器中分别访问 `/studio/api/v1/*` 和 `/sciviz/api/*`。容器内部的 Node 服务仍保留现有 `/api` 路由，由容器入口或外层反向代理剔除应用前缀。

## Sci Viz Case Hub

保持现有 Web 与 Server 合并镜像结构。调整：

- Vite 构建资源前缀。
- `BrowserRouter` 的 `basename`。
- API 客户端、登录请求、上传资源和期刊封面 URL。
- Server 的 SPA fallback 能从 `/sciviz/*` 返回正确的 `index.html`。
- Docker 构建通过 `VITE_BASE_URL` 参数生成子路径版本。

现有 GHCR 镜像名和 GitHub Actions 部署流程保持不变，仅增加构建参数和子路径验证。

## Sci AI Studio

将 Web 和 Server 合并到 `ghcr.io/azores24839/sci-ai-studio` 应用镜像。PostgreSQL 仍使用独立的 `postgres:17-alpine` 容器和持久卷。

应用镜像包含：

- 编译后的 Node Server。
- 以 `/studio/` 为 Vite base 构建的 Web 静态文件。
- Nginx，用于提供 SPA，并将 `/studio/api/*` 转发到同容器的 Node Server。
- 进程入口，同时启动 Node Server 和 Nginx，并正确传递退出信号。

单容器对外只暴露 HTTP 端口。Node Server 仅在容器内接受请求。

## GitHub Actions

新增独立的 Studio workflow，避免 Case Hub 变更触发 Studio 构建，反之亦然。

触发条件：

- `main` 分支上 `sci-viz-studio/**` 或 workflow 本身变更。
- 手动 `workflow_dispatch`。

发布标签：

- `latest`
- Git 短 SHA

流程使用 GitHub Actions cache 加速 Buildx 构建。当 Studio 的 SSH 仓库变量和密钥已配置时，复用 Case Hub 的模式上传 Compose 文件、拉取镜像并滚动重启；未配置时只构建和推送镜像。

## Docker Compose 示例

提供可直接改造的生产示例，包含：

- `sci-ai-studio` 应用镜像。
- `postgres:17-alpine`。
- Studio 数据库持久卷。
- 环境变量文件、健康检查、重启策略和资源上限。
- 仅绑定到 `127.0.0.1`，供宿主机的公共 Nginx/Caddy 转发。

同时在部署文档中给出外层 Nginx 示例：

- `/studio/` 转发到 Studio 容器。
- `/sciviz/` 转发到 Case Hub 容器。
- `/studio` 和 `/sciviz` 重定向到带末尾斜杠的 URL。
- 保留 Host、客户端 IP 和 HTTPS scheme 请求头。

## 验证

- 两个 Web 项目在默认 `/` 下仍可构建和测试。
- 使用生产 BASE URL 构建后，`index.html` 资源路径带正确前缀。
- 直接访问 `/studio/projects/...` 和 `/sciviz/cases/...` 可返回 SPA，刷新不会 404。
- 两个应用的 API、登录、上传和静态媒体链接不会跳回域名根路径。
- Studio 单镜像可启动，并能通过容器健康检查。
- GitHub Actions YAML 和 Docker Compose 配置通过静态校验。

## 范围边界

- 不将 PostgreSQL 打入 Studio 应用镜像。
- 不改变现有认证、数据模型或业务 API。
- 不在仓库中写入生产密钥或域名。
- 不要求同一个镜像在运行时动态切换 BASE URL；更换路径时重新构建镜像。
