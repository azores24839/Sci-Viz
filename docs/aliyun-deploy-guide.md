# 阿里云轻量应用服务器部署指南

## 第一步：购买服务器（5分钟）

1. 打开 [阿里云轻量应用服务器](https://swas.console.aliyun.com/)
2. 点击「创建服务器」
3. 参数选择：
   - **地域**：选离你最近的（华东1-杭州 或 华东2-上海）
   - **镜像**：选「系统镜像」→ **Ubuntu 22.04**
   - **套餐**：**2核2G 60元/月**（最低够用了，2-3人访问没问题）
   - **时长**：先买1个月试试
4. 付款后，进入服务器详情页
5. 点击「远程连接」→「通过浏览器登录」（不需要装任何软件！），就能进入服务器的命令行

> 等不及的话也可以先选 24元/月（1核1G），编译时会慢一些但不影响使用。

---

## 第二步：在服务器上部署（15分钟）

在浏览器终端中逐条粘贴以下命令：

### 2.1 安装 Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
node -v   # 确认输出版本号（v20.x）
```

### 2.2 上传项目代码

**方式A：用 Git（推荐，如果你代码在 GitHub/Gitee 上）**

```bash
git clone <你的仓库地址> ~/sci-viz-case-hub
```

**方式B：直接从本地上传（如果没用 Git）**

先在 Alibaba Cloud 控制台找到「远程连接」→「上传文件」，把整个 `sci-viz-case-hub/` 文件夹压缩成 zip 上传到服务器，然后：

```bash
cd ~
unzip sci-viz-case-hub.zip -d sci-viz-case-hub
```

### 2.3 上传数据库和缩略图

**在本机终端执行**（替换 `<服务器IP>` 为你的实际 IP）：

```bash
cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub
scp server/prisma/dev.db root@<服务器IP>:~/sci-viz-case-hub/server/prisma/dev.db
scp -r server/uploads/thumbnails root@<服务器IP>:~/sci-viz-case-hub/server/uploads/
```

> 如果 scp 连不上，用阿里云控制台的「上传文件」功能，把 dev.db 和 thumbnails 文件夹上传后手动放到对应位置。

### 2.4 安装依赖并构建

```bash
cd ~/sci-viz-case-hub/server
npm install

cd ~/sci-viz-case-hub/web
npm install
npm run build     # 构建前端（输出到 web/dist/）
```

### 2.5 安装 PM2 并启动

```bash
sudo npm install -g pm2

# 启动后端（Express + 静态文件，端口3001）
cd ~/sci-viz-case-hub/server
pm2 start src/index.ts --name sciviz --interpreter tsx

# 设置开机自启
pm2 save
pm2 startup
# （PM2 会打印一条 sudo 命令，复制执行即可）
```

### 2.6 开放防火墙端口

在阿里云控制台 → 服务器详情 →「防火墙」→「添加规则」：
- **端口**：3001
- **协议**：TCP
- **策略**：允许

---

## 第三步：验证

访问 `http://<你的服务器公网IP>:3001`

- 能看到首页（案例列表）→ 部署成功
- 能看到图片缩略图 → 数据迁移成功
- `/insights` 能看到数据分析 → API 正常
- `/report` 能看到分析报告 → 所有功能正常

---

## 日常维护

| 操作 | 命令 |
|------|------|
| 查看状态 | `pm2 status` |
| 查看日志 | `pm2 logs sciviz` |
| 重启应用 | `pm2 restart sciviz` |
| 停止应用 | `pm2 stop sciviz` |
| 更新代码后重部署 | `cd ~/sci-viz-case-hub && git pull && cd web && npm run build && cd ../server && pm2 restart sciviz` |

---

## 预估费用

| 项目 | 费用 |
|------|------|
| 服务器（2核2G） | ~60元/月 |
| 带宽流量 | 套餐内含，基本够用 |
| 数据库存储 | 在服务器磁盘内，不额外收费 |
| **合计** | **~60元/月** |

---

## 注意事项

- 服务器 IP 在 `http://` 而非 `https://`，因为没有 SSL 证书。如果介意，后续可以配置 Nginx + Let's Encrypt 免费证书。
- 数据库在服务器上，你在本地改了数据后需要重新 scp 上传 dev.db 到服务器才能同步。
- 如果只是给同事看，不用频繁同步数据。每周更新一次即可。
