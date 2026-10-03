# 科研影像案例库 · 交大云部署与恢复

本手册只部署 `Sci-Viz/sci-viz-case-hub`；不安装 AI 工作台。案例库可以独立浏览、登录、采集和分析。所有数据规模以迁移时生成的 manifest 为准，勿把历史数量当作验收值。

## 交付前需要取得的信息

- 服务器 SSH 地址、端口和有 Docker 管理权限的运维账号。
- 已挂载、开机自动挂载的数据盘目录；磁盘容量应覆盖当前资产、7 份完整本地快照、镜像和增长空间。
- 校园内可访问的 HTTPS 域名、完整证书链和私钥，或学校提供的 HTTPS 反向代理。证书必须被组员浏览器信任。
- 校园网入口/防火墙规则、备份用独立服务器或私有存储、备份凭据及故障告警接收方式。

当前生产代码强制精确 HTTPS origin，登录 Cookie 带 Secure。IP + HTTP 不能作为正式登录入口。只开放需要的校园访问范围；应用端口 3001 绑定 localhost，外部通过 443 访问。镜像为根路径 `/`，不要再套用旧 `/sciviz/` 子路径方案。新版前端的默认构建目标为 Chrome 107、Firefox 104、Safari 16 或更新的浏览器。

## 发布产物与门槛

1. PR 的 quality、镜像构建、容器烟测、Trivy 扫描全部通过。
2. main 的发布镜像完成推送、SBOM/provenance 生成和按 digest 扫描；Trivy 对已有修复的 High/Critical 漏洞阻断发布。没有修复的漏洞仍需从扫描日志评估。
3. 记录完整 Git SHA 和镜像 digest，不使用 `latest`。PR 本地构建不发布镜像，也不部署服务器。
4. 如开启 GitHub 自动部署，应先完成本手册的数据和反代配置，并在 GitHub production environment 设置审批。未准备完毕前不要配置 `CASE_HUB_SSH_HOST`。workflow_dispatch 在 main 上也可能触发部署。
5. 每次发布前有独立完整快照。自动启动备份只覆盖数据库，不替代完整备份和异地副本。

## 1. 安装并准备服务器

通过学校认可的方式安装 Docker Engine + Compose v2、Python 3、Nginx、rsync；备份脚本使用 Ubuntu 自带 util-linux 的 flock。确认数据盘已挂载，避免文件写入未挂载的系统盘目录。

从审核通过的发布提交取出以下文件，放到 `/srv/case-hub`：

- `sci-viz-case-hub/docker-compose.prod.yml` → `/srv/case-hub/docker-compose.prod.yml`
- `sci-viz-case-hub/.env.production.example` → `/srv/case-hub/.env`
- `sci-viz-case-hub/scripts/` → `/srv/case-hub/scripts/`
- `sci-viz-case-hub/deployment/` → `/srv/case-hub/deployment/`

这些是运维配置和脚本；服务器不需要安装 Node 或源码构建。获取私有 GHCR 镜像时，用学校批准的只读 package 凭据执行 `docker login ghcr.io`，不要把令牌写进 Git。

编辑 `.env`：

```dotenv
CASE_HUB_IMAGE_TAG=<测试并扫描通过的完整40位Git SHA>
CASE_HUB_BIND_IP=127.0.0.1
CASE_HUB_PORT=3001
CASE_HUB_DATA_DIR=/srv/case-hub/data
CASE_HUB_CPUS=1.5
CASE_HUB_MEMORY_LIMIT=2g
CASE_HUB_ALLOW_DATABASE_INITIALIZATION=false
JWT_SECRET=<独立随机值>
CORS_ORIGINS=https://<实际案例库域名>
STUDIO_SERVICE_KEY=<另一独立随机值>
```

两种密钥各至少 32 字符，可分别使用 `openssl rand -hex 32` 生成，保存到权限为 600 的 `.env`。即使本次不部署工作台，当前案例库仍要求 service key。origin 不包含路径或结尾斜杠。首次迁移现有案例库时，始终保持 initialization 为 false；生产显式初始化只创建空 schema，不加入演示案例或账号。

暂不配置 OSS：本次使用数据盘中的原图、缩略图和期刊封面。不要配置 `OSS_PUBLIC_BASE_URL`，除非已完整上传并验证对应对象；该设置不会迁移本地资产。

## 2. 在本地制作完整一致快照

先停止本地案例库后端，以及所有采集、OCR/AI批处理、数据库脚本和其他图片写入进程。检查它们已经退出；不是只关闭浏览器。由于数据库和图片需要一致，工具必须收到 `--writers-stopped`；该标志是人工确认，不会自动停止进程。

```bash
cd /Volumes/ZZZ/sh/科研影像
python3 sci-viz-case-hub/scripts/data_snapshot.py snapshot \
  --db sci-viz-case-hub/server/prisma/dev.db \
  --uploads sci-viz-case-hub/server/uploads \
  --journal-covers journal_covers \
  --output /private/tmp/case-hub-initial-snapshot \
  --writers-stopped
python3 sci-viz-case-hub/scripts/data_snapshot.py verify \
  --snapshot /private/tmp/case-hub-initial-snapshot
```

使用本次发布分支的脚本。如果本地仓库尚未同步，可以先把脚本从发布产物复制到本地；不要运行旧指南的直接复制数据库命令。

快照完整包含 SQLite、uploads 原图/缩略图和 journal_covers，保留已存在的用户和加密密码；不包含 `.env` 或历史 backups。SQLite 使用 backup API，覆盖已提交 WAL 数据。manifest 记录每个文件的大小、SHA256、案例数、图片引用数和 quick_check 结果；缺少任何已引用本地图片都会失败。符号链接和非空输出目录被拒绝。快照包含完整业务数据库，必须按私有数据保护和传输。

成功后可恢复本地服务，但迁移截止时间之后新增的数据不会自动同步到云端。交付时指定云端为唯一写入入口，防止两边分叉。

## 3. 上传、恢复与验证

用 SSH/rsync 将整个快照目录传到服务器私有 staging 目录，避免放进网站静态目录：

```bash
rsync -a --info=progress2 /private/tmp/case-hub-initial-snapshot/ \
  <运维账号>@<服务器>:/srv/case-hub-staging/initial/
```

服务器端：

```bash
cd /srv/case-hub
python3 scripts/data_snapshot.py verify --snapshot /srv/case-hub-staging/initial
python3 scripts/data_snapshot.py restore \
  --snapshot /srv/case-hub-staging/initial --target /srv/case-hub/data
python3 scripts/data_snapshot.py verify \
  --snapshot /srv/case-hub-staging/initial --target /srv/case-hub/data
chmod 600 .env
```

恢复目标必须不存在或为空；工具拒绝覆盖现有数据。务必在服务第一次启动之前做 target verify，因为启动会更新数据库、复制镜像 schema 并生成数据库备份，之后数据目录与初始快照清单不再完全相同。初始快照保留在私有 staging 或异地存储，用于回滚。

## 4. 启动、HTTPS 和验收

```bash
cd /srv/case-hub
docker compose --env-file .env -f docker-compose.prod.yml config -q
docker compose --env-file .env -f docker-compose.prod.yml pull
docker compose --env-file .env -f docker-compose.prod.yml up -d --wait --wait-timeout 120
curl --fail http://127.0.0.1:3001/api/health
```

启动会先使用 VACUUM INTO 备份已有数据库，再复制镜像自带 schema，并用 Prisma db push 更新数据库。备份或 schema 更新失败就不启动网站；没有使用允许数据丢失的参数。不要强行跳过失败。`data/backups` 会随重启积累，需保留上一发布前副本并在备份策略中定期清理。数据库更新可能影响旧版本兼容性；只换旧镜像不能替代数据回滚。

按 `deployment/nginx.conf.example` 替换域名/证书路径并部署 Nginx，执行 `nginx -t` 后重载。证书续期需由学校证书服务或运维配置，手册不自动申请证书。

发布必须从组员实际使用网络验收并记录结果：

- HTTPS 证书可信、首页无白屏、刷新详情页正常。
- `/api/health` 为 ready；案例行数与快照 manifest 一致。
- `/api/cases`、三轴频谱、对比分析和筛选正常，三轴任一缺失的案例数量单独报告。
- 随机打开不同来源的原图、缩略图、期刊封面，确认不是只有缩略图能打开；外链视频/图片另行检查。
- 用迁移的现有账号登录，Cookie 带 Secure/HttpOnly；生产注册关闭。不要在测试日志中记录密码或 Cookie。
- 未登录时写入操作为 401；登录后上传一张专用测试图片、编辑与导出正常，测试资产按正常界面清理。
- AI 分类/OCR 需要实际供应商配置或用户凭据；未配置时不能宣称这些功能已生产验收。测试一项实际分类任务并记录结果。
- 重启容器后案例、图片和账号仍可用。
- 磁盘和证书到期告警、备份失败告警均已接入学校运维或监控；不能仅依赖容器 restart。

当前程序有公开的案例读取和图片路径。若只允许课题组访问，应通过校园网络/防火墙或学校入口认证限制访问范围；应用登录主要控制写入。

## 5. 每日完整备份与异地副本

自动备份会短暂停站，停止案例库容器后复制全量图片和一致性数据库，验证 SHA256，然后恢复原本运行的服务。发生快照或异地复制错误，也会尝试恢复服务并以非零状态退出；运维需要监控 service 失败。外部写入者必须全部禁用或纳入停写方案。

复制 `deployment/backup.env.example` 到 `/srv/case-hub/backup.env`，核对路径，配置私有异地 SSH 目标、已固定的 SSH host key 和最小权限备份凭据。确认容器是唯一写入者后，才把 `CASE_HUB_WRITERS_MANAGED` 改为 true。

```bash
sudo install -m 600 deployment/backup.env.example /srv/case-hub/backup.env
# 编辑 backup.env，切勿把配置值提交回仓库
sudo install -m 644 deployment/case-hub-backup.service /etc/systemd/system/
sudo install -m 644 deployment/case-hub-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start case-hub-backup.service
sudo journalctl -u case-hub-backup.service --no-pager
sudo systemctl enable --now case-hub-backup.timer
systemctl list-timers case-hub-backup.timer
```

定时器默认每天吉隆坡时间 03:00 左右，保留最近 7 份完整本地快照。只有成功完成快照验证与已配置的异地复制，才清理多余本地快照。未设置异地目标时仅有本地副本，不能称作异地备份完成。异地至少保留 7 个每日版本和 4 个每周版本，由备份端设置保留策略；定期检查空间，初次全量传输可能较久。

## 6. 恢复演练和版本回滚

先在隔离数据目录与隔离容器进行恢复演练，不连接现有生产容器：用 `restore` 恢复到新目录并 `verify`，使用相应发布版本的镜像和独立容器名/端口启动，检查案例数、图片、登录。测量恢复耗时，再制定实际 RPO/RTO。工具测试已覆盖 WAL、缺图片、篡改、非空目标拒绝等；它们不能代替真实全量数据恢复演练。

每次升级前记录旧完整 SHA、镜像 digest，保存完整快照和 `.env` 的安全副本。不要立即 prune 旧镜像。回滚时：

1. 进入维护期，停止容器和全部外部写入者，保存失败版本当前数据供调查。
2. 将升级前快照恢复到全新的目录，例如 `/srv/case-hub/data-rollback`，并在启动前 verify。
3. 在 `.env` 中把 `CASE_HUB_DATA_DIR` 指向恢复目录，`CASE_HUB_IMAGE_TAG` 指向对应旧镜像完整 SHA。
4. 执行 compose up --wait，重复数据库、原图、缩略图、封面和登录验收。
5. 恢复入口前明确升级之后新增数据的处理方式；恢复旧快照会回到旧时点，不会自动合并新增数据。

数据库启动备份可用于诊断或专门的数据库回退；若涉及图片/采集写入，应回退完整快照。GitHub 的自动回滚只恢复前一个镜像，不保证已变更数据库兼容；必要时按本节执行数据恢复。

## 本次验证记录与尚待验证

本地：74 项后端测试、前后端构建、真实图片处理，前后端全量及生产依赖审计均无漏洞；20 项 Python 工具测试涵盖快照/恢复、WAL、完整性校验、拒绝覆盖，入口故障阻断，以及每日备份失败后恢复运行流程。Playwright 使用隔离测试数据库验证新版前端案例列表、三轴分析页面跳转与测试账号登录，浏览器控制台没有错误；此登录检查使用本地开发 Cookie，生产 Secure Cookie 由容器烟测另行验证。

CI：生产镜像真实容器烟测覆盖原图/缩略图生成、缺数据库拒绝、旧 schema 替换、实际 SQLite 备份、HTTPS Cookie 登录、静态资产读取、三轴读取和重启数据保留；Trivy 扫描结果以当前 PR/run 为准。

尚需交大云实测：实际证书/反代、校园网络、全量迁移与恢复演练、现有用户登录、上传/导出/真实 AI 作业、异地备份与告警、资源/磁盘评估。没有这些证据，不报告正式上线完成。
