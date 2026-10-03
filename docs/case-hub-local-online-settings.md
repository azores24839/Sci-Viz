# 案例库：本地与交大云两套设置

只有两张需要填写的设置清单，位于 `sci-viz-case-hub/config/`：

| 文件 | 用在哪里 | 什么时候填写 |
| --- | --- | --- |
| `local.env` | 你的电脑 | 第一次运行 demo 时自动生成，可以调整数据文件夹和端口 |
| `online.env` | 交大云服务器 | 主机、域名和证书准备好以后填写 |

`.example` 是可提交 GitHub 的空白模板；没有 `.example` 的实际清单可能含密钥，已设置为不提交 GitHub。无需增加 YAML 读取器。前端不会读取这些密钥。

## 在电脑上看 demo

需要 Node.js 24。打开终端，进入**包含本次 PR 修改**的 `sci-viz-case-hub` 文件夹，首次执行：

```bash
npm run install:all
npm run demo:local
```

看到服务启动后，打开 `http://localhost:3001`。首次会自动创建 `config/local.env` 和独立 `.local-data` 数据文件夹，生成三张明确标为演示的图片和一个测试账号：用户名 `demo`、密码 `demo-local-only`。这些是测试内容，不代表你的完整科研案例库。

停止：在终端按 Ctrl+C。以后再次启动：

```bash
npm run start:local
```

如果 3001 已被占用，在 `config/local.env` 将 `PORT` 改成例如 3109，然后打开 `http://localhost:3109`。无需改代码、前端代理或密钥文件。默认只允许你这台电脑访问。

本地启动读取清单、构建前后端、启动服务；已有数据库会先备份再同步 schema。演示初始化不会覆盖已有案例或账号。AI/OCR 密钥为空也能浏览、登录和查看图片，填写供应商设置后才运行对应服务。

## 看自己的完整案例库

`CASE_HUB_DATA_DIR` 是程序找数据的文件夹。里面应包含：

```text
数据文件夹/
  prisma/dev.db
  uploads/originals/
  uploads/thumbnails/
  journal_covers/
  backups/
```

不要只复制缩略图。使用[交大云手册](jcloud-case-hub-runbook.md)中的完整快照制作与恢复命令，先停止原案例库和所有写入脚本，再把快照恢复到一个新的、空的数据目录；把 `local.env` 的 `CASE_HUB_DATA_DIR` 改为这个目录，运行 `npm run start:local`。

例如 `CASE_HUB_DATA_DIR=/Volumes/ZZZ/case-hub-demo-data`。相对路径以 `sci-viz-case-hub` 文件夹为基准；含空格的路径加双引号。启动命令会将图片读取、采集写入、OCR/AI本地读取和备份全部映射到所选目录，网页仍用原来的相对图片地址。

如果完整数据中有个人 API 密钥，保留符合要求的旧 JWT_SECRET，或登录后重新保存个人 API 密钥；更换 JWT 会使旧的加密密钥不能解密。已有数据库不自动增加 demo 账号，应使用其中原来的账号。

## 交大云准备好后

在服务器上保持发布文件结构，复制模板：

```bash
cp config/online.env.example config/online.env
chmod 600 config/online.env
```

填写线上清单中的完整镜像版本、数据盘文件夹、真实 HTTPS 地址、两个不同的随机密钥，以及需要的 AI/OCR 设置。服务器需要 Docker Compose 和 Python 3；使用下面的脚本不需要服务器安装 Node：

```bash
bash scripts/start-online.sh --check
bash scripts/start-online.sh
```

如果服务器装了 Node，也可用 `npm run check:online-config`、`npm run start:online`。检查不会输出密钥；示例地址、HTTP 地址、短镜像标签和开发密钥会被拒绝。

启动前必须先迁移完整数据库和图片，并配置 HTTPS 证书/反代。配置文件选择正确不会自动搬运图片。上线后修改设置需要重新启动服务。完整操作与验收见[交大云部署手册](jcloud-case-hub-runbook.md)。

原来的 `server/.env` 开发方式和 `.env` + production Compose 运维方式仍保留；新的一键本地入口不读取机器上其他项目的 AI 密钥。线上入口通过 `online.env` 给原 production Compose 提供设置，不另造部署系统。
