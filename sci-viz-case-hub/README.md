# 科研视觉案例自动收集与分类系统

科研视觉案例自动收集与分类系统，帮助自动收集、整理和分析科研相关的视觉案例。

## 如果你是电脑小白，从这里开始

### 第一步：打开"终端"（Terminal）

**Mac 电脑：**
1. 按 `Command + 空格` 打开搜索
2. 输入"终端"或"Terminal"
3. 点击打开（黑色背景的窗口）

**Windows 电脑（如果你用 Windows）：**
1. 按 `Windows 键` 打开开始菜单
2. 输入"cmd"或"命令提示符"
3. 点击打开

---

### 第二步：找到项目文件夹

在终端里输入以下命令（输入完按回车）：

```bash
cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub
```

> 💡 `cd` 的意思是"进入文件夹"，后面跟的是项目所在的路径。

---

### 第三步：启动后端

**3.1 进入后端文件夹并安装依赖**

在终端里输入：

```bash
cd server
```

然后输入：

```bash
npm install
```

> 这步会安装后端需要的所有程序包。看到很多文字滚动是正常的，等它停下来就行。

**3.2 创建数据库和测试数据**

输入：

```bash
npm run db:setup
```

> 你会看到 `Seeded 3 test cases` 这样的提示，说明成功了。

**3.3 启动后端服务**

输入：

```bash
npm run dev
```

> ⚠️ **重要：启动后端后，这个终端窗口就被占用了，不能再输入其他命令。**
> 你会看到 `Server running on http://localhost:3001`
>
> **请把这个终端窗口最小化，不要关掉它。**

---

### 第四步：新开一个终端窗口启动前端

1. 再打开一个"终端"（方法同第一步）
2. 在新终端里输入：

```bash
cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/web
```

3. 安装前端依赖：

```bash
npm install
```

4. 启动前端：

```bash
npm run dev
```

> 你会看到 `http://localhost:5173` 这样的地址。
> **同样，这个终端也先最小化，别关。**

---

### 第五步：打开后台管理系统

1. 打开 Chrome 浏览器
2. 在地址栏输入：**http://localhost:5173**
3. 按回车

> 你会看到一个深色导航栏的页面，标题是"科研视觉案例库"。

---

### 第六步：加载 Chrome 插件（可选）

如果你想用 Chrome 插件采集图片：

1. 打开 Chrome 浏览器
2. 在地址栏输入：**chrome://extensions**
3. 把右上角的"开发者模式"开关打开
4. 点击左上角的"加载已解压的扩展程序"
5. 选择 `extension` 文件夹（路径：`/Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/extension`）
6. 安装成功后，浏览器右上角会出现插件图标

**插件功能：**
- 在网页图片上右键 → "保存到科研视觉案例库"
- 选中文字后右键 → "保存选中内容到科研视觉案例库"
- 点击插件图标 → 截图当前页面 / 保存页面图片

---

### 关闭系统

不用的时候，回到两个终端窗口，分别按 `Control + C`（按住 Ctrl 再按 C）停止服务。

下次再用，只需要：
1. 打开终端 → `cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/server` → `npm run dev`
2. 新终端 → `cd /Users/athenaeumzero/Documents/科研影像/sci-viz-case-hub/web` → `npm run dev`
3. 浏览器打开 http://localhost:5173

---

## 常见问题

**Q: 启动后端时提示 `command not found: npm`**
A: 需要安装 Node.js。去 https://nodejs.org 下载安装，装完再试。

**Q: 浏览器打开 http://localhost:5173 显示空白或无法访问**
A: 检查两个终端窗口是否都在运行（没有报错）。前端和后端都需要同时运行。

**Q: 插件保存时提示"无法连接后端"**
A: 在插件弹出框中，把 API 地址改成 `http://localhost:3001`

**Q: 我想用 OCR 和 AI 分类功能**
A: 在 `server/.env` 文件中填入你自己的 API 地址和 Key 即可生效。

## 项目结构

```
sci-viz-case-hub/
├── server/          # 后端 (存数据、处理图片、调用API)
├── web/             # 前端 (浏览器里的管理后台)
├── extension/       # Chrome 插件 (采集素材用)
└── README.md        # 本文件
```

## 功能列表

| 功能 | 说明 |
|------|------|
| Chrome 插件采集 | 右键保存图片、截图、选中文字 |
| 自动保存图片 | 保存原图 + 生成缩略图 |
| OCR 文字识别 | 提取图片中的文字（需配置 API） |
| AI 分类 | 自动识别呈现方式、学科、风格等（需配置 API） |
| 案例列表 | 按呈现方式/学科/风格/状态筛选 |
| 案例详情 | 查看原图、OCR结果、AI分类、可借鉴点 |
| 人工复核 | 批准/拒绝、修改标签、打分 1-5 |
| 导出 | CSV（表格）、Markdown（文档） |
