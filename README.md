# 🎬 LayerMotion · 图层动画 Meme工具

上传分层的透明 PNG（或 PSD），逐层设置运动方式，一键导出会动的 GIF / MP4 表情包。

**🌐 在线使用：** https://tosherry2025-spec.github.io/layermotion/

---

## ✨ 特性

- **多来源导入**：拖入分层 PSD（浏览器内直接解析）或上传多张透明 PNG
- **协调的动画模型**：整体动作（呼吸 / 弹跳 / 摇摆）全身同一拍，天生协调
- **每层精调**：叠加效果（飘逸 / 摆动 / Q弹 / 颤动 / 稳住）、运动幅度、初始方向，全部锁定同一节拍，永不失步
- **自定义锚点**：画布上拖动即可设定每层的旋转 / 缩放中心
- **伪 3D 视差**：按图层深度平移，支持自动摆动与鼠标跟随
- **导出**：GIF（支持透明背景）与 MP4 视频，纯浏览器内合成
- **隐私优先**：图片只在你自己的浏览器里处理，从不上传服务器

## 🛠️ 技术栈

- 原生 HTML / CSS / JavaScript，无框架
- Canvas 2D 渲染引擎（保证预览与导出像素级一致）
- [ag-psd](https://github.com/Agamnentzar/ag-psd) 浏览器内解析 PSD
- [gif.js](https://github.com/jnordberg/gif.js) 合成 GIF；`MediaRecorder` 录制 MP4 / WebM

## 🚀 本地运行

```bash
# 任意静态服务器即可，例如：
python -m http.server 8123
# 打开 http://localhost:8123/webapp/
```

## 🌸 联系作者

- 小红书：[koguko_ring（空谷呤）](https://xhslink.com/m/2SDL0vkKJ2P) · 小红书号 `6853602693`
- 有 bug 反馈、功能建议或想催更，欢迎来小红书找我～

## 📄 许可

**保留所有权利（All Rights Reserved）· 非开源。**
本项目为作者专有作品，未经书面许可禁止复制、修改、再发布或二次创作。详见 [`LICENSE`](LICENSE)。
如需授权或合作，请通过小红书联系作者 koguko_ring（空谷呤）。
