# 📝 智能题库测试系统

本app基于python-flask开发的智能文本题库系统，方便各位拿到文本类题库时方便自测。

**作者：Wanbitter**

---

## ✨ 功能特点

- 📄 **上传 Word 文档**（支持 .doc 和 .docx）自动识别题目
- 🎯 **三种题型识别**：选择题、判断题、填空题/简答题
- 🔀 **两种测试模式**：全测试 / 部分测试（自定义各题型数量）
- 📑 **两种顺序**：原文顺序 / 随机乱序（按题型分组，不混题）
- 📋 **侧边题号面板**：按 Tab 键呼出，点击题号跳转
- ✅ **即时判题**：
  - 选择/判断正确 → 显示 **AC** → 1秒自动跳下一题
  - 选择/判断错误 → 显示 **WA** + 正确答案
  - 填空题 → 显示 **文本匹配率%**，100%才显示AC
  - 多选题 → 全部选对才显示AC
- 🏠 **完全离线**：本地运行，无需联网

---

## 🚀 使用方法

### 方法一：直接下载可执行文件（推荐，无需安装 Python）

1. 前往 **[Releases](https://github.com/Wanbitter/Auto_workcontest/releases)** 页面
2. 下载最新版本的 `智能题库测试系统.zip`
3. 解压到任意文件夹
4. 双击 **`启动.exe`**，自动打开浏览器使用

> ⚠️ 如果被杀毒软件拦截，请添加信任。因为这是用 PyInstaller 打包的独立 exe。

### 方法二：从源代码运行（需要 Python 环境）

#### 环境要求

- Python 3.8+
- Windows 系统（因为使用了 pywin32 转换 .doc 文件）

#### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/Wanbitter/Auto_workcontest.git
cd Auto_workcontest

# 2. 安装依赖
pip install flask python-docx pywin32

# 3. 启动
python app.py
```

然后打开浏览器访问 http://127.0.0.1:5000

#### 一键启动（Windows）

直接双击 **`start.bat`** 即可，会自动启动服务并打开浏览器。

---

## 📁 项目结构

```
Auto_workcontest/
├── app.py              # Flask 后端
├── doc_parser.py       # 文档解析器
├── convert_doc.py      # .doc → .docx 转换
├── start.bat           # 一键启动脚本
├── templates/
│   └── index.html      # 前端页面
└── static/
    ├── css/style.css   # 样式
    └── js/main.js      # 前端交互
```

---

## 📄 文档格式要求

系统能自动识别以下格式的题目：

### 选择题
```
1. 题目内容（ ）
A. 选项A
B. 选项B
C. 选项C
D. 选项D
正确答案：A
```

### 判断题
```
1. 题目内容
正确答案：√
```

### 简答题/填空题
```
1. 题目内容
答：答案内容
```

---

## ⚙️ 技术栈

- **后端**: Python Flask
- **前端**: 原生 HTML + CSS + JavaScript
- **文档解析**: python-docx
- **格式转换**: pywin32 (调用 Word COM)

---

## 📝 协议

本项目仅供学习交流使用。