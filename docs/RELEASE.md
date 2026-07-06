# DreamRead 发布指南

## 前置条件

- [ ] 已完成 [TESTING.md](./TESTING.md) 全部测试
- [ ] [Chrome 开发者账号](https://chrome.google.com/webstore/devconsole)（一次性 $5 注册费）
- [ ] GitHub 仓库已公开或提供隐私政策链接

## 1. 构建发布包

```bash
npm install
npm run build
npm run package
```

产物：`release/dreamread-v1.1.0.zip`

> 上传到商店的是 **zip 内直接包含 manifest.json**，而不是 zip 里再套一层 `dist` 文件夹。`npm run package` 已按此规则打包。

## 2. 准备商店素材

| 素材 | 要求 |
|------|------|
| 名称 | DreamRead（划词朗读） |
| 简短说明 | ≤ 132 字符 |
| 详细说明 | 功能介绍、使用方法 |
| 图标 | 128×128 PNG（已有 `public/icons/icon128.png`） |
| 截图 | 至少 1 张，推荐 1280×800 或 640×400 |
| 分类 | Productivity / 生产力工具 |
| 语言 | 中文、English |

### 建议截图内容

1. 网页划词 + 右键菜单
2. 底部播放器界面
3. Popup 设置页

### 隐私政策

扩展使用 `storage`、`host_permissions: <all_urls>`（HTTP TTS 请求），商店通常要求隐私政策 URL。

可使用仓库中的 [PRIVACY.md](../PRIVACY.md)：

- 将 `PRIVACY.md` 推送到 GitHub 后，使用 Raw 或 GitHub Pages 链接，例如：  
  `https://github.com/Box0129/dreamread/blob/main/PRIVACY.md`

## 3. 提交到 Chrome Web Store

1. 打开 [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. **New Item** → 上传 `release/voicer-v1.0.0.zip`
3. 填写 Store listing（名称、描述、截图、图标）
4. **Privacy** 标签页：
   - 单一用途：Text-to-speech for selected web content
   - 权限说明：`storage` 保存用户设置；`host_permissions` 仅用于可选的远程 TTS API
   - 隐私政策 URL：填入上述链接
5. **Distribution**：
   - 选择公开 / 不公开（测试可用 Unlisted）
6. 提交审核（通常 1–3 个工作日）

## 4. Edge Add-ons（可选）

1. 打开 [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview)
2. 上传同一个 zip 包
3. 填写类似信息与隐私政策

## 5. 版本更新流程

1. 修改 `manifest.json` 与 `package.json` 中的 `version`
2. `npm run build && npm run package`
3. 在 Developer Dashboard 上传新 zip
4. 填写更新说明（Changelog）

## 6. 不走上商店时的分发方式

- **开发者模式加载**：分享源码，用户自行 `npm run build` 后加载 `dist`
- **离线 CRX**：Chrome 已限制非商店 CRX 安装，不推荐
- **GitHub Releases**：上传 `voicer-v1.0.0.zip` 供高级用户侧载（需开启开发者模式）

## 权限审核说明（供填写表单参考）

| 权限 | 用途 |
|------|------|
| `contextMenus` | 右键「Read This」菜单 |
| `storage` | 保存语速、引擎、语言等设置 |
| `activeTab` / `scripting` | 在当前页注入朗读播放器 |
| `<all_urls>` | 仅当用户启用 HTTP/Azure TTS 时发起 API 请求；默认 Web Speech 不依赖外网 |

## 常见问题

**Q: 审核因 broad host permissions 被拒？**  
A: 在审核备注中说明：默认使用 Web Speech，远程请求仅在用户主动配置第三方 TTS 时发生。可考虑后续版本改为 `optional_host_permissions`。

**Q: Alt+R 与网页快捷键冲突？**  
A: 用户可在 `chrome://extensions/shortcuts` 自行修改。
