// Templates for every diagram detector built into Mermaid 12.3.0.
// Source: Mermaid official syntax examples; aliases share their diagram family.
export const mermaidCatalog = [
  {
    "id": "flowchart",
    "name": "流程图",
    "syntax": "flowchart",
    "detectors": [
      "flowchart-v2"
    ],
    "code": "flowchart LR\n  A[开始] --> B{条件成立？}\n  B -->|是| C[执行操作]\n  B -->|否| D[结束]"
  },
  {
    "id": "flowchart-elk",
    "name": "流程图 · ELK 布局",
    "syntax": "flowchart-elk",
    "detectors": [
      "flowchart-elk"
    ],
    "code": "flowchart-elk LR\n  A[输入] --> B[处理]\n  B --> C[输出]"
  },
  {
    "id": "sequence",
    "name": "时序图",
    "syntax": "sequenceDiagram",
    "detectors": [
      "sequence"
    ],
    "code": "sequenceDiagram\n  actor U as 用户\n  participant S as 服务\n  U->>S: 发送请求\n  S-->>U: 返回结果"
  },
  {
    "id": "class",
    "name": "类图",
    "syntax": "classDiagram",
    "detectors": [
      "classDiagram"
    ],
    "code": "classDiagram\n  class Document {\n    +String title\n    +save()\n  }\n  Workspace \"1\" --> \"many\" Document"
  },
  {
    "id": "state",
    "name": "状态图",
    "syntax": "stateDiagram-v2",
    "detectors": [
      "stateDiagram"
    ],
    "code": "stateDiagram-v2\n  [*] --> 编辑\n  编辑 --> 预览: 渲染完成\n  预览 --> 编辑: 继续修改\n  预览 --> [*]"
  },
  {
    "id": "er",
    "name": "实体关系图",
    "syntax": "erDiagram",
    "detectors": [
      "er"
    ],
    "code": "erDiagram\n    CUSTOMER ||--o{ ORDER : places\n    ORDER ||--|{ ORDER_ITEM : contains\n    PRODUCT ||--o{ ORDER_ITEM : includes\n    CUSTOMER {\n        string id\n        string name\n        string email\n    }\n    ORDER {\n        string id\n        date orderDate\n        string status\n    }\n    PRODUCT {\n        string id\n        string name\n        float price\n    }\n    ORDER_ITEM {\n        int quantity\n        float price\n    }"
  },
  {
    "id": "gantt",
    "name": "甘特图",
    "syntax": "gantt",
    "detectors": [
      "gantt"
    ],
    "code": "gantt\n  title 项目计划\n  dateFormat YYYY-MM-DD\n  section 开发\n  需求分析 :a, 2026-01-01, 3d\n  功能开发 :b, after a, 5d\n  测试验收 :after b, 2d"
  },
  {
    "id": "pie",
    "name": "饼图",
    "syntax": "pie",
    "detectors": [
      "pie"
    ],
    "code": "pie showData title 工作时间\n  \"开发\" : 60\n  \"测试\" : 25\n  \"沟通\" : 15"
  },
  {
    "id": "mindmap",
    "name": "思维导图",
    "syntax": "mindmap",
    "detectors": [
      "mindmap"
    ],
    "code": "mindmap\n  root((项目))\n    需求\n      功能\n      用户\n    实现\n      前端\n      后端\n    测试"
  },
  {
    "id": "timeline",
    "name": "时间线",
    "syntax": "timeline",
    "detectors": [
      "timeline"
    ],
    "code": "timeline\n  title 项目里程碑\n  一月 : 需求分析\n  二月 : 功能开发\n  三月 : 测试上线"
  },
  {
    "id": "gitGraph",
    "name": "Git 分支图",
    "syntax": "gitGraph",
    "detectors": [
      "gitGraph"
    ],
    "code": "gitGraph\n    commit id: \"a3f82c1\"\n    branch develop\n    checkout develop\n    commit id: \"b7e41d9\"\n    commit id: \"c9d52e4\"\n    checkout main\n    merge develop id: \"d4e8f3a\"\n    commit id: \"e1b6c90\"\n    branch feature\n    checkout feature\n    commit id: \"f2a8d17\"\n    commit id: \"a8c3f54\"\n    checkout main\n    merge feature id: \"b9d7e21\""
  },
  {
    "id": "journey",
    "name": "用户旅程图",
    "syntax": "journey",
    "detectors": [
      "journey"
    ],
    "code": "journey\n    title My working day\n    section Go to work\n      Make tea: 5: Me\n      Go upstairs: 3: Me\n      Do work: 1: Me, Cat\n    section Go home\n      Go downstairs: 5: Me\n      Sit down: 5: Me"
  },
  {
    "id": "requirement",
    "name": "需求图",
    "syntax": "requirementDiagram",
    "detectors": [
      "requirement"
    ],
    "code": "requirementDiagram\n\n    requirement rider_safety {\n        id: 1\n        text: Riders must be able to stop safely in all conditions.\n        risk: high\n        verifymethod: test\n    }\n\n    functionalRequirement brake_response {\n        id: 1.1\n        text: Brakes engage within 100 ms of lever pull.\n        risk: medium\n        verifymethod: test\n    }\n\n    performanceRequirement stopping_distance {\n        id: 1.2\n        text: Stop from 25 km/h within 4 m on dry pavement.\n        risk: medium\n        verifymethod: demonstration\n    }\n\n    designConstraint water_resistance {\n        id: 1.3\n        text: Brake electronics must be IP67 rated.\n        risk: low\n        verifymethod: inspection\n    }\n\n    element brake_controller {\n        type: hardware\n        docRef: \"specs/brake-controller\"\n    }\n\n    element road_test_suite {\n        type: \"test suite\"\n        docRef: \"qa/road-tests\"\n    }\n\n    rider_safety - contains -> brake_response\n    rider_safety - contains -> stopping_distance\n    brake_response - derives -> water_resistance\n    brake_controller - satisfies -> brake_response\n    road_test_suite - verifies -> stopping_distance"
  },
  {
    "id": "c4",
    "name": "C4 架构图",
    "syntax": "C4Context",
    "detectors": [
      "c4"
    ],
    "code": "C4Context\n  title 系统上下文\n  Person(user, \"用户\", \"使用系统的人\")\n  System(app, \"应用系统\", \"提供业务功能\")\n  System_Ext(mail, \"邮件服务\", \"发送通知\")\n  Rel(user, app, \"使用\")\n  Rel(app, mail, \"发送通知\")"
  },
  {
    "id": "quadrantChart",
    "name": "象限图",
    "syntax": "quadrantChart",
    "detectors": [
      "quadrantChart"
    ],
    "code": "quadrantChart\n    title Reach and engagement of campaigns\n    x-axis Low Reach --> High Reach\n    y-axis Low Engagement --> High Engagement\n    quadrant-1 We should expand\n    quadrant-2 Need to promote\n    quadrant-3 Re-evaluate\n    quadrant-4 May be improved\n    Campaign A: [0.3, 0.6]\n    Campaign B: [0.45, 0.23]\n    Campaign C: [0.57, 0.69]\n    Campaign D: [0.78, 0.34]\n    Campaign E: [0.40, 0.34]\n    Campaign F: [0.35, 0.78]"
  },
  {
    "id": "sankey",
    "name": "桑基图",
    "syntax": "sankey-beta",
    "detectors": [
      "sankey"
    ],
    "code": "sankey-beta\n\nSalary,Budget,3000\nFreelance work,Budget,1200\nBudget,Rent,1300\nBudget,Groceries,600\nBudget,Transport,250\nBudget,Fun,350\nBudget,Savings,1700"
  },
  {
    "id": "xychart",
    "name": "XY 图表",
    "syntax": "xychart-beta",
    "detectors": [
      "xychart"
    ],
    "code": "xychart-beta\n    title \"Sales Revenue\"\n    x-axis [jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec]\n    y-axis \"Revenue (in $)\" 4000 --> 11000\n    bar [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]\n    line [5000, 6000, 7500, 8200, 9500, 10500, 11000, 10200, 9200, 8500, 7000, 6000]"
  },
  {
    "id": "block",
    "name": "块图",
    "syntax": "block-beta",
    "detectors": [
      "block"
    ],
    "code": "block-beta\n  columns 3\n  user((\"User\")):3\n  space:3\n  ui[\"Web UI\"] api[\"API Server\"] db[(\"Database\")]\n\n  user --> ui\n  ui --> api\n  api --> db\n\n  style user fill:#ffe0b2,stroke:#fb8c00\n  style db fill:#bbdefb,stroke:#1e88e5"
  },
  {
    "id": "packet",
    "name": "数据包图",
    "syntax": "packet",
    "detectors": [
      "packet"
    ],
    "code": "packet\n  title 数据包结构\n  0-15: \"源端口\"\n  16-31: \"目标端口\"\n  32-63: \"序列号\""
  },
  {
    "id": "kanban",
    "name": "看板",
    "syntax": "kanban",
    "detectors": [
      "kanban"
    ],
    "code": "kanban\n  待处理\n    [需求分析]\n    [界面设计]\n  进行中\n    [功能开发]\n  已完成\n    [项目初始化]"
  },
  {
    "id": "architecture",
    "name": "系统架构图",
    "syntax": "architecture-beta",
    "detectors": [
      "architecture"
    ],
    "code": "architecture-beta\n    group api(cloud)[API]\n\n    service db(database)[Database] in api\n    service disk1(disk)[Storage] in api\n    service disk2(disk)[Storage] in api\n    service server(server)[Server] in api\n\n    db:L -- R:server\n    disk1:T -- B:server\n    disk2:T -- B:db"
  },
  {
    "id": "radar",
    "name": "雷达图",
    "syntax": "radar-beta",
    "detectors": [
      "radar"
    ],
    "code": "radar-beta\n  title Frontend Framework Comparison\n  axis perf[\"Performance\"], dx[\"Dev Experience\"], eco[\"Ecosystem\"]\n  axis learn[\"Easy to Learn\"], docs[\"Documentation\"]\n\n  curve react[\"React\"]{4, 4, 5, 3, 4}\n  curve vue[\"Vue\"]{4, 5, 4, 4, 5}\n  curve svelte[\"Svelte\"]{5, 5, 3, 4, 4}\n\n  graticule polygon\n  max 5\n  min 0"
  },
  {
    "id": "treemap",
    "name": "矩形树图",
    "syntax": "treemap-beta",
    "detectors": [
      "treemap"
    ],
    "code": "treemap-beta\n\"项目预算\"\n  \"开发\": 60\n  \"测试\": 25\n  \"运维\": 15"
  },
  {
    "id": "venn",
    "name": "韦恩图",
    "syntax": "venn-beta",
    "detectors": [
      "venn"
    ],
    "code": "venn-beta\n    title \"Finding the Product Sweet Spot\"\n    set Desirable\n    set Feasible\n    set Viable\n    union Desirable,Feasible[\"Worth prototyping\"]\n    union Feasible,Viable[\"Cheap to run\"]\n    union Desirable,Viable[\"Hard to build\"]\n    union Desirable,Feasible,Viable[\"Sweet spot\"]"
  },
  {
    "id": "ishikawa",
    "name": "鱼骨图",
    "syntax": "ishikawa-beta",
    "detectors": [
      "ishikawa"
    ],
    "code": "ishikawa-beta\n    Blurry Photo\n    Process\n        Out of focus\n        Shutter speed too slow\n        Protective film not removed\n        Beautification filter applied\n    User\n        Shaky hands\n    Equipment\n        LENS\n            Inappropriate lens\n            Damaged lens\n            Dirty lens\n        SENSOR\n            Damaged sensor\n            Dirty sensor\n    Environment\n        Subject moved too quickly\n        Too dark"
  },
  {
    "id": "wardley",
    "name": "Wardley 地图",
    "syntax": "wardley-beta",
    "detectors": [
      "wardley"
    ],
    "code": "wardley-beta\ntitle Tea Shop\nsize [1100, 800]\n\nanchor Business [0.95, 0.63]\nanchor Public [0.95, 0.78]\ncomponent Cup of Tea [0.79, 0.61] label [19, -4]\ncomponent Cup [0.73, 0.78]\ncomponent Tea [0.63, 0.81]\ncomponent Hot Water [0.52, 0.80]\ncomponent Water [0.38, 0.82]\ncomponent Kettle [0.43, 0.35] label [-57, 4]\ncomponent Power [0.1, 0.7] label [-27, 20]\n\nBusiness -> Cup of Tea\nPublic -> Cup of Tea\nCup of Tea -> Cup\nCup of Tea -> Tea\nCup of Tea -> Hot Water\nHot Water -> Water\nHot Water -> Kettle\nKettle -> Power\n\nevolve Kettle 0.62\nevolve Power 0.89\n\nnote \"Standardising power allows Kettles to evolve faster\" [0.30, 0.49]\nnote \"Hot water is obvious and well known\" [0.48, 0.80]\nnote \"A generic note appeared\" [0.23, 0.33]"
  },
  {
    "id": "cynefin",
    "name": "Cynefin 决策图",
    "syntax": "cynefin-beta",
    "detectors": [
      "cynefin"
    ],
    "code": "cynefin-beta\ntitle Optional Diagram Title\n\ncomplex\n\"Item label\"\n\"Another item\"\n\ncomplicated\n\"Expert analysis needed\"\n\nclear\n\"Known procedure\"\n\nchaotic\n\"Crisis response\"\n\nconfusion\n\"Item of unknown domain\"\n\ncomplex --> complicated : \"Pattern identified\"\nclear --> chaotic : \"Complacency\""
  },
  {
    "id": "treeView",
    "name": "树状目录图",
    "syntax": "treeView-beta",
    "detectors": [
      "treeView"
    ],
    "code": "treeView-beta\n            my-project/\n                src/\n                    components/\n                        Button.tsx\n                        Header.tsx\n                    App.tsx\n                    index.js\n                .gitignore\n                package.json\n                README.md"
  },
  {
    "id": "swimlane",
    "name": "泳道图",
    "syntax": "swimlane-beta",
    "detectors": [
      "swimlane"
    ],
    "code": "swimlane-beta LR\n  subgraph Customer\n    Browse[Browse catalogue]\n    Pay[Pay]\n  end\n  subgraph Warehouse\n    Pick[Pick items]\n    Ship[Ship order]\n  end\n  subgraph Finance\n    Invoice[Raise invoice]\n  end\n  Browse --> Pay\n  Pay --> Pick\n  Pick --> Ship\n  Pay --> Invoice"
  },
  {
    "id": "usecase",
    "name": "用例图",
    "syntax": "usecase-beta",
    "detectors": [
      "usecase"
    ],
    "code": "usecase-beta\nactor User(\"User\")\nactor Admin(\"Administrator\")\nLogin(\"Log in\")\nViewProfile(\"View profile\")\nManageUsers(\"Manage users\")\nViewReports(\"View reports\")\nUser --> Login\nUser --> ViewProfile\nAdmin --> ManageUsers\nAdmin --> ViewReports"
  },
  {
    "id": "eventmodeling",
    "name": "事件建模图",
    "syntax": "eventmodeling",
    "detectors": [
      "eventmodeling"
    ],
    "code": "eventmodeling\n\ntf 01 ui ShopUI\ntf 02 cmd AddItemToCart\ntf 03 evt ItemAdded\ntf 04 rmo CartView ->> 03\ntf 05 ui CheckoutUI\ntf 06 cmd PlaceOrder\ntf 07 evt OrderPlaced\ntf 08 rmo OrderStatus ->> 07"
  },
  {
    "id": "agentflow",
    "name": "Agent 流程图",
    "syntax": "agentflow-beta",
    "detectors": [
      "agentflow"
    ],
    "code": "agentflow-beta TB\n  flow reviewer[\"Review Agent\"]\n    changes[\"Gather changes\"]@{ shape: input }\n    analyse[\"Analyse diff\"]@{ shape: task }\n    lint[\"run_linter\"]@{ shape: tool }\n    ok[\"Clean?\"]@{ shape: decision }\n\n    changes --> analyse --> lint --> ok\n  end"
  },
  {
    "id": "railroad",
    "name": "语法铁路图",
    "syntax": "railroad-beta",
    "detectors": [
      "railroad"
    ],
    "code": "railroad-beta\n  title 表达式语法\n  expression = sequence(nonterminal(\"number\"), terminal(\"+\"), nonterminal(\"number\")) ;\n  number = choice(terminal(\"1\"), terminal(\"2\"), terminal(\"3\")) ;"
  },
  {
    "id": "railroadEbnf",
    "name": "铁路图 · EBNF",
    "syntax": "railroad-ebnf-beta",
    "detectors": [
      "railroadEbnf"
    ],
    "code": "railroad-ebnf-beta\n  title \"数字语法\"\n  digit = \"0\" | \"1\" | \"2\" | \"3\" ;"
  },
  {
    "id": "railroadAbnf",
    "name": "铁路图 · ABNF",
    "syntax": "railroad-abnf-beta",
    "detectors": [
      "railroadAbnf"
    ],
    "code": "railroad-abnf-beta\n  title \"数字语法\"\n  digit = \"0\" / \"1\" / \"2\" / \"3\" ;"
  },
  {
    "id": "railroadPeg",
    "name": "铁路图 · PEG",
    "syntax": "railroad-peg-beta",
    "detectors": [
      "railroadPeg"
    ],
    "code": "railroad-peg-beta\n  title \"数字语法\"\n  Digit <- \"0\" / \"1\" / \"2\" / \"3\" ;"
  },
  {
    "id": "info",
    "name": "Mermaid 版本信息",
    "syntax": "info",
    "detectors": [
      "info"
    ],
    "code": "info"
  }
];

export function mermaidSnippet(id) {
  const item = mermaidCatalog.find((entry) => entry.id === id);
  return item ? `\x60\x60\x60mermaid\n${item.code}\n\x60\x60\x60\n` : null;
}

export const commonMermaidCatalog = ['flowchart', 'sequence', 'class', 'state', 'pie', 'mindmap', 'er', 'kanban', 'architecture']
  .map((id) => mermaidCatalog.find((item) => item.id === id));
