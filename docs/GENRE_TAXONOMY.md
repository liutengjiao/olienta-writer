# 小说类型分类当前版本

当前支持 Olienta 的中英文小说类型分类，用于“小说配置”。当前产品口径统一使用“文学定位 / 网络文学男频 / 网络文学女频”，不在界面中使用平台名作为分类名称。

## 严肃文学 / 文学小说

当前版本按小说类型与文学传统整理，包括：现实主义小说、历史小说、心理小说、成长小说、世情小说、流浪汉小说、书信体小说、哥特小说、魔幻现实主义、实验小说。

参考来源：Britannica 的 novel 条目列出 historical、picaresque、sentimental、Gothic、psychological、novel of manners、epistolary、pastoral、roman a clef、antinovel、detective、mystery、thriller、western、fantasy、proletarian 等小说类型；其 Types of novel 页面也单列 Historical、Picaresque、Gothic、Psychological 等类型。

## 网络文学男频 / 商业长篇

当前版本按主流中文网络文学男频分类整理：玄幻、奇幻、武侠、仙侠、都市、现实、军事、历史、游戏、体育、科幻、诸天无限、悬疑、轻小说、短篇。

## 网络文学女频 / 女性向

当前版本按主流中文网络文学女频分类整理：古代言情、仙侠奇缘、现代言情、浪漫青春、玄幻言情、悬疑推理、短篇、科幻空间、游戏竞技、轻小说、现实生活。

## 使用原则

- 分类只辅助配置，不限制作者写法。
- 一个作品可以同时拥有文学小说定位、网络文学男频分类和网络文学女频分类。
- 后续蓝图、Skill、AI 提示词都可以读取这些分类，但不得覆盖作者确认内容。
- 分类名称使用通用网文口径，不把作品绑定到某一个平台。

## 存储兼容

当前版本本地项目已经使用 `.olienta/genre-profile.json` 保存类型配置。为避免破坏已有项目，底层字段名暂保留 `qidianMale`、`qidianFemale` 作为兼容字段；界面、文档和 AI 提示词统一显示为“网络文学男频”“网络文学女频”。
