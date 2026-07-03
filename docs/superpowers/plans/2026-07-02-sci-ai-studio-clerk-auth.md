# Sci AI Studio Clerk 认证实施计划

1. 安装 `@clerk/react`、`@clerk/backend` 与 API 限流依赖，补齐前后端环境变量。
2. 建立前端认证壳：Clerk Provider、登录注册页、用户菜单、统一带 token 的 API 客户端；无 key 时使用明确的本地 mock 用户。
3. 建立后端认证钩子：Clerk JWT 校验、authorized parties、mock 开发模式、生产缺配置拒绝启动。
4. 建立服务端用户项目：首次登录返回独立默认项目；业务请求不再信任浏览器随机身份。
5. 给所有资料接口增加项目所有权校验，OSS 对象键包含 user ID，越权统一返回 404。
6. 增加每用户资料数、存储量和 AI 创建次数额度；增加用户/IP 请求限流。
7. 更新 Docker、README 和环境变量模板。
8. 覆盖无 token、有效 token、跨用户越权、额度和限流测试；运行类型检查、测试、构建与浏览器验收。
