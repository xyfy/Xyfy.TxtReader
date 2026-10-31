# 宣传图（promo）—— 商店营销素材

本目录存放 Chrome / Edge 商店的「宣传图」（promotional images）。

**已预置一组默认宣传图**（由 `scripts/gen-promo.py` 生成，可直接上传使用）：

| 文件 | 规格 | 用途 | 优先级 |
|------|------|------|--------|
| `440x280.png` | 440×280 | 搜索结果卡片小图 | 低 |
| `920x680.png` | 920×680 | 详情页顶部大图 | 中 |
| `1400x560.png` | 1400×560 | Featured 推广横幅（需向 Google 申请） | 低 |

## 自定义 / 重新生成

默认图是程序绘制的品牌横幅（深色底 + 暖纸色书页 + 功能标签）。想换风格或文案：

```bash
# 修改 scripts/gen-promo.py 顶部的文案与配色常量后重新生成
python3 scripts/gen-promo.py                    # 全部三张
python3 scripts/gen-promo.py --size 920x680     # 只生成某一张
python3 scripts/gen-promo.py --out /tmp/promo   # 指定输出目录
```

也可以完全用设计工具自制，按上表尺寸出图后放进本目录覆盖即可。

## 建议

宣传图**全部可选**，不影响审核通过。第一版若赶时间可以先不传，过审后再补。
详见 `docs/release-manual.md` 第 2.3 节。

## 与截图的区别

- **截图（screenshots/）**：商店**必填**项，展示真实阅读器界面，由
  `npm run shots`（本机、加载扩展）或 `scripts/gen-shots-web.py`（无扩展环境）生成。
- **宣传图（promo/）**：**可选**项，纯设计素材，本目录已预置一套默认图。
