# CronCrowd

**看见定时任务的资源拥挤：从启动时间，到整个运行过程。**

为 cron 任务加上预计时长和资源权重，查看共同时间线，再模拟启动延迟对容量的影响。完全本地运行，零依赖，无需账号或 API Key。

[**在线试用**](https://unbreakableslash.github.io/croncrowd/) · [English](README.md) · [模型说明](docs/model.md)

![CronCrowd 实际界面：热力图、任务时间线和延迟模拟](docs/demo.jpg)

## 立即试用

下载仓库，直接用浏览器打开 **[web/index.html](web/index.html)**。这是一个自包含 HTML 文件，无需构建或启动服务器。

也可以使用 Node.js 20 及以上版本：

```sh
git clone https://github.com/unbreakableslash/croncrowd.git
cd croncrowd
node bin/croncrowd.mjs demo
# 浏览器打开 http://127.0.0.1:4173
```

点击右上角“中文”。在演示中选中 **Search reindex**，把启动延迟设为 **45 分钟**，点击“对比”，查看超载分钟数和资源峰值的变化。保留延迟只会更新模拟配置，不会修改真实调度器。

## 它能解决什么

- 两个任务虽然错开启动，却因运行时长较长仍然重叠。
- 多个备份、统计和索引任务在凌晨同时争抢资源。
- 高频任务的运行时长超过启动间隔，出现自身重叠。
- 分布在不同时区的任务在 UTC 时间线上碰到一起。
- 窗口开始前已启动的任务仍在消耗资源。

小时热力图展示小时内最大负载，日时间线展示每个任务的运行区间。你可以用权重表示连接数、工作进程或其他一致的资源单位，再设定容量上限。

## 输入格式

每行一个任务；时区、权重、延迟可以省略，默认 `UTC`、`1`、`0`：

```text
# 名称 | cron | 运行分钟数 | 时区 | 资源权重 | 延迟分钟数
数据库备份 | 0 2 * * * | 45 | UTC | 2 | 0
搜索索引 | 0 2 * * * | 25 | UTC | 2 | 45
库存同步 | */30 * * * * | 8 | UTC | 1 | 0
```

支持 JSON 导入导出；示例见 [demo.jobs.json](examples/demo.jobs.json)。名称不能包含竖线或换行。

## 命令行与 CI

```sh
node bin/croncrowd.mjs audit examples/demo.jobs.json --from 2026-09-30T00:00:00Z --days 7
node bin/croncrowd.mjs audit examples/demo.jobs.json --from 2026-09-30T00:00:00Z --html report.html
node bin/croncrowd.mjs audit examples/demo.jobs.json --json --fail-on-overload
```

`--days` 支持 1–31 天；`--capacity` 覆盖容量；`--html` 输出离线交互报告。`--from` 必须包含 `Z` 或 UTC 偏移，可用于复现分析。省略时从当前时间向上取整到下一分钟。

退出码：`0` 成功，`1` 表示使用 `--fail-on-overload` 时发现超载，`2` 表示输入或文件错误。

当前未发布 npm 包。可从源码运行，也可在仓库目录执行 `npm install --global .` 后使用 `croncrowd` 命令。

## 模型边界

这是容量规划模拟，假设任务固定时长、按计划全部启动，允许并行实例，不模拟排队、重试、锁、平台启动延迟或负载对时长的反馈。超载表示模拟需求超过设定容量，并非实测生产故障。

支持标准五字段 cron、范围、列表、步长、英文月份/星期名，以及 `@daily` 等日历别名。日期与星期遵循 Vixie 规则。模拟中夏令时跳过的分钟不启动，重复的分钟启动两次；实际调度器可能采用不同策略。详见 [模型文档](docs/model.md)。

配置只存在当前页面内存中，导出时才写入文件。导出的报告包含任务名与计划，请按预期范围分享；本工具无需读取真实凭据或命令内容。

## 开发

```sh
node --test
node scripts/build.mjs
```

修改网页源文件或核心算法后，重新生成 `web/index.html`。欢迎提交可以复现的问题和有明确使用场景的改进。MIT 许可证。
