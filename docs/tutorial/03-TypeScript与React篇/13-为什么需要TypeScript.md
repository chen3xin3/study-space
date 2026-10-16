---
title: "第 13 章：为什么需要 TypeScript"
chapter: 13
stage: "TypeScript、Vite 与 React篇"
status: "可学习"
estimated_minutes: 180
prerequisites: [10, 11, 12]
last_verified: "2026-10-14"
project_version: "0.6.0"
knowledge_type: "通用知识 + 项目当前实现"
---

# 第 13 章：为什么需要 TypeScript

## 本章目标

学完后，你能够：

1. 解释 JavaScript 和 TypeScript 的关系；
2. 区分运行时错误与类型检查错误；
3. 看懂字符串、数字、布尔值、数组和对象类型；
4. 理解类型推断，不重复标注显而易见的类型；
5. 使用 type、interface、联合类型和可选属性；
6. 根据错误找到“实际类型”和“期望类型”；
7. 建立一条带严格类型的学习任务；
8. 运行类型检查与任务模型测试；
9. 在真实项目中找到 LearningItem 类型。

## 开始前需要会什么

- 已完成第 10～12 章；
- 能读懂 JavaScript 变量、对象、数组和函数；
- 知道测试应先失败、实现后再通过；
- 会在项目根目录运行 npm 命令；
- 不需要提前学会 React。

本章只修改独立教学实验，不修改“学习空间”生产源码。

## 新术语表

| 术语 | 普通话解释 |
| --- | --- |
| TypeScript | 在 JavaScript 上增加静态类型检查的语言 |
| 类型 | 描述一个值允许是什么形状、包含什么内容 |
| 静态检查 | 代码运行前分析可能的类型错误 |
| 运行时 | 程序真正执行时所处的阶段 |
| 编译器 | 读取源码、检查并转换代码的工具 |
| 类型注解 | 开发者明确写出的类型说明 |
| 类型推断 | 编译器根据已有值自动判断类型 |
| interface | 描述对象必须有哪些属性 |
| type alias | 给一种类型结构起名字 |
| 联合类型 | 一个值只能是若干候选类型之一 |
| 字面量类型 | 把具体文字或数字本身当作允许值 |
| 可选属性 | 可能存在，也可能不存在的字段 |
| 严格模式 | 开启更完整类型检查的一组设置 |
| any | 放弃大部分类型检查的逃生口 |
| unknown | 还不知道类型，判断以后才能使用的安全类型 |

## 先建立直觉

JavaScript 允许代码直接运行，很多问题要等实际走到某一行才暴露。TypeScript 像运行前的检查员：你先声明标题必须是文字、科目只能是几个候选值、完成状态必须是真或假，之后传错内容，编辑器和检查命令会提前指出矛盾。

TypeScript 不会取代 JavaScript。浏览器最终执行的仍是 JavaScript，类型主要在开发阶段帮助补全、重构和检查。

类型也不能证明业务绝对正确。类型正确的计时器仍可能算错，类型正确的请求仍可能断网。因此类型检查、运行时校验和自动测试必须配合。

## 图解

~~~mermaid
flowchart LR
    A[TypeScript 或 TSX 源码] --> B[类型检查]
    B -->|发现矛盾| C[报告错误]
    B -->|检查通过| D[Vite 转换为 JavaScript]
    D --> E[浏览器执行]
    E --> F[界面与运行时行为]
~~~

| 情况 | 类型能提前发现吗 | 还需要什么 |
| --- | --- | --- |
| 数字传给字符串参数 | 通常能 | 修正定义或调用 |
| 科目写成未允许的文字 | 能 | 使用允许值或正式扩展模型 |
| 网络突然断开 | 不能预测 | 错误状态与重试 |
| 完成数量算法写反 | 类型可能仍正确 | 自动测试 |
| 外部 JSON 缺字段 | 声明类型不能保证 | 运行时校验 |

## 跟我一步一步做

### 第一步：运行严格类型检查

在项目根目录运行：

    npm exec tsc -- -p docs/tutorial/labs/react-basics/tsconfig.json

没有输出并返回提示符表示检查通过，不是“没有运行”。

### 第二步：观察类型推断

在自己的临时练习文件输入：

    const title = "整理阅读错题";
    const minutes = 30;
    const completed = false;

把鼠标停在变量名上，编辑器会推断字符串、数字和布尔值。右侧值已经清楚时，无须重复注解。

### 第三步：给函数边界写类型

    function makeSummary(title: string, minutes: number): string {
      return title + " · " + minutes + " 分钟";
    }

正确调用：

    makeSummary("整理阅读错题", 30);

故意把 30 写成 "30"，检查器会报告 string 不能赋给 number。阅读错误时先找：

1. 实际提供了什么类型；
2. 目标位置要求什么类型。

### 第四步：描述对象

课程任务类型位于 [task.ts](../labs/react-basics/src/domain/task.ts)：

    export interface StudyTask {
      id: string;
      title: string;
      subject: StudySubject;
      completed: boolean;
    }

它说明一条任务必须有四个字段。少字段、名称拼错或值类型错误都会被检查。

### 第五步：限制科目候选值

    export type StudySubject =
      | "英语"
      | "数学"
      | "政治"
      | "专业课"
      | "其他";

这不是任意字符串，而是五个字面量的联合。把“物理”赋给 StudySubject 会报错。如果产品以后正式增加物理，应同步修改模型、界面和测试，而不是强制骗过检查器。

### 第六步：让类型和业务规则配合

    export function createTask(
      id: string,
      title: string,
      subject: StudySubject,
    ): StudyTask {
      const normalizedTitle = title.trim();

      if (!normalizedTitle) {
        throw new Error("任务标题不能为空");
      }

      return {
        id,
        title: normalizedTitle,
        subject,
        completed: false,
      };
    }

类型约束形状；运行时代码负责“空标题不能保存”的业务规则。

### 第七步：运行自动测试

    npm run test:run -- docs/tutorial/labs/react-basics/src/domain/task-operations.test.ts

预期一个测试文件、5 项测试通过。

## 完整示例

本章参考文件：

- [任务类型](../labs/react-basics/src/domain/task.ts)
- [纯任务操作](../labs/react-basics/src/domain/task-operations.ts)
- [任务操作测试](../labs/react-basics/src/domain/task-operations.test.ts)
- [严格 TypeScript 配置](../labs/react-basics/tsconfig.json)

函数边界分别说明：

- createTask 接收 ID、标题、科目，返回 StudyTask；
- toggleTask 接收任务数组和 ID，返回新数组；
- filterTasks 接收任务数组和 TaskFilter，返回筛选后的新数组。

只看这些签名就能知道如何调用，不必先阅读内部实现。

## 逐段解释

### 基础类型

    const title: string = "复习";
    const minutes: number = 30;
    const completed: boolean = false;

使用小写 string、number、boolean，不使用包装对象 String、Number、Boolean。

### 数组类型

    const first: StudyTask[] = [];
    const second: Array<StudyTask> = [];

两种写法等价。下一章会用第二种解释泛型。

### type 与 interface

本课程约定：

- 对象结构优先使用 interface；
- 联合类型、别名和组合使用 type。

它们的能力有重叠。初学阶段先保持项目一致，不必争论谁永远更好。

### 可选属性

    interface TaskNote {
      text: string;
      source?: string;
    }

问号表示 source 可以不存在。不要为了消除错误把所有字段都改成可选；真正必需的数据应保持必需。

### 类型推断与明确注解

初始值明显时依赖推断；函数参数、公共返回结构、组件 props 和服务接口应明确。目标不是写最多类型，而是在边界表达约定。

### 类型不会检查外部真实数据

把外部数据强制写成 StudyTask 只是告诉检查器你的愿望，不会验证数据。网络、文件、AI 返回和数据库边界仍需运行时校验。滥用断言会关闭保护。

### 为什么不使用 any

any 允许几乎任何操作，错误会继续传播。未知外部值优先使用 unknown，判断以后再读取。下一章会专门练习。

## 运行并观察

### 制造一个类型错误

在练习副本临时调用：

    createTask("task-1", "复习", "物理");

运行类型检查，记录完整错误，然后改回允许科目并确认错误消失。

### 观察编辑器补全

输入：

    const task: StudyTask = {

观察编辑器建议四个必需字段。补全来自类型结构，不是编辑器猜测业务。

### 观察类型检查与测试分工

把 completed 写成字符串，类型检查失败；把筛选逻辑写反，类型可能通过，但测试失败。

### 观察构建顺序

真实项目的 npm run build 先执行 TypeScript 检查，再进行 Vite 构建。类型错误应在生成发布资源前被拦截。

## 常见错误与修复

### 以为 TypeScript 会被浏览器直接执行

浏览器运行转换后的 JavaScript，开发环境由 Vite处理 TypeScript 和 TSX。

### 给所有变量重复标注

右侧值清楚时用推断，把明确注解留在函数和模块边界。

### 遇到错误就使用 any

先阅读实际类型与期望类型。any 会让错误失去检查，不是修复。

### 联合类型不接受普通字符串

表单 value 往往是普通字符串。应在受控选项边界校验，不能随意断言。

### 对象缺少字段

判断字段是真正必需、可选，还是创建阶段需要单独输入类型。不要一律加问号。

### 类型通过但页面仍报错

类型不处理断网、空 DOM、错误算法和外部脏数据。继续检查 Console、Network 和测试。

### CSS 导入找不到类型

Vite 项目通过 [vite-env.d.ts](../labs/react-basics/src/vite-env.d.ts) 声明资源导入环境。

## 在“学习空间”项目里找到它

真实学习资料类型位于：

- [learning-item.types.ts](../../../src/services/learning-items/learning-item.types.ts)

其中包含 LearningItemKind、LearningItem、LearningItemDraft、LearningItemQuery 和 LearningItemService。

先只回答：

1. 哪些字段每条资料都必须有？
2. 哪些字段可选？
3. 哪些字段只能是固定候选值？

不要修改生产文件。本章目标是读懂类型。

## 必做练习

### 练习一：判断类型

预测 course、round、paused 和 tags 的类型：

    const course = "英语";
    const round = 4;
    const paused = true;
    const tags = ["阅读", "错题"];

### 练习二：定义资料卡

定义 MaterialCard：必需 id、title；科目只能英语或数学；note 可选；favorite 必须是布尔值。

### 练习三：修复缺失字段

下面对象缺少什么？为什么不应简单把该字段改成可选？

    const task: StudyTask = {
      id: "1",
      title: "复习",
      subject: "英语",
    };

### 练习四：类型与业务规则

说明为什么 title: string 仍不能阻止空字符串，以及课程在哪里处理空标题。

### 练习五：记录运行证据

运行类型检查与任务测试，记录完整命令、退出结果和通过数量。

## 选做挑战

在练习副本增加可选 plannedDate: string。思考普通字符串也允许“明天”，若业务要求 YYYY-MM-DD，仅靠 string 是否足够？提出运行时校验方案，不修改正式实验模型。

## 答案与思路

### 练习一

course 是字符串值，round 是 number，paused 是 boolean，tags 是 string 数组。编辑器有时显示更具体的字面量，重点是可赋值规则。

### 练习二

    interface MaterialCard {
      id: string;
      title: string;
      subject: "英语" | "数学";
      note?: string;
      favorite: boolean;
    }

### 练习三

缺少 completed。当前模型要求每条任务都知道是否完成，应补 completed: false。改为可选会把“不知道是否完成”的复杂度传播到所有读取位置。

### 练习四

空字符串仍是字符串。createTask 在 trim 后检查空值并抛出“任务标题不能为空”。

### 练习五

类型检查无输出且退出成功；Vitest 应显示一个文件、5 项测试通过。结果不同时保存完整错误，不只写“失败”。

## 本章自检

- [ ] 我能解释 TypeScript 和 JavaScript 的关系；
- [ ] 我能区分类型错误与运行时错误；
- [ ] 我知道何时依赖推断、何时写注解；
- [ ] 我能定义数组和对象类型；
- [ ] 我能用字符串联合限制候选值；
- [ ] 我知道可选属性不能滥用；
- [ ] 我没有用 any 压掉错误；
- [ ] 我运行了严格类型检查；
- [ ] 我运行了 5 项任务测试；
- [ ] 我找到了真实 LearningItem 类型。

## 本章小结

TypeScript 是带静态类型检查的 JavaScript 开发方式。类型把对象形状、函数输入输出和允许值写成明确约定，帮助工具在运行前发现矛盾。它不能代替业务验证、错误处理和测试，但能让这些边界更清楚。

## 下一章

下一章学习泛型、类型缩小、Pick、Partial 和 unknown。它们会围绕一个实际目标展开：定义“页面可以调用、实现可以替换”的任务服务接口。

继续：[第 14 章：泛型、类型缩小与实用类型](14-泛型类型缩小与实用类型.md)
