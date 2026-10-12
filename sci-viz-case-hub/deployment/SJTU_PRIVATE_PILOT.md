# 交大云封闭内测部署准备

本文件对应“小规模、多人同时浏览”的封闭内测。案例库目前允许匿名读取部分案例，且 `/uploads`、`/journal_covers` 由应用直接提供；因此必须使用 `nginx.private-pilot.conf.example` 在整个站点入口加认证，包括图片 URL。不要用公开版 Nginx 示例配置开展内测。

## 访问边界

- Docker Compose 默认仅将应用端口绑定到 `127.0.0.1`。防火墙只开放 HTTPS（以及 HTTP 到 HTTPS 的跳转），不要将 3001 端口对公网开放。
- Nginx 对所有路径使用 HTTPS + Basic Auth。每名测试者单独建账号，以便撤销访问。密码文件只保存在服务器 `/etc/nginx/case-hub.htpasswd`，不写入 Git。
- 普通测试者只使用 Nginx 账号浏览已审核案例。只有维护人员才使用案例库应用内账号登录；目前应用内账号没有只读角色，不能发给普通测试者。
- 不配置公开 OSS/CDN 图片地址。若启用 OSS，图片必须保持私有，先验证返回给浏览器的图片 URL 也受到等效访问控制；否则暂用服务器本地图片目录。
- Studio 的服务端调用使用独立的 `STUDIO_SERVICE_KEY`。若 Studio 不在同一台服务器或同一私有网络，先设计专用的服务间访问方式，不要为了连通而放开 Nginx 认证或 3001 端口。

## 发布前准备

1. 将通过测试的完整 Git SHA 构建并推送到 GHCR，按该 SHA 设置 `CASE_HUB_IMAGE_TAG`。不要以工作目录中的未提交代码或可变 `latest` 标签部署。
2. 在服务器准备生产环境变量：强随机 `JWT_SECRET`、`STUDIO_SERVICE_KEY`、准确的 HTTPS `CORS_ORIGINS`、数据目录和镜像 SHA。运行 `npm run check:online-config`，直到通过。密钥只放服务器环境文件。
3. 单独迁移 SQLite 数据库、`uploads` 和 `journal_covers`；这些数据不在 GitHub 镜像中。核对文件数、大小和抽样图片；保留可恢复的离线备份。
4. 通过 HTTPS 配置 Nginx。用 `htpasswd -cB /etc/nginx/case-hub.htpasswd tester1` 建立首个账号；新增账号使用 `htpasswd -B /etc/nginx/case-hub.htpasswd tester2`，不可重复使用 `-c`。密码不要放入 shell 历史或代码仓库。
5. 首次上线前确认容器只监听本机、数据库和图片目录已挂载、备份定时器可运行，并完成一次恢复演练。

## 内测验收

- 未提供 Nginx 凭据时，首页、案例 API、原图、缩略图和封面地址均返回 401；提供凭据后可浏览。
- 普通测试者无法进行新增、修改、删除、采集、OCR 或 AI 批处理；维护人员的应用内账号可执行管理操作。
- 至少使用与预期内测规模相近的多用户并发，覆盖首页、筛选、案例详情和图片加载；记录响应时间、错误率、CPU、内存、SQLite 锁错误和出口流量。没有压测结果前，不承诺可支持的在线人数。
- 验证容器重启后数据仍在，备份文件可恢复；检查 Nginx 和应用日志无密钥或图片敏感路径泄漏。

单容器 SQLite 适合先做读多写少的小规模内测。若测试显示数据库锁等待、持续高延迟或需要多实例，再评估 PostgreSQL 和独立图片服务。
