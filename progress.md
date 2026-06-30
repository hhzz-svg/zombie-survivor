## 2026-06-30 - Task: 审查现有游戏并完成同类产品调研

### What was done

- 捕获并审查开始界面、实战 HUD、商店和阵亡结算四个关键流程状态。
- 将截图、逐步 UX/视觉/可访问性发现和证据边界整理到 Figma。
- 对标 Brotato、20 Minutes Till Dawn、Halls of Torment，形成分优先级的改进机会清单。

### Testing

- 在本地 Vite 预览中完成开始、实战、商店、阵亡流程的浏览器验收，四张截图均已打开检查。
- Figma 画布已渲染复核，四张截图按顺序摆放，逐步备注和证据边界可见。
- 调研文档中的四个 PNG 引用均指向实际存在的 1280×720 文件。

### Notes

- `docs/research/2026-06-30-product-audit/README.md`：新增现状审查、竞品调研、问题排序与机会地图。
- `docs/research/2026-06-30-product-audit/01-start.png`：新增开始界面审查截图。
- `docs/research/2026-06-30-product-audit/02-gameplay.png`：新增实战 HUD 审查截图。
- `docs/research/2026-06-30-product-audit/03-shop.png`：新增商店审查截图。
- `docs/research/2026-06-30-product-audit/04-defeat.png`：新增阵亡结算审查截图。
- `progress.md`：新增本轮调研记录。
- 回滚方式：执行 `git restore -- progress.md` 并删除 `docs/research/2026-06-30-product-audit/`；若尚未提交且 `progress.md` 为本轮新建，可一并删除该文件。
