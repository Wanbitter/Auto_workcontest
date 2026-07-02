# 📝 智能题库测试系统

本app基于python-flask开发的智能文本题库系统，方便各位拿到文本类题库时方便自测。

**作者：Wanbitter**

---

## 📋 目录

- [✨ 功能特点](#-功能特点)
- [🚀 使用方法](#-使用方法)
  - [方法一：下载 exe（推荐）](#方法一下载可执行文件推荐无需安装-python)
  - [方法二：源码运行](#方法二从源代码运行需要-python-环境)
- [📁 项目结构](#-项目结构)
- [📄 文档格式要求](#-文档格式要求)
- [⚙️ 技术栈](#-技术栈)
- [📝 协议](#-协议)

---

## ✨ 功能特点

- 📄 **上传 Word 文档**（支持 .doc 和 .docx）自动识别题目
- 🎯 **三种题型识别**：选择题、判断题、填空题/简答题
- 🔀 **两种测试模式**：全测试 / 部分测试（自定义各题型数量）
- 📑 **两种顺序**：原文顺序 / 随机乱序（按题型分组，不混题）
- 📋 **侧边题号面板**：按 `Tab` 键呼出，点击题号跳转
- ✅ **即时判题**：
  - 选择/判断正确 → 显示 **AC** → 1秒自动跳下一题
  - 选择/判断错误 → 显示 **WA** + 正确答案
  - 填空题 → 显示 **文本匹配率%**，100%才显示AC
  - 多选题 → 全部选对才显示AC
- 🏠 **完全离线**：本地运行，无需联网

---

## 🚀 使用方法

### 方法一：下载可执行文件（推荐，无需安装 Python）

1. 前往本仓库的 **[Releases 页面](https://github.com/Wanbitter/Auto_workcontest/releases)** 下载最新版本
2. 解压到任意文件夹
3. 双击 **`启动.exe`**，自动打开浏览器使用

> ⚠️ 如果被杀毒软件拦截，请添加信任（PyInstaller 打包的单文件 exe 可能会有误报）

[↑ 返回目录](#-目录)

### 方法二：从源代码运行（需要 Python 环境）

#### 环境要求

- Python 3.8+
- Windows 系统（需要安装 Microsoft Word 以支持 .doc 格式转换）

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

然后打开浏览器访问 [http://127.0.0.1:5000](http://127.0.0.1:5000)

#### 一键启动（Windows）

直接双击 **`start.bat`** 即可，会自动启动服务并打开浏览器。

> 💡 也可以直接打开 `auto_workcontest` 文件夹，找到 `start.bat` 双击运行

[↑ 返回目录](#-目录)

---

## 📁 项目结构

```
Auto_workcontest/
├── app.py              # Flask 后端
├── doc_parser.py       # 文档解析器
├── convert_doc.py      # .doc → .docx 转换
├── start.bat           # 一键启动脚本
├── start.vbs           # 静默启动脚本
├── requirements.txt    # Python 依赖
├── README.md           # 本说明文档
├── templates/
│   └── index.html      # 前端页面
└── static/
    ├── css/
    │   └── style.css   # 样式文件
    └── js/
        └── main.js     # 前端交互逻辑
```

[↑ 返回目录](#-目录)

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

[↑ 返回目录](#-目录)

---

## 📝 更新日志

### [v1.0.0] - 2025-07-02

#### 新增
- 支持上传 `.doc` / `.docx` 格式的 Word 文档
- 自动识别三种题型：选择题、判断题、填空题/简答题
- 两种测试模式：全部测试 / 部分测试（自定义各题型数量）
- 两种题目顺序：原文顺序 / 随机乱序（按题型分组，不混题）
- 侧边题号面板（按 `Tab` 键呼出，点击题号跳转）
- 即时判题反馈：AC/WA 显示、文本匹配率、多选题评分
- 完全离线运行，无需联网

#### 修复
- 修复内联选项拆分丢失 A 选项的问题
- 改进答案提取逻辑，修复控制台 GBK 编码错误

[↑ 返回目录](#-目录)

---

## ⚙️ 技术栈

- **后端**: [Python Flask](https://flask.palletsprojects.com/)
- **前端**: 原生 HTML + CSS + JavaScript
- **文档解析**: [python-docx](https://python-docx.readthedocs.io/)
- **格式转换**: pywin32 (调用 Microsoft Word COM)

[↑ 返回目录](#-目录)

---

## 📝 协议

本项目仅供学习交流使用。

---

> 📌 **项目地址**: [https://github.com/Wanbitter/Auto_workcontest](https://github.com/Wanbitter/Auto_workcontest)
>
> 如果你觉得这个工具有用，欢迎 ⭐ Star 支持！