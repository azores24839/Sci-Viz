# 媒体资产与仓库健康维护

## 最高约束

以下目录属于受保护媒体资产。任何自动维护、缓存清理或 Git 清理都不得删除、移动或覆盖其中的文件：

- `journal_covers/`
- `nasa_svs_output/`
- `nature_covers/`
- `sjtu_platform_media/`
- `sci-viz-case-hub/server/uploads/originals/`
- `sci-viz-case-hub/server/uploads/thumbnails/`

以下恢复依据也不得在自动维护中删除：

- `sci-viz-case-hub/server/prisma/dev.db`
- `sci-viz-case-hub/server/prisma/dev.db-wal`
- `sci-viz-case-hub/server/prisma/dev.db-shm`
- `sci-viz-case-hub/server/backups/`
- 受保护目录内的 JSON、缓存、抓取进度和来源元数据

`local-audits/media-assets-inventory.json` 是本地资产目录清单，不是备份。磁盘损坏时，清单不能恢复照片。该目录不提交到 Git，以免数万条文件路径使仓库继续膨胀。

## 维护优先级

### P0：照片安全

1. 保持受保护目录零删除。
2. 运行 `node scripts/media_inventory.mjs` 更新文件数量、大小和修改时间清单。
3. 在有独立磁盘或对象存储后，复制受保护目录并执行：

   ```bash
   node scripts/media_inventory.mjs --hash
   ```

   SHA-256 清单可用于核对源文件与备份副本是否完全一致。

   如果文件在校验过程中发生变化，脚本会报告失败，不会尝试覆盖、回滚或修复照片。

### P1：工作树安全

当前工作树包含较多未提交开发改动。执行历史压缩、批量移动或大规模重构前，应先按功能拆分提交或建立明确的补丁备份。

### P2：无损仓库卫生

- `.playwright-cli/` 整目录视为可再生成运行输出，不提交到 Git。
- 忽略文件只改变 Git 展示，不代表允许删除磁盘上的文件。
- `node_modules/`、`dist/` 和 TypeScript 构建缓存保持可再生成。
- 数据库备份当前不自动删除；建立第二份可靠备份后，再决定保留数量。
- 可运行 `bash scripts/audit_storage_health.sh` 查看体积、Git 状态并刷新媒体清单。
- 可在 `sci-viz-case-hub/` 运行 `npm run check:repo`，检查受保护目录、误提交的运行文件、超大源码和工作树风险。
- 可在 `sci-viz-case-hub/` 运行 `npm run check:media`，只读核对基线中的照片没有缺失或改变；允许采集任务继续新增照片，不覆盖基线。
- 可运行 `npm run check:media:strict` 做严格核对；新增、缺失或改变任一文件都会报告失败。
- 可在 `sci-viz-case-hub/` 运行 `npm run check`，执行只读仓库检查、差异格式检查、服务端测试以及前后端类型检查，不写入构建目录。
- 可在 `sci-viz-case-hub/` 运行 `npm run check:ci`，先执行上述检查，再进行前后端正式构建；正式构建会更新已忽略的 `dist/` 目录，但不会读取或修改受保护照片。

### P3：需要单独授权的操作

以下操作具有不可逆风险，默认禁止自动执行：

- 删除或压缩任何受保护媒体；
- `git gc --prune=now`；
- Git 历史重写；
- 删除数据库备份；
- 将媒体迁移到新位置后删除原件。
- `git clean`、任何 `rm` 批量删除，以及 `cleanupDuplicates.ts --execute`。

只有在媒体已有独立、验证通过的备份，并明确确认恢复方案后，才考虑这些操作。

## 推荐备份结构

至少采用 `3-2-1` 思路：

- 工作目录保留一份；
- 独立硬盘或 NAS 保留一份；
- 云对象存储或另一物理位置保留一份。

每份备份应保存 SHA-256 清单，并定期抽检或全量核对。
