# Case Hub CI/CD 设置

Case Hub 使用与 `azores24839/portfolio` 相同的主流程：推送 `main` 后由 GitHub Actions 构建 Docker 镜像、推送到 GitHub Container Registry，再通过 SSH 更新阿里云 ECS。

只有 `sci-viz-case-hub/**` 或 Case Hub 工作流自身发生变化时才会触发，不会因 Sci AI Studio 的修改而部署。

## 1. 自动生成的镜像

镜像地址：

```text
ghcr.io/azores24839/sci-viz-case-hub
```

每次构建生成两个标签：

- `latest`：最新版本；
- Git 提交短 SHA：用于定位和回滚。

如果尚未配置 ECS，工作流仍会构建镜像，但会安全地跳过部署任务。

## 2. GitHub 仓库变量

打开 GitHub 仓库：

```text
Settings → Secrets and variables → Actions → Variables
```

添加：

| 名称 | 示例 | 说明 |
| --- | --- | --- |
| `CASE_HUB_SSH_HOST` | `139.196.209.165` | ECS 公网 IP |
| `CASE_HUB_SSH_USERNAME` | `root` | SSH 用户名，以实际值为准 |
| `CASE_HUB_SSH_PORT` | `22` | SSH 端口 |
| `CASE_HUB_COMPOSE_DIR` | `/opt/sci-viz-case-hub` | ECS 部署目录 |

## 3. GitHub 仓库 Secret

在同一页面切换到 Secrets，添加：

| 名称 | 内容 |
| --- | --- |
| `CASE_HUB_SSH_PRIVATE_KEY` | ECS 对应 SSH 私钥的完整内容 |

私钥只保存在 GitHub Actions Secret，不提交到仓库，也不要发到聊天中。

## 4. ECS 首次准备

ECS 需要预先安装 Docker 和 Docker Compose 插件。然后在服务器执行：

```bash
sudo mkdir -p /opt/sci-viz-case-hub
cd /opt/sci-viz-case-hub
sudo touch .env
sudo chmod 600 .env
```

将 `.env.production.example` 中的配置填写到服务器的 `/opt/sci-viz-case-hub/.env`。不要把真实密钥提交到 GitHub。

如果 GHCR 镜像是私有的，还需要在 ECS 上使用具备 `read:packages` 权限的 GitHub Token 登录一次：

```bash
docker login ghcr.io -u azores24839
```

密码位置粘贴 Token。Token 不要写进 Compose 文件。

## 5. 临时访问

当前生产 Compose 默认映射端口 `3001`。阿里云安全组临时放行 TCP 3001 后，可访问：

```text
http://139.196.209.165:3001
```

正式域名上线后应使用 Nginx 和 HTTPS，只向公网开放 80/443，并关闭公网 3001。

## 6. 持久数据

以下内容保存在 Docker Volume，不会因更新镜像而消失：

- SQLite 数据库；
- 本地 uploads；
- journal covers。

历史数据库和图片不会自动进入 Docker 镜像。正式上线前仍需单独迁移 SQLite，并按 OSS 迁移方案上传历史图片。

## 7. 日常部署

配置完成后，只需把 Case Hub 变更推送到 `main`。GitHub Actions 将自动：

1. 构建镜像；
2. 推送 `latest` 和 SHA 标签；
3. 将生产 Compose 文件复制到 ECS；
4. 拉取新镜像；
5. 重启容器；
6. 输出容器状态。

在 GitHub 仓库的 `Actions` 页面可以查看每一步是否成功。
