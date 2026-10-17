# 本地发布文件

`current/` 只保留当前可安装版本，便于本机快速安装和测试。历史版本发布到 GitHub Releases，不在源码目录长期堆积。

该目录中的二进制文件不纳入 Git；构建新版本后，用新的 Windows 安装版、Windows 免安装版和 Android 平板版替换旧文件。
