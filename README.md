# Xyfy.TxtReader

Chrome 和 Edge 可用的 TXT 小说阅读扩展。

当前阶段已实现：

- Manifest V3 扩展骨架
- 阅读器页面与双页风格布局
- 本地 TXT 文件导入
- 章节目录基础解析
- 阅读设置与本地持久化
- 阅读进度与书签本地保存

## 本地运行

1. 打开 Chrome 或 Edge 的扩展管理页面。
2. 启用开发者模式。
3. 选择“加载已解压的扩展程序”。
4. 选择当前项目目录。
5. 点击扩展图标，打开阅读器。

## 当前目录

- popup: 扩展弹窗
- reader: 阅读器页面
- background: MV3 service worker
- modules: 核心模块
- docs: 规划文档
