# Neko Game

**中文** | **[English](README-en.md)**

---

## 🙏 致谢与来源

**本项目是基于 [Summer-Neko/NekoGame](https://github.com/Summer-Neko/NekoGame) 的二次开发版本，非独立原创。**

- 原项目作者：**Summer-Neko** —— 感谢其开源了 Neko Game，构成本项目的全部基础功能与底层实现。
- 原项目仓库（只读参考）：<https://github.com/Summer-Neko/NekoGame>

---

## 📝 概述

Neko Game 是一款抽卡分析与游戏管理程序，用于记录、分析并呈现你的游戏活动。应用基于 **Electron** 开发，集成**原神、崩坏：星穹铁道、绝区零、千星奇域**的抽卡分析、游戏时长记录与趋势可视化。

本仓库（`Furina1027/NekoGame`）在此基础上做了如下改动。

<img width="900" alt="主页" src="docs/screenshots/home.jpg">

## ✨ 本仓库相对原项目的改动

### 界面层整体重写

渲染进程由原生 DOM + jQuery 迁移为 **React 19 + TypeScript + Vite + Tailwind CSS v4 + shadcn/ui**，主进程仍保持 CommonJS 架构。旧版界面保留在 `legacy/` 目录，仅作参考、不参与构建。

- 新增 `app://` 自定义协议加载产物（`file://` 下 ES module 会被 CORS 拦截，React 不会执行）
- 新增 `media://` 受限代理，用于渲染用户自选的壁纸/图标/海报（仅放行图片扩展名）
- 背景支持四套呈现方式，遮罩强度可调；「悬浮卡片」模式刻意压低遮罩以突出壁纸
- 各路由包裹 `ErrorBoundary`，单页崩溃不再导致整窗白屏

### 缺陷修复

- preload 的 `on*` 订阅统一返回取消函数，修复切换标签后永久黑屏
- CSS 压缩会把标准 `backdrop-filter` 降级为只剩 `-webkit-` 前缀，Chromium 130 不认，导致**遮罩滑块与磨砂玻璃整体失效**；已补 `cssTarget` 并移除手写前缀
- `.glass-sheen` 的 `position: relative` 覆盖了 `.fixed`，使弹窗被定位到窗口之外而无法显示
- Chart.js 在隐藏 Tab 内以 0 宽度建图会被缓存尺寸，导致「只有第一个图表显示」
- canvas 不解析 `var()`，直接传 CSS 变量会使图表整块绘制为黑色
- 承载滚动内容的主面板移除 `backdrop-filter`（每滚动一帧都需重新模糊整个窗口背景）：实测主页平均帧间隔 35.5ms → 24.1ms
- 崩铁卡池键名 `starRail` 大小写错误、硬件加速开关默认逻辑反转

### 功能调整

- 抽卡记录列表对齐 [TeyvatGuide](https://github.com/TeyvatGuide) 的样式：旋转徽章、保底进度条、评分与歪率
- 新增「祈愿概览」：卡池分布 / 星级分布两个饼图
- 刷新抽卡数据时实时显示当前卡池与页码，完成后自动重载界面
- 原神 / 绝区零 / 千星奇域经米游社 CK 直接获取，无需先进游戏抽卡界面
- **移除**：抽卡规划、自动更新（`electron-updater`）与首启更新日志窗口

> 抽卡规划的移除出自本仓库自身的提交 `2737dfa`（由二次开发者执行），并非上游变更。

## 功能特点

- **游戏记录**：自动跟踪并记录游戏时长，提供详细统计
- **抽卡分析**：支持原神、崩铁、绝区零、千星奇域，链接自动复制到剪贴板
- **祈愿概览**：卡池分布与星级分布饼图
- **抽卡数据导入导出**：支持原神 / 崩铁 / 绝区零 `UIGF4.0` 导出，`UIGF3.0`、`SRGF1.0` 导入
- **游戏库管理**：添加、编辑、删除需要记录的游戏
- **数据分析**：趋势图、时长分布、热力图等
- **无感使用**：最小化到系统托盘、后台运行、开机自启
- **数据存储**：本地安全存储，可选配置自动上传（自行填写仓库地址，不依赖原作者的服务）

## 安装

本项目不再维护预编译安装包。请自行从源码构建：

```bash
git clone https://github.com/Furina1027/NekoGame.git
cd NekoGame
npm install          # 会自动为 Electron 重新编译原生模块
npm run dist         # 产出安装包到 dist/
```

## 开发

```bash
npm run dev        # Vite HMR + Electron
npm run typecheck  # tsc --noEmit
npm run build      # 类型检查 + 渲染层构建
npm run dist       # 完整打包
```

### 技术栈与目录结构

```
electron/            主进程（CommonJS）
  main.js            入口，注册 app:// 与 media:// 自定义协议
  preload.js         contextBridge 暴露的 IPC API
  app/               数据库、游戏追踪、IPC 分发
  utils/             米游社登录、抽卡链接、数据上传、背景设置
src/                 渲染进程（React + TypeScript）
  components/ui/     shadcn/ui 组件
  components/chart/  Chart.js 封装
  hooks/             主题、背景、Toast
  lib/               gacha.ts（抽卡统计算法）、chart-color.ts、format.ts、utils.ts
  pages/             主页 / 游戏库 / 游戏工具 / 设置 / 抽卡模块
  windows/dataSync/  数据同步窗口（独立 Vite 入口）
legacy/              原项目重构前的页面与脚本，仅作参考，不参与构建
scripts/screenshot.js 开发期 UI 截图工具
```

**设计系统**：颜色、圆角、阴影、模糊集中在 `src/styles/globals.css` 的 CSS 变量中，组件不写死 `rgba()`。遮罩强度由设置页滑块控制，各呈现方式有各自的压暗增益与可读性下限。

## 使用指南

- **祈愿分析**：原神 / 绝区零 / 千星奇域可先在设置页登录米游社账号，直接点「刷新数据」；崩铁需确保半小时内打开过游戏抽卡界面
- **添加游戏**：填写名称、图标、海报与游戏路径（**游戏主程序 exe，不是启动器**）
- **编辑与删除游戏**：在游戏库中选中游戏，点击 `⋮` 进行操作
- **设置**：建议日常使用时保持常规选项全部开启；可在此配置数据同步
- **游戏图片**：可前往 [SteamGridDB](https://www.steamgriddb.com/) 获取（建议用游戏英文名搜索），支持动图
- **时间记录**：录入的游戏会自动开始统计，无需额外操作

## 界面预览

<table>
<tr>
<td width="50%"><img src="docs/screenshots/home.jpg" alt="主页"><br><sub>主页：全部游戏概览与时长趋势</sub></td>
<td width="50%"><img src="docs/screenshots/gacha-overview.jpg" alt="祈愿概览"><br><sub>祈愿概览：卡池分布 / 星级分布</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/gacha-records.jpg" alt="抽卡记录"><br><sub>抽卡记录：徽章与保底进度</sub></td>
<td><img src="docs/screenshots/gacha-rating.jpg" alt="评分"><br><sub>评分：生涯评级与不歪概率</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/library.jpg" alt="游戏库"><br><sub>游戏库：游戏管理与出勤</sub></td>
<td><img src="docs/screenshots/settings.jpg" alt="设置"><br><sub>设置：常规项与四套背景呈现方式</sub></td>
</tr>
</table>

> 截图中的 UID 与本机用户名已做打码处理。

## 故障排除

- **游戏时长未记录**：确认所选路径是游戏主程序而非启动器（通常是 `Launcher.exe`）
- **权限报错**：若错误信息包含 `gameTracker.js`，可忽略；系统拒绝了查询请求，重启应用即可
- **发布者未知**：安装包未做代码签名，属正常现象
- **原神与绝区零祈愿链接获取慢**：这两个游戏的日志目录随版本变动，若米游社换链失败会回退到读本地缓存

### 已知限制

- 抽卡分析与导入导出仅测试了国服，国际服暂未适配
- 久远（10 年前）的游戏时长数据处理逻辑有待优化
- 分析界面只展示近半年时长，更早的数据不会主动删除但不再显示

## 资产与致谢

- 本项目调用了 [UIGF API](https://uigf.org/zh/api.html) 实现 `item_id` 与 `name` 的互相转换
- 抽卡记录页的交互设计参考了 [TeyvatGuide](https://github.com/TeyvatGuide)，在此致谢
- 应用图标与名称沿用原项目；背景插画由用户自行选择，本仓库不附带任何插画素材
- 二次开发过程中参考了 [Tailwind CSS](https://tailwindcss.com/)、[Radix UI](https://www.radix-ui.com/)、[Chart.js](https://www.chartjs.org/)、[TeyvatGuide](https://github.com/TeyvatGuide) 等开源项目

## 许可证

[GPL-3.0](LICENSE)　© 2023 Summer-Neko（原项目）　© 2026 Furina1027（二次开发）
