# 扩展语法边界验收

`参数名`
: **首个释义**与[正常链接](https://example.com)。
: 第二个释义
  续行说明。

普通文本 H~2~SO~4~；原生下标 H^^2^^O；普通上标 X^3^；~~删除线~~；==高亮==。

代码 `H~2~O [[2026-Architecture-Blueprint]] ==原样== [^fake]`。

转义 \~2\~、\[\[2026-Architecture-Blueprint\]\]。

```markdown
伪术语
: 不应变成定义列表
| 不应变成 Verse
H~2~O [[2026-Architecture-Blueprint]] ==原样==
[^fake]: 不应变成脚注
```

|    带缩进的 Verse
|
|    下一行

| A | B |
| --- | --- |
| 1 | 2 |

| 单列 |
| --- |
| 内容 |

同页跳转 [[#目标章节|去本页目标]]，跨文档 [[2026-Architecture-Blueprint#目标章节|去蓝图章节]]。

危险目标 [[javascript:alert(1)|不应成为链接]]，未实现的嵌入 ![[2026-Architecture-Blueprint]]。

文件名边界 [[A~2~==name==|含符号的文件名]]。

引用[^first]，引用[^second]。

## 目标章节

这里是本页跳转目标。

[^first]: 第一条脚注
[^second]: 第二条脚注

<span style="color:#ff4757" onclick="alert(1)">HTML 安全样式</span><script>alert(1)</script>
